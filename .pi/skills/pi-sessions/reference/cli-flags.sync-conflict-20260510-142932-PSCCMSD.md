# Session-related CLI Flags

CLI flags that select, create, or fork sessions, plus the storage-directory override. All cites against pi-mono `HEAD`. Parser: `parseArgs` at `packages/coding-agent/src/cli/args.ts:79-100`. Dispatch: `createSessionManager` at `packages/coding-agent/src/main.ts:214-285`.

This file covers **session flags only**. For resource flags (`--skill`, `--prompt-template`, `--system-prompt`, `--no-context-files`, etc.), see **pi-architecture** `reference/cli-flags.md`. For provider/model flags, see **pi-providers** `reference/cli-flags.md`.

## Quick reference

| Flag | Short | Args | Lines | Effect |
|---|---|---|---|---|
| `--continue` | `-c` | — | `args.ts:79-80` | Resume the most recent session for the current cwd, or create a new one if none exists. |
| `--resume` | `-r` | — | `args.ts:81-82` | Open an interactive picker (`/resume`-style UI) listing recent sessions, then load the chosen file. |
| `--session <path\|id>` | — | required | `args.ts:96-97` | Open a specific session by absolute path or partial UUID. If the resolved session lives in another project, prompts to fork. |
| `--fork <path\|id>` | — | required | `args.ts:98-99` | Fork the named session into a **new file** in the current cwd's session dir. |
| `--no-session` | — | — | `args.ts:94-95` | No file persistence. Ephemeral in-memory session only. |
| `--session-dir <dir>` | — | required | `args.ts:100-101` | Override the default session storage directory for this run. |

## Dispatch table — `createSessionManager` (`main.ts:214-285`)

The flag-to-`SessionManager` mapping:

| Flag(s) set | Code | Result |
|---|---|---|
| `--no-session` | `main.ts:221-222` | `SessionManager.inMemory()` |
| `--fork <id>` | `main.ts:224-237` | `forkSessionOrExit(resolved.path, cwd, sessionDir)` → `SessionManager.forkFrom` (new file with `parentSession` link in header) |
| `--session <id>` | `main.ts:239-265` | `SessionManager.open(resolved.path, sessionDir)`. If resolved as `"global"` (different project), prompts to fork; user-cancel → exit 0 |
| `--resume` | `main.ts:267-280` | Interactive picker via `selectSession`, then `SessionManager.open(selectedPath, sessionDir)` |
| `--continue` | `main.ts:281-283` | `SessionManager.continueRecent(cwd, sessionDir)` (most recent or new) |
| (none of above) | `main.ts:284` | `SessionManager.create(cwd, sessionDir)` |

## Mutual exclusion — `--fork` cannot combine

`main.ts:188-201`: when `--fork` is supplied alongside any of `--continue`, `--resume`, `--session`, or `--no-session`, pi prints an error listing the conflicting flags and exits with code 1.

The other combinations are handled by precedence — the dispatch table above is in `if`/`if`/`if` order, so the **first matching branch wins**:

1. `--no-session` (highest priority — always wins if present).
2. `--fork`.
3. `--session`.
4. `--resume`.
5. `--continue`.
6. Default (new session).

In practice, no other combinations conflict because `createSessionManager` short-circuits at the first match.

## Session resolution — `resolveSessionPath`

`--session` and `--fork` accept either an **absolute path** or a **partial UUID**. The resolver classifies the result (`main.ts:230, 244`):

| Resolution type | What it means |
|---|---|
| `"path"` | Argument was an explicit file path that exists. |
| `"local"` | Resolved to a session in the current cwd's session directory. |
| `"global"` | Resolved to a session in a **different** cwd's directory (cross-project). For `--session`, prompts to fork. For `--fork`, used as-is. |
| `"not_found"` | No matching session. Pi exits 1 with `No session found matching '<arg>'`. |

The cross-project prompt (`main.ts:248-258`) is interactive (`promptConfirm`). Hosts using `--session <global-id>` non-interactively need to anticipate this — either supply the absolute path explicitly or use `--fork` instead.

## `--session-dir <dir>`

Overrides the default `~/.pi/agent/sessions/--<encoded-cwd>--/` directory for both **storing new sessions** and **looking up** existing ones via `--continue` / `--resume`. Threaded as the `sessionDir` argument to every static factory (`main.ts:204-206, 222, 232, …`). Equivalent to setting `PI_CODING_AGENT_SESSION_DIR` in the env (`config.ts:381`).

When this flag is set, `--continue` looks for the most recent session **inside the override directory**, not the cwd-encoded default.

## Behavioral details

### `--continue` semantics

`SessionManager.continueRecent(cwd, sessionDir)` at `session-manager.ts:1295-1303`:

1. Compute the session dir (default or override).
2. `findMostRecentSession(dir)` (`session-manager.ts:481-…`) — scan for `*.jsonl`, pick highest mtime.
3. If found, open that file (re-uses, appends to it).
4. If none found, behaves like `SessionManager.create` — fresh session.

So `pi -c` in a cwd with no prior sessions silently creates a new one rather than erroring.

### `--resume` semantics

`main.ts:267-280` runs the picker UI. The picker enumerates **two** lists:

- Sessions for the current cwd: `SessionManager.list(cwd, sessionDir, onProgress)`.
- All sessions across all projects: `SessionManager.listAll(onProgress)`.

User-cancel from the picker exits 0 with `No session selected` — not an error.

### `--fork` semantics

`SessionManager.forkFrom(sourcePath, targetCwd, sessionDir)` at `session-manager.ts:1316-1352`:

1. Read the source file, extract header.
2. Generate a new session id and timestamped filename.
3. Write a new header with `parentSession: sourcePath` and `cwd: targetCwd`.
4. Copy every non-header entry from source to new file.
5. Return a manager pointed at the new file.

The new file is independent — appending here does not affect the source.

This is **different** from in-place `branch()` (which moves the leaf pointer within the same file, no new file). See `reference/branching-resume.md` for the full distinction.

## Common gotchas

- **`--fork` and `--session` can BOTH accept the same arg.** The difference is what pi does with it: `--fork` always creates a new file; `--session` opens (and may prompt to fork on cross-project). For programmatic hosts, `--fork` is more predictable.
- **`--no-session` doesn't suppress events.** The agent still emits the full event stream (RPC `prompt`, `message_*`, etc.), just nothing persists. Useful for ephemeral integrations.
- **`--session-dir` does NOT migrate existing sessions.** It only redirects lookups and writes for the current run. Sessions previously written to the default directory remain there.
- **Partial-UUID matches are by prefix.** A short ID like `8a3c` matches the first session whose UUID starts with `8a3c`. If multiple sessions share the prefix (rare), the resolver picks one deterministically — but to be safe, pass enough characters to uniquely identify.
- **Fork conflicts with `--no-session`.** Documented at `main.ts:188-201`. There is no in-memory fork.

## Cross-references

- `SessionManager` static factories (`create`, `open`, `continueRecent`, `inMemory`, `forkFrom`) and the in-place `branch()` vs new-file `forkFrom()` distinction: `reference/branching-resume.md`.
- Resource flags (`--skill`, `--prompt-template`, `--system-prompt`, `--no-context-files`, etc.) and what they gate: **pi-architecture** `reference/cli-flags.md`.
- Provider/model flags (`--provider`, `--model`, `--api-key`, `--models`): **pi-providers** `reference/cli-flags.md`.
- The `--mode` flag and pi's runtime modes: **pi-rpc** `reference/protocol.md` and `reference/json-mode.md`.
