# Branching, Resume, and Fork

How pi turns CLI flags and runtime commands into `SessionManager` instances, how the entry tree branches in place, and the difference between branching and forking. All cites against pi-mono at the current pin (`v0.85.1`, `d981de12`).

## CLI flag → SessionManager dispatch

All flag parsing in `packages/coding-agent/src/cli/args.ts:96-117`. All dispatch in `packages/coding-agent/src/main.ts:createSessionManager` (`:253-334`).

| CLI flag | Parsed at | SessionManager call | Result |
|---|---|---|---|
| (none) | — | `SessionManager.create(cwd, sessionDir)` (`main.ts:374`) | Brand-new session file under `~/.pi/agent/sessions/<encoded-cwd>/`. |
| `--continue` / `-c` | `args.ts:96` | `SessionManager.continueRecent(cwd, sessionDir)` (`main.ts:372`) | Most recent `*.jsonl` in the cwd's session dir, by mtime (`session-manager.ts:1381-1389`, helper `findMostRecentSession` at `:481`). Falls back to `create` semantics if none exist. |
| `--resume` / `-r` | `args.ts:98` | Interactive picker → `SessionManager.open(selectedPath, sessionDir)` (`main.ts:357-364`) | Opens the `selectSession` UI (themed; `initTheme` / `stopThemeWatcher` wrap the call). User picks; selection is opened with the session file's parent dir as the implicit `sessionDir`. |
| `--session <path-or-id>` | `args.ts:113` | Resolved by `resolveSessionPath`. If `path` / `local` → `SessionManager.open` (`main.ts:335`); if `global` (found in another project) → user prompted to fork via `forkSessionOrExit` (`main.ts:345-348`); if `not_found` → exit 1 (`main.ts:361`). | Opens an existing session by exact path or short ID. Cross-project finds trigger an interactive fork prompt. |
| `--fork <path-or-id>` | `args.ts:115` | `forkSessionOrExit(resolved.path, cwd, sessionDir)` → `SessionManager.forkFrom` (`main.ts:294-302, 232`) | Creates a **new file** in the current cwd's session dir, preserving full source history. Conflicts checked at `main.ts:278-291` — `--fork` cannot combine with `--continue`, `--resume`, `--session`, or `--no-session`. |
| `--no-session` | `args.ts:111` | `SessionManager.inMemory()` (`main.ts:313`) | No file persistence. State lives only in process memory. |
| `--session-dir <path>` | `args.ts:117` | Threaded as the `sessionDir` arg to whichever factory above runs. | Overrides the default `~/.pi/agent/sessions/<encoded-cwd>/` root for this run. |

## Static factories — what each one does

All defined on `SessionManager` (`packages/coding-agent/src/core/session-manager.ts`).

| Factory | Lines | Behavior |
|---|---|---|
| `create(cwd, sessionDir?)` | `:1283-1286` | New session, no file written until first append. `sessionDir` defaults to `getDefaultSessionDir(cwd)`. |
| `open(path, sessionDir?, cwdOverride?)` | `:1294-1302` | Reads the file, extracts `cwd` from the header (or accepts `cwdOverride`), uses `dirname(path)` as the implicit `sessionDir` if not supplied. Same file is appended to on subsequent writes. |
| `continueRecent(cwd, sessionDir?)` | `:1309-1317` | Calls `findMostRecentSession(dir)`; falls back to `create`-like behavior (no `mostRecent`). Same file is reused. |
| `inMemory(cwd?, options?, entries?)` | `:1600-1602` | `sessionFile` is empty string, `persisted: false` (`isPersisted()` returns false). All append* methods stay in memory. **`entries?: FileEntry[]` added in 0.85.0** (upstream #8980, "restorable in-memory sessions"): pass previously-captured entries to rehydrate an in-memory session from storage you manage yourself, rather than always starting empty. This is the supported path for a host that persists session state somewhere other than pi's JSONL files. |
| `forkFrom(sourcePath, targetCwd, sessionDir?)` | `:1611-1657` | Reads source, validates header, generates new session id + filename `<iso-ts>_<id>.jsonl`, writes new header with `parentSession: sourcePath` and `cwd: targetCwd`, then copies every non-header entry from source into the new file. Returns a manager pointed at the new file. |

`list(cwd, sessionDir?, onProgress?)` and `listAll(onProgress?)` are also static (referenced in the README but defined in the listing section of the file). They produce `SessionInfo[]` for picker UIs.

## In-place branch vs new-file fork

This is the most-asked distinction. Both create divergent history; only one creates a new file.

### `branch(branchFromId)` — in place

`session-manager.ts:1210-1211`. Sets `this.leafId = branchFromId`. The next `appendXXX()` writes an entry with `parentId: branchFromId`, creating a sibling under that entry. **Same file. No copy.** The tree now has two leaves (the old end-of-conversation leaf is still reachable; pi just isn't pointed at it).

`resetLeaf()` at `:1152-1154` is the special case: `leafId = null` → next append creates a fresh root (`parentId: null`).

`branchWithSummary(branchFromId, summary, details?, fromHook?)` at `:1160-1181` does the leaf move **plus** writes a `branch_summary` entry capturing what's being abandoned, so the LLM context still sees the discarded path as a summary blob.

`createBranchedSession(leafId)` at `:1184` is different again: it walks from root to `leafId` and writes that linear path to a **new** file (effectively "extract one branch out of a multi-branch session"). It does not modify the original file.

### `forkFrom(sourcePath, targetCwd, sessionDir?)` — new file

`session-manager.ts:1408-1463`. Always writes a new `.jsonl`. Header carries `parentSession: <sourcePath>`. All non-header entries from the source are copied. The new session has its own UUID and is independent thereafter — appending here does not affect the source file.

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

- **`new_session`** at `:265-275` — calls `SessionManager.create(cwd, sessionDir)` for a fresh session.
- **`switch_session`** (and `fork`) at `:280-291` — opens an existing path or, for fork, builds via `SessionManager.open` of the freshly-forked file. Uses `SessionManager.open` rather than `SessionManager.create` because the file already exists.

Both paths fire the cancellable `session_before_switch` / `session_before_fork` extension hooks before they actually swap the manager (see `agent-session-runtime.ts:120-147` for the hook plumbing). Hook authoring belongs to **pi-extensions**; the flows here document where the hooks sit.

## File naming

Both `forkFrom` (`session-manager.ts:1424-1426`) and `create` (via the constructor at `:1283-1286`) build basenames as `<ISO-timestamp-with-colons-and-dots-replaced-by-hyphens>_<sessionId>.jsonl`:

```
2024-12-03T14-00-00-000Z_8a3c5f1e.jsonl
```

Lexicographic sort across the directory is therefore chronological, which is what `findMostRecentSession` (`:481`) and `--continue` rely on.

## Resume semantics in detail

`--resume` calls `SessionManager.list(cwd, sessionDir)` to enumerate sessions for the current project, plus `SessionManager.listAll` for cross-project visibility (`main.ts:359-363`). The returned `SessionInfo` shape (`session-manager.ts:174-188`) carries:

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

- Stored-cwd-no-longer-exists handling: `session-cwd.ts:14-58`. Surfaces as `MissingSessionCwdError` when an opened session's header `cwd` is gone; `main.ts:605` recovers by re-opening with `cwdOverride`.
- `SessionManager.open` signature accepts `cwdOverride` precisely for the recovery case.
- Compaction-related branching (`session_before_compact` cancellation, `compactionResult` overrides) is documented in `reference/compaction.md` (TBW).
- The hook events that fire around these flows (`session_before_switch`, `session_before_fork`, `session_start`, `session_shutdown`) are catalogued in **pi-extensions**' `reference/hook-events.md`.
