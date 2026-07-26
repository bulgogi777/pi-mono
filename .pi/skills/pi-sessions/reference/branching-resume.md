# Branching, Resume, and Fork

How pi turns CLI flags and runtime commands into `SessionManager` instances, how the entry tree branches in place, and the difference between branching and forking. All cites against pi-mono `HEAD` on the date this file was written.

## CLI flag → SessionManager dispatch

All flag parsing in `packages/coding-agent/src/cli/args.ts:79-100`. All dispatch in `packages/coding-agent/src/main.ts:createSessionManager` (`:214-285`).

| CLI flag | Parsed at | SessionManager call | Result |
|---|---|---|---|
| (none) | — | `SessionManager.create(cwd, sessionDir)` (`main.ts:285`) | Brand-new session file under `~/.pi/agent/sessions/<encoded-cwd>/`. |
| `--continue` / `-c` | `args.ts:79` | `SessionManager.continueRecent(cwd, sessionDir)` (`main.ts:283`) | Most recent `*.jsonl` in the cwd's session dir, by mtime (`session-manager.ts:1367-1375`, helper `findMostRecentSession` at `:481`). Falls back to `create` semantics if none exist. |
| `--resume` / `-r` | `args.ts:81` | Interactive picker → `SessionManager.open(selectedPath, sessionDir)` (`main.ts:268-275`) | Opens the `selectSession` UI (themed; `initTheme` / `stopThemeWatcher` wrap the call). User picks; selection is opened with the session file's parent dir as the implicit `sessionDir`. |
| `--session <path-or-id>` | `args.ts:96` | Resolved by `resolveSessionPath`. If `path` / `local` → `SessionManager.open` (`main.ts:246`); if `global` (found in another project) → user prompted to fork via `forkSessionOrExit` (`main.ts:256-259`); if `not_found` → exit 1 (`main.ts:265`). | Opens an existing session by exact path or short ID. Cross-project finds trigger an interactive fork prompt. |
| `--fork <path-or-id>` | `args.ts:98` | `forkSessionOrExit(resolved.path, cwd, sessionDir)` → `SessionManager.forkFrom` (`main.ts:205-213, 232`) | Creates a **new file** in the current cwd's session dir, preserving full source history. Conflicts checked at `main.ts:189-202` — `--fork` cannot combine with `--continue`, `--resume`, `--session`, or `--no-session`. |
| `--no-session` | `args.ts:94` | `SessionManager.inMemory()` (`main.ts:224`) | No file persistence. State lives only in process memory. |
| `--session-dir <path>` | `args.ts:100` | Threaded as the `sessionDir` arg to whichever factory above runs. | Overrides the default `~/.pi/agent/sessions/<encoded-cwd>/` root for this run. |

## Static factories — what each one does

All defined on `SessionManager` (`packages/coding-agent/src/core/session-manager.ts`).

| Factory | Lines | Behavior |
|---|---|---|
| `create(cwd, sessionDir?)` | `:1269-1272` | New session, no file written until first append. `sessionDir` defaults to `getDefaultSessionDir(cwd)`. |
| `open(path, sessionDir?, cwdOverride?)` | `:1280-1288` | Reads the file, extracts `cwd` from the header (or accepts `cwdOverride`), uses `dirname(path)` as the implicit `sessionDir` if not supplied. Same file is appended to on subsequent writes. |
| `continueRecent(cwd, sessionDir?)` | `:1295-1303` | Calls `findMostRecentSession(dir)`; falls back to `create`-like behavior (no `mostRecent`). Same file is reused. |
| `inMemory(cwd?)` | `:1305-1307` | `sessionFile` is empty string, `persisted: false` (`isPersisted()` returns false). All append* methods stay in memory. |
| `forkFrom(sourcePath, targetCwd, sessionDir?)` | `:1579-1625` | Reads source, validates header, generates new session id + filename `<iso-ts>_<id>.jsonl`, writes new header with `parentSession: sourcePath` and `cwd: targetCwd`, then copies every non-header entry from source into the new file. Returns a manager pointed at the new file. |

`list(cwd, sessionDir?, onProgress?)` and `listAll(onProgress?)` are also static (referenced in the README but defined in the listing section of the file). They produce `SessionInfo[]` for picker UIs.

## In-place branch vs new-file fork

This is the most-asked distinction. Both create divergent history; only one creates a new file.

### `branch(branchFromId)` — in place

`session-manager.ts:1196-1197`. Sets `this.leafId = branchFromId`. The next `appendXXX()` writes an entry with `parentId: branchFromId`, creating a sibling under that entry. **Same file. No copy.** The tree now has two leaves (the old end-of-conversation leaf is still reachable; pi just isn't pointed at it).

`resetLeaf()` at `:1138-1140` is the special case: `leafId = null` → next append creates a fresh root (`parentId: null`).

`branchWithSummary(branchFromId, summary, details?, fromHook?)` at `:1146-1167` does the leaf move **plus** writes a `branch_summary` entry capturing what's being abandoned, so the LLM context still sees the discarded path as a summary blob.

`createBranchedSession(leafId)` at `:1170` is different again: it walks from root to `leafId` and writes that linear path to a **new** file (effectively "extract one branch out of a multi-branch session"). It does not modify the original file.

### `forkFrom(sourcePath, targetCwd, sessionDir?)` — new file

`session-manager.ts:1393-1431`. Always writes a new `.jsonl`. Header carries `parentSession: <sourcePath>`. All non-header entries from the source are copied. The new session has its own UUID and is independent thereafter — appending here does not affect the source file.

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

Both `forkFrom` (`session-manager.ts:1409-1411`) and `create` (via the constructor at `:1269-1272`) build basenames as `<ISO-timestamp-with-colons-and-dots-replaced-by-hyphens>_<sessionId>.jsonl`:

```
2024-12-03T14-00-00-000Z_8a3c5f1e.jsonl
```

Lexicographic sort across the directory is therefore chronological, which is what `findMostRecentSession` (`:481`) and `--continue` rely on.

## Resume semantics in detail

`--resume` calls `SessionManager.list(cwd, sessionDir)` to enumerate sessions for the current project, plus `SessionManager.listAll` for cross-project visibility (`main.ts:270-274`). The returned `SessionInfo` shape (`session-manager.ts:166-185`) carries:

- `path`, `id`, `cwd`, optional `name`, optional `parentSessionPath` (so the picker can show fork lineage)
- `created`, `modified`, `messageCount`
- `firstMessage`, `allMessagesText` for searchable preview text

`SessionInfoEntry` entries (`type: "session_info"`) override the picker's default first-message-as-title with the user-set `name`. Sessions deleted by removing the `.jsonl` (or via Ctrl-D in the picker, which uses `trash` if available) simply disappear from the next listing.

## Cross-references

- Stored-cwd-no-longer-exists handling: `session-cwd.ts:14-58`. Surfaces as `MissingSessionCwdError` when an opened session's header `cwd` is gone; `main.ts:511` recovers by re-opening with `cwdOverride`.
- `SessionManager.open` signature accepts `cwdOverride` precisely for the recovery case.
- Compaction-related branching (`session_before_compact` cancellation, `compactionResult` overrides) is documented in `reference/compaction.md` (TBW).
- The hook events that fire around these flows (`session_before_switch`, `session_before_fork`, `session_start`, `session_shutdown`) are catalogued in **pi-extensions**' `reference/hook-events.md`.
