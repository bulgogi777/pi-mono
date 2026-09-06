---
name: pi-extensions
description: >-
  Pi-mono extension authoring and debugging. USE WHEN asked about pi extension
  hook events, ExtensionAPI registration methods (registerTool / registerCommand
  / registerShortcut / registerProvider / registerFlag / registerMessageRenderer),
  ExtensionContext members (ctx.ui, ctx.sessionManager, ctx.hasUI, ctx.mode,
  ctx.isProjectTrusted, ctx.getSystemPrompt, ctx.exec), ctx.ui dialog vs
  fire-and-forget semantics in interactive vs RPC mode, custom provider
  registration, dynamic tools, ToolCallEvent input mutation,
  MessageEndEventResult replacement rules, or example extension code. Also USE
  WHEN asked about the project_trust event (0.79.0 / 0.79.1 — user/global-only
  pre-resource hook), compaction event reason / willRetry fields (0.79.10),
  long-lived-resource discipline (defer to session_start, idempotent
  session_shutdown), or autocomplete triggerCharacters (0.79.1). Also USE WHEN debugging an extension that hangs on
  ctx.ui, fails to load from ~/.pi/agent/extensions or .pi/extensions, or whose
  hook handler return value is being ignored. Do NOT use for pi RPC stdio
  protocol shape (use pi-rpc), system-prompt or AGENTS.md/SYSTEM.md assembly
  (use pi-prompt-assembly), session JSONL format or compaction internals (use
  pi-sessions), generic TypeScript questions, or topics outside pi-mono.
---

# pi-extensions

Authoring and debugging reference for pi extensions in the pi-mono repo. Each `reference/*.md` file is a focused deep-dive with file:line cites — read the one matching the question rather than reconstructing from memory.

## Reference index

- `reference/hook-events.md` — full hook event catalog grouped by category (resources/session lifecycle, provider I/O, agent/turn/message lifecycle, tool execution, UI/user input). Payload type definitions plus emit-site file:line cites.
- `reference/extension-api.md` — the seven `register*` methods on `ExtensionAPI` plus `pi.on()` for hooks. Signatures, file:line cites, semantic notes, and example pointers.
- `reference/extension-context.md` — `ExtensionContext` members (`ctx.ui`, `ctx.sessionManager`, `ctx.hasUI`, `ctx.signal`, `ctx.getSystemPrompt`, `ctx.exec`, etc.) plus the extended `ExtensionCommandContext` and `ReplacedSessionContext` shapes.
- `reference/ui-context.md` — `ctx.ui` semantics. Awaited dialogs (select / confirm / input / editor) vs fire-and-forget (notify / setStatus / setWidget / setTitle / setEditorText). When each blocks, when each resolves to a default, what `hasUI` actually gates.
- `reference/tools.md` — `pi.registerTool` field-by-field, the `tool_call` hook with **in-place `event.input` mutation** (not a `setInput()` setter), the chained-handlers contract for `tool_call` / `tool_result`, and `message_end` replacement (must keep original role).
- `reference/custom-providers.md` — `pi.registerProvider` deep dive: the four operating modes (replace-models / URL override / OAuth / custom transport), the OAuth contract, registration timing (queued during initial load), and the two worked examples (`custom-provider-anthropic`, `custom-provider-gitlab-duo`). Cross-links to **pi-providers** for auth resolution.
- `reference/examples-index.md` — survey of the ~75 examples in `packages/coding-agent/examples/extensions/`, grouped by which `register*` / hook each demonstrates, with grep targets.
- `reference/loading.md` — where pi looks for extensions (`<cwd>/.pi/extensions/`, `~/.pi/agent/extensions/`, npm packages from `settings.json`), the project-first dedup ordering, the `pi.extensions` `package.json` manifest, and inline factory loading.

## Quick start when asked

- "What hook events exist? / When does X fire? / What's in the payload for Y?" → `reference/hook-events.md`.
- "How do I register a tool / command / shortcut / provider / flag / renderer?" → grep `packages/coding-agent/src/core/extensions/types.ts` (around `registerTool` / `registerCommand` / `registerShortcut` / `registerFlag` / `registerProvider` / `registerMessageRenderer`); see `packages/coding-agent/examples/extensions/` for working examples.
- "Why doesn't my ctx.ui dialog return in RPC mode?" → read `packages/coding-agent/src/modes/rpc/rpc-mode.ts:101-271`. Awaited ui methods (select/confirm/input/editor) need a host response; fire-and-forget methods (notify/setStatus/setWidget/setTitle) never block.
- "Where does an extension get loaded from?" → `~/.pi/agent/extensions/*.ts`, `<cwd>/.pi/extensions/*.ts`, plus npm `packages` entries in `~/.pi/agent/settings.json`. Loose-`extensions/` directory loads regardless of `settings.json`. Source: `packages/coding-agent/src/core/extensions/loader.ts`.
- "Is there an example of X?" → `ls packages/coding-agent/examples/extensions/`.
- "How do I auto-trust certain cwds for headless pi?" → install a user/global extension with a `project_trust` handler. See **New in 0.79.x — project_trust event** below. Example: `packages/coding-agent/examples/extensions/project-trust.ts`.
- "Can my extension tell whether the user trusted the project?" → `ctx.isProjectTrusted()` (`extensions/types.ts:331, :1541`). Reflects the live decision including `--approve` overrides and temporary trust, not just persisted `trust.json`.
- "What mode am I in?" → `ctx.mode` is `"tui" | "rpc" | "json" | "print"`. Combined with the (since 0.78.0) `hasUI=true` in RPC, `ctx.mode === "tui"` is the right discriminator for true-TUI behaviour. Don't gate dialogs on `hasUI` alone in RPC — you'll get a hung dialog; pair with `ctx.mode`.
- "How do I distinguish manual vs threshold vs overflow compaction?" → 0.79.10 added `reason: "manual" | "threshold" | "overflow"` and `willRetry: boolean` to `session_before_compact` (`extensions/types.ts:586-594`) and `session_compact` (`:591-598`). `willRetry` is set when the aborted turn is retried after overflow-triggered compaction.
- "Why is my extension factory starting a background process I never see closed?" → 0.79.7 docs added a discipline rule: factories may run in invocations that never start a session (e.g., `pi --list-models`). **Don't** start processes / sockets / file watchers / timers from the factory. Defer to `session_start`; register an idempotent `session_shutdown` handler to close them. See `docs/extensions.md` “Long-lived resources and shutdown”.
- "Can my custom autocomplete open without a slash prefix?" → Yes since 0.79.1. Provider factories can declare `triggerCharacters: ["#", "$"]`; pi merges them in `interactive-mode.ts:660-666`.

## New in 0.79.x — project_trust event

A pre-resource hook that lets user/global and CLI `-e` extensions decide whether to load project-local `.pi/` resources. Fires before any project-local extension is loaded, so project-local extensions cannot participate.

**Event shape** (`extensions/types.ts:518-540`):

```ts
interface ProjectTrustEvent { type: "project_trust"; cwd: string }
type  ProjectTrustEventDecision = "yes" | "no" | "undecided";
interface ProjectTrustEventResult { trusted: ProjectTrustEventDecision; remember?: boolean }
```

**Registration:** `pi.on("project_trust", handler)` (`extensions/types.ts:1219`).

**Context (limited):** the handler receives a `ProjectTrustContext` — only `{ cwd, mode, hasUI, ui: { select, confirm, input, notify } }` (`extensions/types.ts:530-535`). **No `sessionManager`, no `getSystemPrompt`, no full UI surface.** Designed for a fast yes/no decision.

**Resolution semantics:** first user/global or CLI extension that returns `"yes"` or `"no"` owns the decision (`core/project-trust.ts:54-70`). `remember: true` persists the decision into `~/.pi/agent/trust.json`. Returning `"undecided"` defers to later handlers or the built-in flow.

**APEX use case (recommended):** install a single user/global extension at `~/.pi/agent/extensions/apex-trust.ts` that auto-trusts cwds under known prefixes (`~/apex/`, `~/.claude/`, `~/.pi/`) without `remember: true` (so per-session, not persisted), and returns `"undecided"` for everything else. This eliminates per-spawn `--approve` flags in synapse, apex-app, pi-task, and consult-pi-mono without globally weakening the default. See `examples/extensions/project-trust.ts` as a starting template.

## SDK exports for extensions (0.79.7)

From `@earendil-works/pi-coding-agent` (`packages/coding-agent/src/index.ts:7-12, :249`):

- `CONFIG_DIR_NAME` — import instead of hardcoding `.pi`. Rebranded distributions / forks may use a different config dir name.
- `getAgentDir`, `getPackageDir`, `getReadmePath`, `getDocsPath`, `getExamplesPath` — path helpers for the user agent dir and packaged docs/examples.
- `generateDiffString`, `generateUnifiedPatch`, `EditDiffResult` — edit-diff helpers used by pi's built-in `edit` tool. Available to extensions that need TUI-consistent diff rendering.
- Selective base entry points (0.79.8): `@earendil-works/pi-ai/base` and `@earendil-works/pi-agent-core/base` — register only the providers you need for bundled applications.

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
