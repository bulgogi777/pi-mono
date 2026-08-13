# Tools, ToolCallEvent, and message_end Replacement

Three intersecting topics: how to register a custom tool, how to mutate or block tool calls before execution via the `tool_call` hook, and how to replace assistant messages via `message_end`. All cites against pi-mono at the current pin (`v0.84.1`, `53fa77cc`).

## pi.registerTool — dynamic tool definition

Signature: `pi.registerTool<TParams, TDetails, TState>(tool)` at `packages/coding-agent/src/core/extensions/types.ts:1165-1167`. Takes a `ToolDefinition` (`types.ts:449-498`).

`ToolDefinition` fields:

| Field | Required | Lines | Notes |
|---|---|---|---|
| `name` | yes | `:434` | Used in LLM tool calls. Same name as a built-in **overrides** the built-in (see `examples/extensions/tool-override.ts`). |
| `label` | yes | `:436` | Human-readable label for UI. |
| `description` | yes | `:438` | What the LLM sees. |
| `promptSnippet` | optional | `:440` | One-line description added to the `Available tools:` block of the default system prompt. **Without this, the tool does not appear in the listing** (the LLM still sees it via the wire-protocol tool list, but with no per-tool guidance). See `system-prompt.ts:90-92`. |
| `promptGuidelines` | optional | `:442` | Extra bullets appended to the system prompt's `Guidelines:` block when the tool is active. |
| `parameters` | yes | `:444` | TypeBox `TSchema`. Pi validates LLM args against this before calling `execute`. |
| `renderShell` | optional | `:446` | `"default"` (built-in colored shell) or `"self"` (tool renders its own framing). |
| `prepareArguments` | optional | `:449` | Compatibility shim that pre-processes raw args before schema validation. |
| `executionMode` | optional | `:457` | `"sequential"` or `"parallel"`. Overrides the per-call default. |
| `execute` | yes | `:460-466` | `(toolCallId, params, signal, onUpdate, ctx) => Promise<AgentToolResult<TDetails>>`. `signal` is the agent abort signal; `onUpdate` lets you stream partial results (surfaces as `tool_execution_update` events). |
| `renderCall` | optional | `:469` | TUI custom rendering for the call display. |
| `renderResult` | optional | `:472-477` | TUI custom rendering for the result display. |

Helper: `defineTool(tool)` at `types.ts:498-502` preserves parameter inference when assigning a tool to a variable. Useful when the tool flows through `customTools[]` arrays.

**Late registration** is supported — call `pi.registerTool` from a hook handler (`session_start`, `before_agent_start`, etc.) or a command handler. See `examples/extensions/dynamic-tools.ts`.

## ToolCallEvent — mutate or block

Hook subscription: `pi.on("tool_call", handler)`. Discriminated union `ToolCallEvent` at `types.ts:904-912` with eight variants — one per built-in tool (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`) plus `CustomToolCallEvent` for everything else (`types.ts:893-896`).

Per-variant shape: `{ type: "tool_call"; toolCallId: string; toolName: <literal>; input: <typed input> }`. The literal `toolName` discriminates the union, so `event.input` is fully typed inside each branch:

```ts
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash") {
    event.input.command;  // typed as string
  } else if (event.toolName === "edit") {
    event.input.path;     // typed as string
    event.input.oldText;  // typed as string
  } else {
    event.input;          // Record<string, unknown>
  }
});
```

### How to mutate input — **mutate `event.input` in place**

There is **no `setInput()` setter**. The contract is documented in the JSDoc above the union at `types.ts:830-836`:

> `event.input` is mutable. Mutate it in place to patch tool arguments before execution. Later `tool_call` handlers see earlier mutations. No re-validation is performed after mutation.

```ts
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash") {
    // Strip a leading "sudo " so the tool actually runs in user context
    if (event.input.command.startsWith("sudo ")) {
      event.input.command = event.input.command.slice(5);
    }
  }
});
```

**No re-validation runs after mutation** — if you mutate the shape into something that wouldn't have passed schema validation, the tool will see the bad shape and likely throw. Don't do that.

### How to block — return `{ block: true, reason }`

Result type `ToolCallEventResult` at `types.ts:1071-1080`:

```ts
{ block?: boolean; reason?: string }
```

The JSDoc at `:991` says: "Block tool execution. To modify arguments, mutate `event.input` in place instead." `reason` surfaces to the LLM as the tool result so it knows why it was blocked.

### Multiple handlers — chained, mutations are visible

Merge logic in `runner.ts` at `emitToolCall` (around `:817-835`). For each registered `tool_call` handler, in registration order:

1. Pass the **current** event (with all prior mutations applied) to the handler.
2. If the handler returns `{ block: true }`, short-circuit and surface the block.
3. Otherwise, the handler's in-place mutations to `event.input` carry forward to the next handler.

So later handlers see the patched input, not the original.

Examples: `examples/extensions/permission-gate.ts` (block dangerous commands), `examples/extensions/protected-paths.ts` (block writes to protected paths), `examples/extensions/bash-spawn-hook.ts` (rewrite command/cwd/env).

## tool_result — rewrite the result

Hook: `pi.on("tool_result", handler)`. Symmetric to `tool_call` but fires after execution. `ToolResultEvent` union at `types.ts:965-973`. Result type `ToolResultEventResult` (`types.ts:1090-1095`) lets a handler return `{ content?, details?, isError? }` to rewrite the result the LLM sees. Merge logic at `runner.ts:~762-805`.

Useful for: redacting sensitive output, normalizing error formats, injecting follow-up instructions in the result text.

## MessageEndEvent — replace the finalized message

Hook: `pi.on("message_end", handler)`. Result type `MessageEndEventResult` at `types.ts:1097-1100` — `{ message?: AgentMessage }`. The replacement returned in `result.message` becomes the message the rest of the system sees.

### The same-role rule

Merge logic at `runner.ts:756-796`. For each handler:

1. Build a fresh event with the **current** message and pass to handler.
2. If `handlerResult?.message` is set:
   - **Check role equality** at `runner.ts:771`: `if (handlerResult.message.role !== currentMessage.role) { ... }` → emits an `extension_error` and **discards** the replacement (`runner.ts:750-777`).
   - Otherwise, the replacement becomes the new `currentMessage` and chains forward (`runner.ts:750-781`).

So you can replace an assistant message with a different assistant message, but **you cannot turn an assistant message into a user message** via `message_end`. The constraint exists because the message tree's tool-call/tool-result pairing depends on role.

### Chained across handlers

Each handler in registration / load order sees the current message (post-prior-replacements). Final replacement is whatever survives the chain.

Examples: `examples/extensions/structured-output.ts`, `examples/extensions/truncated-tool.ts`.

## Cross-references

- Full hook event catalog incl. `tool_call`, `tool_result`, `message_end`: `reference/hook-events.md`.
- `ToolCallEvent` and `ToolResultEvent` payload shapes per built-in tool: see hook-events.md "Tool execution" section.
- TUI rendering for tool call/result: `renderCall` / `renderResult` in `ToolDefinition`. `ToolRenderContext` at `types.ts:419-444`.
