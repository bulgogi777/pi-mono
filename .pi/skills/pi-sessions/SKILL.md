---
name: pi-sessions
description: >-
  Pi-mono session persistence, JSONL format, tree/branching, resume,
  fork, compaction. USE WHEN asked about the session JSONL format
  (SessionHeader, SessionMessageEntry, UsageEntry, CompactionEntry,
  BranchSummaryEntry, CustomEntry, CustomMessageEntry, ContextEditEntry,
  LabelEntry, SessionInfoEntry), SessionManager as canonical provider
  context (buildSessionProjection, context edits, refreshContext), the
  entryId / parentId tree, buildSessionContext leaf-to-root walk, session
  file naming under ~/.pi/agent/sessions/, getDefaultSessionDir,
  --continue / --resume / --fork / --session / --no-session, SessionManager
  static factories (create, open, continueRecent, inMemory incl. the 0.85.0
  entries[] rehydration arg, forkFrom),
  in-place branch() vs forkFrom() new-file, branchWithSummary, or
  compaction (shouldCompact, CompactionResult, firstKeptEntryId, branch
  summary).
  Also USE WHEN debugging why /resume doesn't see a session, corrupt
  JSONL, fork-vs-branch outcomes, or compaction firing wrong.
  Do NOT use for hook event payloads (pi-extensions), path discovery
  (pi-architecture), system prompt / cache (pi-prompt-assembly), RPC
  protocol (pi-rpc), provider / auth (pi-providers), or non-pi topics.
---

# pi-sessions

Session persistence, JSONL format, tree/branching, and compaction reference for pi-mono. Each `reference/*.md` is a focused deep-dive with file:line cites — read the matching one rather than reconstructing from memory.

## Reference index

- `reference/jsonl-format.md` — full entry-type catalog (SessionHeader + 11 entry types at `v0.87.1`) with field shapes and source line cites. Tabulates each `type` discriminator against the TypeScript interface in `session-manager.ts`. Includes `buildSessionContext` walk semantics.
- `reference/branching-resume.md` — how the entry tree branches, how `--continue` / `--resume` / `--fork` / `--session` / `--no-session` map to `SessionManager` static factories, the in-place `branch()` vs new-file `forkFrom()` distinction, file-naming rules, and how `new_session` / `switch_session` flows traverse the tree.
- `reference/compaction.md` — the three compaction triggers (`manual` / `threshold` / `overflow`), `shouldCompact` math (`core/compaction/compaction.ts:289-292`), defaults from `DEFAULT_COMPACTION_SETTINGS` (enabled true, reserveTokens 16384, keepRecentTokens 20000), the `prepareCompaction` → `compact` → `appendCompaction` flow, and how `session_before_compact` extension hooks cancel or replace.
- `reference/cli-flags.md` — session-related CLI flags only (`--continue`/`-c`, `--resume`/`-r`, `--session <path|id>`, `--fork <path|id>`, `--no-session`, `--session-dir <dir>`), the dispatch table in `main.ts:createSessionManager` (`:230-350`), the `--fork`-vs-other-flags mutual exclusion, and `resolveSessionPath`'s path / local / global / not_found classification. Cross-links to pi-architecture and pi-providers for their flag surfaces.

## Quick start when asked

- "What does a `compaction` / `branch_summary` / `custom` entry look like?" → `reference/jsonl-format.md`.
- "What's the difference between fork and branch?" → `reference/branching-resume.md`. `branch()` (in-place leaf move, no new file) vs `forkFrom()` (new file with `parentSession` in header).
- "Where does pi store sessions?" → `~/.pi/agent/sessions/--<encoded-cwd>--/<ts>_<uuid>.jsonl`. Encoding logic at `session-manager.ts:589-594` (`getDefaultSessionDirPath(cwd, agentDir)` — **the root is `<agentDir>/sessions`**, so `PI_CODING_AGENT_DIR` moves it) and exposed via `getDefaultSessionDir` at `:596-602`; root path via `getSessionsDir()` at `src/config.ts:572-574`; override with `PI_CODING_AGENT_SESSION_DIR` (env var `ENV_SESSION_DIR` at `src/config.ts:509`).
- "What does `--continue` vs `--resume` do?" → `src/main.ts:createSessionManager` at `:258-344`. `--continue` calls `SessionManager.continueRecent` (most recent or new); `--resume` opens the interactive picker; `--fork <id>` calls `forkFrom` (new file); `--session <path|id>` opens an existing file (or offers to fork if found in another project); `--no-session` / `--help` / `--list-models` short-circuit to `SessionManager.inMemory` (`src/main.ts:360-361`).
- "What does `/import <path.jsonl>` do?" → 0.79.x added an interactive slash command that imports a JSONL session and replaces the current session with it. Dispatched at `interactive-mode.ts:2989`; argument parsing at `:6030`; user confirmation prompt before replacement. Pairs with `/export [file]` which can now write JSONL output (in addition to HTML).
- "When does compaction fire?" → `shouldCompact()` at `core/compaction/compaction.ts:289-292`: triggers when `contextTokens > contextWindow - reserveTokens`. Defaults `enabled: true, reserveTokens: 16384, keepRecentTokens: 20000` (`DEFAULT_COMPACTION_SETTINGS` at `core/compaction/compaction.ts:148-152`). Since 0.79.8 the `CompactionResult` carries `estimatedTokensAfter` (`core/compaction/compaction.ts:149`) — a heuristic post-compaction estimate, **not provider-exact**.
- "Why was my deep session branch taking forever to build context?" → fixed in 0.79.9 (`#5909`). Deep branches no longer take quadratic time to build context or branch paths.
- "How do extension hooks interact with sessions?" → boundary case. The hook *payloads* (`SessionBeforeCompactEvent`, etc.) and authoring patterns are **pi-extensions** territory. The *flows* those hooks sit in are documented here.

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
