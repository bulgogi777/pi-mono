---
name: pi-prompt-assembly
description: >-
  Pi-mono system prompt assembly and Anthropic cache breakpoints. USE WHEN
  asked how pi builds the system prompt (buildSystemPrompt in
  system-prompt.ts), customPrompt vs default branch, assembly order
  (SYSTEM.md → APPEND_SYSTEM → AGENTS.md / "# Project Context" → skills via
  formatSkillsForPrompt → date → cwd), the read-tool gate on skills, prompt
  templates, resolvePromptInput, the OAuth Claude Code identity preamble,
  Anthropic cache_control / cacheRead / cacheWrite / ephemeral cache,
  getCacheControl, the up-to-4 breakpoint sites in anthropic.ts (system
  :907, OAuth :891 / :898, last tool :1169, last user :1118-1135), what
  invalidates each, or empty turns from default-prompt through RpcClient.
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
- `reference/cache-breakpoints.md` — the up-to-4 Anthropic `cache_control` sites in `packages/ai/src/providers/anthropic.ts`, what each one caches, and what invalidates it. Includes the OAuth identity-preamble case and practical implications for AGENTS.md / skill edits.
- `reference/prompt-templates.md` — `/template-name` expansion (`expandPromptTemplate` at `prompt-templates.ts:282-296`), the `$1` / `$@` / `$ARGUMENTS` / `${@:N:L}` substitution rules, where templates load (global-first, project-second, CLI third), and where in the input pipeline expansion fires (after skill expansion, before the `input` hook).
- `reference/oauth-identity-preamble.md` — the constant `"You are Claude Code, Anthropic's official CLI for Claude."` system block (`anthropic.ts:890`), `isOAuthToken` detection at `anthropic.ts:761-763`, the `claude-code-20250219` / `oauth-2025-04-20` beta headers and Claude-Code identity headers, how it adds the fourth cache breakpoint, and the per-edit invalidation cascade.
- `reference/known-issues.md` — documented bugs and surprises: empty-turns-through-RpcClient on 0.71.1 (default-prompt branch + missing `toolSnippets`), the `selectedTools: []` skills-gate trap, the daily date-rollover cache invalidation, with workarounds and source pointers.

## Quick start when asked

- "What goes into the system prompt and in what order?" → `reference/assembly-order.md`.
- "Why doesn't my AGENTS.md show up?" → `reference/assembly-order.md` (the `# Project Context` block at `system-prompt.ts:60-66` and `:154-160` only fires when `contextFiles` is non-empty; path discovery itself is **pi-architecture**'s territory).
- "Why aren't my skills in the system prompt?" → read-tool gate at `system-prompt.ts:71` (customPrompt branch) and `:163` (default branch). No `read` tool selected → no `<available_skills>` block. Skill **bodies** are never in the system prompt — only name/description/location via `formatSkillsForPrompt` (`skills.ts:340-366`).
- "Where are the Anthropic cache breakpoints?" / "What does `cache_control` cache?" → `reference/cache-breakpoints.md`.
- "What invalidates the cache when I edit APPEND_SYSTEM.md / a skill / AGENTS.md?" → `reference/cache-breakpoints.md` "Practical implications" section.
- "Why am I getting empty turns through RpcClient?" → `reference/known-issues.md` (TBW); for now, try `--system-prompt` to force the customPrompt branch.

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
