---
name: pi-extensions
description: >-
  Pi-mono extension authoring and debugging. USE WHEN asked about pi extension
  hook events, ExtensionAPI registration methods (registerTool / registerCommand
  / registerShortcut / registerProvider / registerFlag / registerMessageRenderer),
  ExtensionContext members (ctx.ui, ctx.sessionManager, ctx.hasUI,
  ctx.getSystemPrompt, ctx.exec), ctx.ui dialog vs fire-and-forget semantics in
  interactive vs RPC mode, custom provider registration, dynamic tools,
  ToolCallEvent input mutation, MessageEndEventResult replacement rules, or
  example extension code. Also USE WHEN debugging an extension that hangs on
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
- "Why doesn't my ctx.ui dialog return in RPC mode?" → read `packages/coding-agent/src/modes/rpc/rpc-mode.ts:100-270`. Awaited ui methods (select/confirm/input/editor) need a host response; fire-and-forget methods (notify/setStatus/setWidget/setTitle) never block.
- "Where does an extension get loaded from?" → `~/.pi/agent/extensions/*.ts`, `<cwd>/.pi/extensions/*.ts`, plus npm `packages` entries in `~/.pi/agent/settings.json`. Loose-`extensions/` directory loads regardless of `settings.json`. Source: `packages/coding-agent/src/core/extensions/loader.ts`.
- "Is there an example of X?" → `ls packages/coding-agent/examples/extensions/`.

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
