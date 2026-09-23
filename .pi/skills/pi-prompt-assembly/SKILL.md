---
name: pi-prompt-assembly
description: >-
  Pi-mono system prompt assembly and Anthropic prompt caching. USE WHEN asked
  how pi builds the system prompt (buildSystemPromptSections, the named
  preamble / tools / rules / docs / addendum / project_context / skills / cwd
  sections, --system-prompt vs the stock preamble, forceSystemPrompt), how the
  prompt is stored in and patched through the session transcript, the
  skill-file-read-tool gate, prompt templates and resolvePromptInput, the OAuth
  Claude Code identity preamble, or Anthropic cache_control / cacheRead /
  cacheWrite breakpoints and what invalidates each, including per-model
  mid-conversation system messages and native tool changes. Also USE WHEN
  debugging why AGENTS.md / a skill / APPEND_SYSTEM is missing from the
  prompt, why cache_write spiked, why a prompt edit did or did not invalidate
  the cache, or empty turns through RpcClient. Do NOT use for path discovery
  or trust resolution (pi-architecture), hook events / ExtensionAPI
  (pi-extensions), provider / auth (pi-providers), RPC protocol (pi-rpc),
  session JSONL / compaction (pi-sessions), or anything outside pi-mono.
---

# pi-prompt-assembly

How pi assembles the system prompt and how Anthropic prompt caching sits on top of it. Each `reference/*.md` is a focused deep-dive with file:line cites; read the one that matches instead of reconstructing from memory.

**Since 0.87.0 the prompt is named sections stored in the session transcript**, not one concatenated string. Anything you remember about a `customPrompt` branch versus a default branch predates that; the cites for it are dead.

## Reference index

- `reference/assembly-order.md` — the section order, what `--system-prompt` replaces, the skill-file-read-tool gate, how the prompt lives in and is patched through the transcript, and the forced-prompt exception.
- `reference/cache-breakpoints.md` — the up-to-4 `cache_control` sites in `packages/ai/src/api/anthropic-messages.ts`, transcript resolution by model capability (mid-conversation system messages, native tool changes), and the per-edit invalidation cascade.
- `reference/prompt-templates.md` — `/template` expansion, the `$1` / `$@` / `$ARGUMENTS` / `${@:N:L}` rules, load order (global, project, CLI), and where expansion fires: **after** the `input` hook, **after** skill expansion.
- `reference/oauth-identity-preamble.md` — the constant `"You are Claude Code, Anthropic's official CLI for Claude."` block, `isOAuthToken` detection, the OAuth headers and betas, and the fourth breakpoint.
- `reference/known-issues.md` — empty turns through `RpcClient`, the skills gate trap, the resolved date-rollover issue, and two 0.87 issues: forced prompts opting out of patching, and XML wrappers breaking exact-text assertions.

## Quick start when asked

- "What goes into the system prompt, in what order?" → `assembly-order.md`.
- "Why doesn't my AGENTS.md show up?" → the `project_context` section is emitted only when `contextFiles` is non-empty (`assembly-order.md`). Discovering which files are in scope belongs to **pi-architecture**.
- "Why aren't my skills in the prompt?" → the gate requires `read` or `bash` among the selected tools (`assembly-order.md`, `known-issues.md`). Skill **bodies** are never in the prompt.
- "Did my mid-session AGENTS.md / skill edit invalidate the cache?" → it depends on the model and on whether an extension forces the prompt (`cache-breakpoints.md`, "Practical implications"). On this box every session forces it, through `pai-context`.
- "Is `.pi/SYSTEM.md` loaded in headless RPC?" → only when the cwd is trusted; the global `~/.pi/agent/SYSTEM.md` floor is ungated (`assembly-order.md`, "Cross-references"; the full chain is **pi-architecture**).
- "Empty turns through RpcClient?" → `known-issues.md`; pass any non-empty `--system-prompt`.

## Citation discipline

Cite `path:line` from pi-mono source at the pinned tag. The reference files hold the canonical citations; copy from them rather than reconstructing.
