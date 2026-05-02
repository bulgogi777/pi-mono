---
name: pi-sessions
description: >-
  Pi-mono session persistence, JSONL format, tree/branching, resume,
  fork, compaction. USE WHEN asked about the session JSONL format
  (SessionHeader, SessionMessageEntry, CompactionEntry, BranchSummaryEntry,
  CustomEntry, CustomMessageEntry, LabelEntry, SessionInfoEntry), the
  entryId / parentId tree, buildSessionContext leaf-to-root walk, session
  file naming under ~/.pi/agent/sessions/, getDefaultSessionDir,
  --continue / --resume / --fork / --session / --no-session, SessionManager
  static factories (create, open, continueRecent, inMemory, forkFrom),
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

- `reference/jsonl-format.md` — full entry-type catalog (SessionHeader + 9 entry types) with field shapes and source line cites. Tabulates each `type` discriminator against the TypeScript interface in `session-manager.ts`. Includes `buildSessionContext` walk semantics.
- `reference/branching-resume.md` — how the entry tree branches, how `--continue` / `--resume` / `--fork` / `--session` / `--no-session` map to `SessionManager` static factories, the in-place `branch()` vs new-file `forkFrom()` distinction, file-naming rules, and how `new_session` / `switch_session` flows traverse the tree.
- `reference/compaction.md` — the three compaction triggers (`manual` / `threshold` / `overflow`), `shouldCompact` math (`compaction.ts:219-222`), defaults from `DEFAULT_COMPACTION_SETTINGS` (enabled true, reserveTokens 16384, keepRecentTokens 20000), the `prepareCompaction` → `compact` → `appendCompaction` flow, and how `session_before_compact` extension hooks cancel or replace.
- `reference/cli-flags.md` — session-related CLI flags only (`--continue`/`-c`, `--resume`/`-r`, `--session <path|id>`, `--fork <path|id>`, `--no-session`, `--session-dir <dir>`), the dispatch table in `main.ts:createSessionManager` (`:214-285`), the `--fork`-vs-other-flags mutual exclusion, and `resolveSessionPath`'s path / local / global / not_found classification. Cross-links to pi-architecture and pi-providers for their flag surfaces.

## Quick start when asked

- "What does a `compaction` / `branch_summary` / `custom` entry look like?" → `reference/jsonl-format.md`.
- "What's the difference between fork and branch?" → `reference/branching-resume.md`. `branch()` (in-place leaf move, no new file) vs `forkFrom()` (new file with `parentSession` in header).
- "Where does pi store sessions?" → `~/.pi/agent/sessions/--<encoded-cwd>--/<ts>_<uuid>.jsonl`. Encoding logic at `session-manager.ts:428-435` (`getDefaultSessionDir`); root path via `getSessionsDir()` at `config.ts:446-448`; override with `PI_CODING_AGENT_SESSION_DIR` (env var `ENV_SESSION_DIR` at `config.ts:381`).
- "What does `--continue` vs `--resume` do?" → `main.ts:createSessionManager` at `:214-284`. `--continue` calls `SessionManager.continueRecent` (most recent or new); `--resume` opens the interactive picker; `--fork <id>` calls `forkFrom` (new file); `--session <path|id>` opens an existing file (or offers to fork if found in another project).
- "When does compaction fire?" → `shouldCompact()` at `compaction/compaction.ts:219-222`: triggers when `contextTokens > contextWindow - reserveTokens`. Defaults `enabled: true, reserveTokens: 16384, keepRecentTokens: 20000` (`compaction.ts:121-125`).
- "How do extension hooks interact with sessions?" → boundary case. The hook *payloads* (`SessionBeforeCompactEvent`, etc.) and authoring patterns are **pi-extensions** territory. The *flows* those hooks sit in are documented here.

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
