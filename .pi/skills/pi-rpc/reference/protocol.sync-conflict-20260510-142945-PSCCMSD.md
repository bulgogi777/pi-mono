# RPC Protocol

The full wire-protocol reference for `pi --mode rpc`. All cites against pi-mono `HEAD` on the date this file was written. The wire schema is defined in **one** file: `packages/coding-agent/src/modes/rpc/rpc-types.ts` (264 lines, the entire union of every command, response, event, and extension-UI message). The dispatcher is `packages/coding-agent/src/modes/rpc/rpc-mode.ts` (754 lines). The framer is `jsonl.ts` (58 lines). Canonical doc: `packages/coding-agent/docs/rpc.md`.

## Framing

JSONL with **LF-only** record delimiters. Documented at `packages/coding-agent/docs/rpc.md:29-40`; implemented at `packages/coding-agent/src/modes/rpc/jsonl.ts:1-58`.

Rules:

- One JSON value per line. `serializeJsonLine` (`jsonl.ts:10-12`) is just `JSON.stringify(value) + "\n"`.
- Split incoming records on `\n` only. Strip an optional trailing `\r` per record (`jsonl.ts:25-27`).
- **Do not use Node `readline`.** Documented at `jsonl.ts:13-21`: readline splits on additional Unicode separators (notably U+2028 and U+2029) which are valid inside JSON strings. Using readline corrupts payloads silently the moment an LLM emits a paragraph separator. Use `attachJsonlLineReader` from `jsonl.ts:21-58`, or replicate its loop (UTF-8 decoder + `indexOf("\n")` + buffer remainder).

Direction:
- **Stdin** carries `RpcCommand` and `RpcExtensionUIResponse` JSON lines from the host into pi.
- **Stdout** carries `RpcResponse`, the `AgentSessionEvent` stream, and `RpcExtensionUIRequest` JSON lines from pi back to the host. Pi's stdout is "taken over" by `takeOverStdout()` at `rpc-mode.ts:49` so accidental `console.log` from extensions is captured and re-routed (otherwise it would corrupt the JSONL stream).

## Request/response correlation

Every `RpcCommand` has an optional `id?: string` (`rpc-types.ts:21`). When set, the `RpcResponse` echoes the same `id` (`rpc-types.ts:111+`). Hosts SHOULD set `id` on every command and demultiplex by it; the schema also permits omitting `id` for fire-and-forget hosts.

Events (the `AgentSessionEvent` stream — see below) **never** carry an `id`. They are unsolicited stdout traffic.

## RpcCommand catalog

The discriminated union is `RpcCommand` at `rpc-types.ts:19-69`. Per-command handler dispatch is the `switch (command.type)` block in `rpc-mode.ts:handleCommand` (`rpc-mode.ts:374-700`). The grouping below mirrors the type file; `Lines` points to the type-union variant in `rpc-types.ts`; `Handler` points to the case body in `rpc-mode.ts`.

### Prompting (responses are async)

| `type` | Args | Lines | Handler | Response data | Notes |
|---|---|---|---|---|---|
| `prompt` | `message`, `images?`, `streamingBehavior?` | `:21` | `rpc-mode.ts:379-401` | (no `data`) | Authoritative `success: true` is emitted only after the prompt **preflight** succeeds (`rpc-mode.ts:382-396`). If the agent is already streaming and `streamingBehavior` is missing, fails. |
| `steer` | `message`, `images?` | `:22` | `rpc-mode.ts:403-407` | — | Queue while streaming, delivered after the current assistant turn finishes its tool calls, before the next LLM call. Skill / template expansion runs; extension commands rejected. |
| `follow_up` | `message`, `images?` | `:23` | `rpc-mode.ts:408-412` | — | Queue until the agent is fully idle, then deliver. |
| `abort` | — | `:24` | `rpc-mode.ts:413-417` | — | Cancels the running agent (sets the abort signal). Does not wait for completion. |
| `new_session` | `parentSession?` | `:25` | `rpc-mode.ts:418-430` | `{ cancelled: boolean }` | Cancellable via `session_before_switch` hook. `cancelled: true` means an extension vetoed. |

### Streaming behavior

`streamingBehavior` on `prompt` is `"steer" | "followUp"` (`rpc-types.ts:21`). Identical semantics to the dedicated `steer` / `follow_up` commands; the field exists so a host can offer "send" + dropdown rather than three buttons. If the agent is idle, `streamingBehavior` is ignored and the prompt runs immediately.

### State / introspection

| `type` | Lines | Handler | Response data |
|---|---|---|---|
| `get_state` | `:28` | `rpc-mode.ts:431-452` | `RpcSessionState` (`rpc-types.ts:88-103`): `model`, `thinkingLevel`, `isStreaming`, `isCompacting`, `steeringMode`, `followUpMode`, `sessionFile`, `sessionId`, `sessionName`, `autoCompactionEnabled`, `messageCount`, `pendingMessageCount`. |
| `get_messages` | `:67` | `rpc-mode.ts:614-621` | `{ messages: AgentMessage[] }` |
| `get_session_stats` | `:55` | `rpc-mode.ts:553-557` | `SessionStats` (`agent-session.ts`) |
| `get_last_assistant_text` | `:62` | `rpc-mode.ts:596-600` | `{ text: string \| null }` |
| `get_fork_messages` | `:61` | `rpc-mode.ts:591-595` | `{ messages: Array<{ entryId, text }> }` — for fork-target picker UIs. |
| `get_commands` | `:69` | `rpc-mode.ts:622-…` | `{ commands: RpcSlashCommand[] }` (`rpc-types.ts:78-86`) |
| `get_available_models` | `:32` | `rpc-mode.ts:471-479` | `{ models: Model<any>[] }` |

### Model / thinking

| `type` | Args | Lines | Handler | Response |
|---|---|---|---|---|
| `set_model` | `provider`, `modelId` | `:31` | `rpc-mode.ts:453-462` | `data: Model<any>` |
| `cycle_model` | — | `:33` | `rpc-mode.ts:463-470` | `data: { model, thinkingLevel, isScoped } \| null` |
| `set_thinking_level` | `level: ThinkingLevel` | `:36` | `rpc-mode.ts:480-484` | (no `data`) |
| `cycle_thinking_level` | — | `:37` | `rpc-mode.ts:485-496` | `data: { level } \| null` |

### Queue modes

| `type` | Args | Lines | Handler |
|---|---|---|---|
| `set_steering_mode` | `mode: "all" \| "one-at-a-time"` | `:40` | `rpc-mode.ts:497-501` |
| `set_follow_up_mode` | `mode: "all" \| "one-at-a-time"` | `:41` | `rpc-mode.ts:502-506` |

### Compaction / retry

| `type` | Args | Lines | Handler | Response |
|---|---|---|---|---|
| `compact` | `customInstructions?` | `:44` | `rpc-mode.ts:511-515` | `data: CompactionResult` |
| `set_auto_compaction` | `enabled: boolean` | `:45` | `rpc-mode.ts:516-524` | — |
| `set_auto_retry` | `enabled: boolean` | `:48` | `rpc-mode.ts:525-529` | — |
| `abort_retry` | — | `:49` | `rpc-mode.ts:530-538` | — |

### Bash

| `type` | Args | Lines | Handler | Response |
|---|---|---|---|---|
| `bash` | `command: string` | `:52` | `rpc-mode.ts:539-543` | `data: BashResult` |
| `abort_bash` | — | `:53` | `rpc-mode.ts:544-552` | — |

### Session manipulation

| `type` | Args | Lines | Handler | Response |
|---|---|---|---|---|
| `export_html` | `outputPath?` | `:56` | `rpc-mode.ts:558-562` | `data: { path: string }` |
| `switch_session` | `sessionPath: string` | `:57` | `rpc-mode.ts:563-570` | `data: { cancelled: boolean }` — cancellable via `session_before_switch` |
| `fork` | `entryId: string` | `:58` | `rpc-mode.ts:571-578` | `data: { text: string; cancelled: boolean }` — cancellable via `session_before_fork` |
| `clone` | — | `:59` | `rpc-mode.ts:579-590` | `data: { cancelled: boolean }` |
| `set_session_name` | `name: string` | `:63` | `rpc-mode.ts:601-613` | — |

`fork` performs an in-place leaf-move-plus-summary inside the same `.jsonl`. The new-file `forkFrom` operation lives behind `--fork` at startup, not behind this RPC command — see **pi-sessions** for the in-place-vs-new-file distinction.

### Generic error response

Any command can fail with `{ id, type: "response", command, success: false, error: string }` (`rpc-types.ts:111+`). Parse failures (malformed JSON line) come back with `command: "parse"` (`rpc.md:1190-1198`).

## Event stream

Pi emits the `AgentSessionEvent` union (`packages/coding-agent/src/core/agent-session.ts:~102`, also documented at `packages/coding-agent/docs/json.md:11-21`). It composes the base `AgentEvent` from `packages/agent/src/types.ts:~179` plus pi-coding-agent-specific events. Events have no `id` field.

| Event `type` | Payload | Emitted when |
|---|---|---|
| `agent_start` | — | Agent begins processing a prompt. |
| `agent_end` | `messages: AgentMessage[]` | Agent fully idle for this run. |
| `turn_start` | — | Each turn begins (one assistant response + its tool results). |
| `turn_end` | `message: AgentMessage`, `toolResults: ToolResultMessage[]` | Each turn completes. |
| `message_start` | `message: AgentMessage` | Any message (user / assistant / toolResult) begins. |
| `message_update` | `message: AgentMessage`, `assistantMessageEvent: AssistantMessageEvent` | Streaming delta during assistant message. The `assistantMessageEvent` field is the **delta sub-event** — see next table. |
| `message_end` | `message: AgentMessage` | Message finalized. |
| `tool_execution_start` | `toolCallId`, `toolName`, `args` | Tool implementation begins. |
| `tool_execution_update` | `toolCallId`, `toolName`, `args`, `partialResult` | Tool emits partial output. `partialResult` is the **accumulated** state, not the delta — clients can replace their display on each event. |
| `tool_execution_end` | `toolCallId`, `toolName`, `result`, `isError` | Tool finished. |
| `queue_update` | `steering: readonly string[]`, `followUp: readonly string[]` | Pending steering or follow-up queue changed. |
| `compaction_start` | `reason: "manual" \| "threshold" \| "overflow"` | Compaction begins. |
| `compaction_end` | `reason`, `result?: CompactionResult`, `aborted: boolean`, `willRetry: boolean`, `errorMessage?: string` | Compaction completes (or fails). |
| `auto_retry_start` | `attempt`, `maxAttempts`, `delayMs`, `errorMessage` | After a transient provider error. |
| `auto_retry_end` | `success: boolean`, `attempt: number`, `finalError?: string` | Retry resolved (success or final failure). |
| `extension_error` | `extensionPath: string`, `event: string`, `error: string` | An extension threw inside a hook. Emitted from `rpc-mode.ts:343-345` via the `onError` callback. |

### `assistantMessageEvent` delta types

The `message_update` event's `assistantMessageEvent` field is itself a discriminated union. Documented at `rpc.md:826-841`:

| `type` | Payload (highlights) | Meaning |
|---|---|---|
| `start` | `partial` | Assistant message generation started. |
| `text_start` | `contentIndex`, `partial` | New text content block opened. |
| `text_delta` | `contentIndex`, `delta`, `partial` | Text chunk appended. |
| `text_end` | `contentIndex`, `content`, `partial` | Text block closed. |
| `thinking_start` / `thinking_delta` / `thinking_end` | (analogous) | Extended-thinking content block. |
| `toolcall_start` | `contentIndex`, `partial` | New tool call block opened. |
| `toolcall_delta` | `contentIndex`, `delta`, `partial` | Tool-call argument JSON chunk. |
| `toolcall_end` | `contentIndex`, `toolCall`, `partial` | Tool call closed; full `toolCall` available. |
| `done` | `reason: "stop" \| "length" \| "toolUse"` | Message complete. |
| `error` | `reason: "aborted" \| "error"` | Stream errored or was aborted. |

Typical streaming text response wire trace: `start` → `text_start` → many `text_delta` → `text_end` → `done`. With tools: `start` → maybe text → `toolcall_start` → many `toolcall_delta` → `toolcall_end` → `done(toolUse)`.

## Cross-references

- The extension UI sub-protocol (`extension_ui_request` / `extension_ui_response`) is its own deep-dive: see `reference/extension-ui-bridge.md`.
- For embedding strategy (subprocess `RpcClient` vs in-process `AgentSession`), see `reference/sdk-embedding.md` (TBW).
- For the `--mode json` one-shot variant, see `reference/json-mode.md` (TBW). Same event stream, no command channel.
- Hook events in this list (`session_before_compact`, `session_before_switch`, `session_before_fork`) that **cancel** RPC commands are documented from the extension-author angle in **pi-extensions**' `reference/hook-events.md`.
- Session manipulation commands (`fork`, `clone`, `switch_session`) interact with the on-disk format documented in **pi-sessions**.
