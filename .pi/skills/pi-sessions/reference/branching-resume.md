# Branching, Resume, and Fork

How pi turns CLI flags and runtime commands into `SessionManager` instances, how the entry tree branches in place, and the difference between branching and forking. All cites against pi-mono at the current pin (`v0.87.1`, `f07218c4`).

## CLI flag → SessionManager dispatch

All flag parsing in `packages/coding-agent/src/cli/args.ts` (session flags at `:110-140`). All dispatch in `packages/coding-agent/src/main.ts:createSessionManager` (`:357-448`). Re-derived at `v0.87.1` on 2026-09-22 — the previous table's `main.ts` numbers came from an older layout of this function.

| CLI flag | Parsed at | SessionManager call | Result |
|---|---|---|---|
| (none) | — | `SessionManager.create(cwd, sessionDir, { id })` (`src/main.ts:447`) | Brand-new session file under `<agentDir>/sessions/<encoded-cwd>/`. |
| `--continue` / `-c` | `args.ts:110-111` | `SessionManager.continueRecent(cwd, sessionDir)` (`src/main.ts:431-433`) | Most recent `*.jsonl` in the cwd's session dir (`session-manager.ts:1790-1798`, helper `findMostRecentSession` at `:749`). Since 0.86.0 candidates are checked **header-first in mtime order, stopping at the newest match** instead of reading every file. Falls back to `create` semantics if none exist. |
| `--resume` / `-r` | `args.ts:112-113` | Interactive picker → `SessionManager.open(selectedPath, sessionDir)` (`src/main.ts:414-425`) | Opens the `selectSession` UI, fed by `SessionManager.list` / `listAll`. Since 0.86.0 results appear progressively and outstanding transcript reads are cancelled after selection. `stopThemeWatcher` runs in the `finally` (`:427`). |
| `--session <path-or-id>` | `args.ts:133` | `resolveSessionPath` (`src/main.ts:251`). `path` / `local` → `openSessionOrExit` (`:337`, calls `SessionManager.open` at `:339`); `global` (found in another project) → confirm prompt, then `forkSessionOrExit` (`:398-405`); `not_found` → exit 1 (`:408-410`). | Opens an existing session by exact path or short ID. Cross-project finds trigger an interactive fork prompt. |
| `--fork <path-or-id>` | `args.ts:137` | `forkSessionOrExit(resolved.path, cwd, sessionDir, sessionId)` (`src/main.ts:367-386`) → `SessionManager.forkFrom` (`:347-349`) | Creates a **new file** in the current cwd's session dir, preserving full source history. `validateForkFlags` (`src/main.ts:298-312`) rejects combining `--fork` with `--session`, `--continue`, `--resume`, or `--no-session`. |
| `--no-session` | `args.ts:131` | `SessionManager.inMemory(cwd, { id }?)` (`src/main.ts:363-365`) | No file persistence. State lives only in process memory. |
| `--session-dir <path>` | `args.ts:139` | Threaded as the `sessionDir` arg to whichever factory above runs. | Overrides the default `<agentDir>/sessions/<encoded-cwd>/` root for this run. |

⚠ **`<agentDir>`, not `~/.pi/agent`.** The default session root is derived from the agent dir (`getDefaultSessionDirPath(cwd, agentDir)`, `session-manager.ts:589-594`), so a process started with `PI_CODING_AGENT_DIR` writes sessions under *that* dir. On this box the second agent dir symlinks `sessions/` into the live one — see `.pi/kb/agent-dir-farm.md`.


## Static factories — what each one does

All defined on `SessionManager` (`packages/coding-agent/src/core/session-manager.ts`).

| Factory | Lines | Behavior |
|---|---|---|
| `create(cwd, sessionDir?)` | `:1476-1479` | New session, no file written until first append. `sessionDir` defaults to `getDefaultSessionDir(cwd)`. |
| `open(path, sessionDir?, cwdOverride?)` | `:1487-1500` | Reads the file, extracts `cwd` from the header (or accepts `cwdOverride`), uses `dirname(path)` as the implicit `sessionDir` if not supplied. Same file is appended to on subsequent writes. |
| `continueRecent(cwd, sessionDir?)` | `:1507-1515` | Calls `findMostRecentSession(dir)`; falls back to `create`-like behavior (no `mostRecent`). Same file is reused. |
| `inMemory(cwd?, options?, entries?)` | `:1801-1803` | `sessionFile` is empty string, `persisted: false` (`isPersisted()` returns false). All append* methods stay in memory. **`entries?: FileEntry[]` added in 0.85.0** (upstream #8980, "restorable in-memory sessions"): pass previously-captured entries to rehydrate an in-memory session from storage you manage yourself, rather than always starting empty. This is the supported path for a host that persists session state somewhere other than pi's JSONL files. |
| `forkFrom(sourcePath, targetCwd, sessionDir?)` | `:1812-1858` | Reads source, validates header, generates new session id + filename `<iso-ts>_<id>.jsonl`, writes new header with `parentSession: sourcePath` and `cwd: targetCwd`, then copies every non-header entry from source into the new file. Returns a manager pointed at the new file. |

`list(cwd, sessionDir?, onProgress?)` and `listAll(onProgress?)` are also static (referenced in the README but defined in the listing section of the file). They produce `SessionInfo[]` for picker UIs.

## In-place branch vs new-file fork

This is the most-asked distinction. Both create divergent history; only one creates a new file.

### `branch(branchFromId)` — in place

`session-manager.ts:1403-1404`. Sets `this.leafId = branchFromId`. The next `appendXXX()` writes an entry with `parentId: branchFromId`, creating a sibling under that entry. **Same file. No copy.** The tree now has two leaves (the old end-of-conversation leaf is still reachable; pi just isn't pointed at it).

`resetLeaf()` at `:1304-1306` is the special case: `leafId = null` → next append creates a fresh root (`parentId: null`).

`branchWithSummary(branchFromId, summary, details?, fromHook?)` at `:1312-1333` does the leaf move **plus** writes a `branch_summary` entry capturing what's being abandoned, so the LLM context still sees the discarded path as a summary blob.

`createBranchedSession(leafId)` at `:1336` is different again: it walks from root to `leafId` and writes that linear path to a **new** file (effectively "extract one branch out of a multi-branch session"). It does not modify the original file.

### `forkFrom(sourcePath, targetCwd, sessionDir?)` — new file

`session-manager.ts:1606-1664`. Always writes a new `.jsonl`. Header carries `parentSession: <sourcePath>`. All non-header entries from the source are copied. The new session has its own UUID and is independent thereafter — appending here does not affect the source file.

The two operations look superficially similar to users (both produce divergent histories) but differ in:

| | `branch()` (and friends) | `forkFrom()` |
|---|---|---|
| File system | Same `.jsonl`, leaf pointer moves | New `.jsonl` with `parentSession` link |
| History preservation | Old branch still in the file, reachable by tree navigation | Source file is untouched; new file is a fresh copy |
| Cross-project | No (same `cwd`) | Yes (`targetCwd` can differ) |
| Triggered by | `/tree` UI, extension `branch()` calls | `--fork`, the cross-project `--session` prompt, `/clone` |
| Header `parentSession` | Absent | Set |

## RPC `new_session` and `switch_session`

Pi's RPC mode supports two session-replacement commands. Implementations live in `packages/coding-agent/src/core/agent-session-runtime.ts`:

- **`new_session`** at `:321-331` — calls `SessionManager.create(cwd, sessionDir)` for a fresh session.
- **`switch_session`** (and `fork`) at `:336-347` — opens an existing path or, for fork, builds via `SessionManager.open` of the freshly-forked file. Uses `SessionManager.open` rather than `SessionManager.create` because the file already exists.

Both paths fire the cancellable `session_before_switch` / `session_before_fork` extension hooks before they actually swap the manager (see `agent-session-runtime.ts:120-147` for the hook plumbing). Hook authoring belongs to **pi-extensions**; the flows here document where the hooks sit.

## File naming

Both `forkFrom` (`session-manager.ts:1622-1624`) and `create` (via the constructor at `:1476-1479`) build basenames as `<ISO-timestamp-with-colons-and-dots-replaced-by-hyphens>_<sessionId>.jsonl`:

```
2024-12-03T14-00-00-000Z_8a3c5f1e.jsonl
```

Lexicographic sort across the directory is therefore chronological, which is what `findMostRecentSession` (`:594`) and `--continue` rely on.

## Resume semantics in detail

`--resume` calls `SessionManager.list(cwd, sessionDir)` to enumerate sessions for the current project, plus `SessionManager.listAll` for cross-project visibility (`src/main.ts:363-367`). The returned `SessionInfo` shape (`session-manager.ts:229-243`) carries:

- `path`, `id`, `cwd`, optional `name`, optional `parentSessionPath` (so the picker can show fork lineage)
- `created`, `modified`, `messageCount`
- `firstMessage`, `allMessagesText` for searchable preview text

`SessionInfoEntry` entries (`type: "session_info"`) override the picker's default first-message-as-title with the user-set `name`. Sessions deleted by removing the `.jsonl` (or via Ctrl-D in the picker, which uses `trash` if available) simply disappear from the next listing.

## Fork bugs fixed in 0.85.0 — check the runtime version before diagnosing

Three fork/session defects were fixed upstream in 0.85.0. If you are debugging a fork that behaved wrongly, establish the runtime version **first** — on `< 0.85.0` these are known-broken, not your caller's mistake:

| Symptom | Fixed by |
|---|---|
| Fork loses its compaction boundary (forked session re-expands to pre-compaction context) | upstream #8990 |
| In-memory session forked before the active turn settled produces an inconsistent tree | upstream #8937 |
| An imported session silently overwrites an existing session with the same filename | upstream #8985 |

The last one is a **data-loss** shape, not a cosmetic one: on `< 0.85.0`, importing a session whose filename collides with an existing one destroys the original.

## Cross-references

- Stored-cwd-no-longer-exists handling: `session-cwd.ts:14-58`. Surfaces as `MissingSessionCwdError` when an opened session's header `cwd` is gone; `src/main.ts:609` recovers by re-opening with `cwdOverride`.
- `SessionManager.open` signature accepts `cwdOverride` precisely for the recovery case.
- Compaction-related branching (`session_before_compact` cancellation, `compactionResult` overrides) is documented in `reference/compaction.md` (TBW).
- The hook events that fire around these flows (`session_before_switch`, `session_before_fork`, `session_start`, `session_shutdown`) are catalogued in **pi-extensions**' `reference/hook-events.md`.
