---
name: pi-prompt-assembly
description: >-
  Pi-mono system prompt assembly and Anthropic cache breakpoints. USE WHEN
  asked how pi builds the system prompt (buildSystemPrompt in
  system-prompt.ts), customPrompt vs default branch, assembly order
  (SYSTEM.md → APPEND_SYSTEM → AGENTS.md / <project_context>/<project_instructions> XML block (since 0.75.0; was "# Project Context" Markdown heading pre-0.75.0) → skills via
  formatSkillsForPrompt → cwd; the "Current date:" line was removed in 0.80.x), the read-tool gate on skills, prompt
  templates, resolvePromptInput, the OAuth Claude Code identity preamble,
  Anthropic cache_control / cacheRead / cacheWrite / ephemeral cache,
  getCacheControl, the up-to-4 breakpoint sites in api/anthropic-messages.ts (system
  :978, OAuth :962 / :969, last tool :1282, last user :1229-1251), what
  invalidates each, or empty turns from default-prompt through RpcClient.
  Also covers trust-gated discovery of project SYSTEM.md / APPEND_SYSTEM.md
  vs the ungated global floor (see pi-architecture for the trust resolution
  chain itself).
  Also USE WHEN debugging why AGENTS.md / skill / APPEND_SYSTEM isn't in
  prompt, or why cache_write spiked. Do NOT use
  for path discovery (pi-architecture), hook events / ExtensionAPI
  (pi-extensions), provider / auth (pi-providers), RPC protocol (pi-rpc),
  session JSONL / compaction (pi-sessions), or anything outside pi-mono.
---

# pi-prompt-assembly

How pi assembles the system prompt and how Anthropic prompt caching layers on top of it. Each `reference/*.md` is a focused deep-dive with file:line cites — read the matching one rather than reconstructing from memory.

## Reference index

- `reference/assembly-order.md` — section-by-section assembly order for both `buildSystemPrompt` branches (customPrompt and default), with file:line cites. Covers the `formatSkillsForPrompt` interaction and the read-tool gate.
- `reference/cache-breakpoints.md` — the up-to-4 Anthropic `cache_control` sites in `packages/ai/src/api/anthropic-messages.ts`, what each one caches, and what invalidates it. Includes the OAuth identity-preamble case and practical implications for AGENTS.md / skill edits.
- `reference/prompt-templates.md` — `/template-name` expansion (`expandPromptTemplate` at `prompt-templates.ts:269-285`), the `$1` / `$@` / `$ARGUMENTS` / `${@:N:L}` substitution rules, where templates load (global-first, project-second, CLI third), and where in the input pipeline expansion fires (after skill expansion, before the `input` hook).
- `reference/oauth-identity-preamble.md` — the constant `"You are Claude Code, Anthropic's official CLI for Claude."` system block (`api/anthropic-messages.ts:971`), `isOAuthToken` detection at `api/anthropic-messages.ts:838-840`, the `claude-code-20250219` / `oauth-2025-04-20` beta headers and Claude-Code identity headers, how it adds the fourth cache breakpoint, and the per-edit invalidation cascade.
- `reference/known-issues.md` — documented bugs and surprises: empty-turns-through-RpcClient on 0.71.1 (default-prompt branch + missing `toolSnippets`), the `selectedTools: []` skills-gate trap, and the now-resolved daily date-rollover cache invalidation (the `Current date:` line was removed from the system prompt in 0.80.x), with workarounds and source pointers.

## Quick start when asked

- "What goes into the system prompt and in what order?" → `reference/assembly-order.md`.
- "Why doesn't my AGENTS.md show up?" → `reference/assembly-order.md` (the `<project_context>` block at `system-prompt.ts:54-61` (customPrompt branch) and `:145-152` (default branch) only fires when `contextFiles` is non-empty; path discovery itself is **pi-architecture**'s territory). Pre-0.75.0 this block used a `# Project Context` Markdown heading; PR #4541 / #4709 (`7577d3b8`, `aad8cf66`) switched it to XML tags so models stop ingesting prompt content past the boundary.
- "Why aren't my skills in the system prompt?" → read-tool gate at `system-prompt.ts:65` (customPrompt branch, `customPromptHasRead`) and `:155` (default branch, `hasRead` set at `:101`). No `read` tool selected → no `<available_skills>` block. Skill **bodies** are never in the system prompt — only name/description/location via `formatSkillsForPrompt` (`skills.ts:335-361`).
- "Is `.pi/SYSTEM.md` getting loaded in headless RPC?" → no, unless trust is granted. Project `SYSTEM.md` / `APPEND_SYSTEM.md` discovery is **trust-gated** (`resource-loader.ts:970-971, :980-981`); the global `~/.pi/agent/SYSTEM.md` / `APPEND_SYSTEM.md` floor is ungated (`:971-972, :985-986`). Headless RPC with no `--approve` and no saved trust returns `false` (`project-trust.ts:86-87`), so only the global floor loads. For the full resolution chain (extension handler, `defaultProjectTrust`, persisted decisions), read **pi-architecture**'s trust-gating section.
- "Where are the Anthropic cache breakpoints?" / "What does `cache_control` cache?" → `reference/cache-breakpoints.md`.
- "What invalidates the cache when I edit APPEND_SYSTEM.md / a skill / AGENTS.md?" → `reference/cache-breakpoints.md` "Practical implications" section.
- "Why am I getting empty turns through RpcClient?" → `reference/known-issues.md` (TBW); for now, try `--system-prompt` to force the customPrompt branch.

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
