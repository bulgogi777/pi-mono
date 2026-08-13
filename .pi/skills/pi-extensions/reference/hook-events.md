# Hook Events

Complete catalog of pi extension hook events. Subscribe via `pi.on(eventName, handler)` from inside an extension factory; see `packages/coding-agent/src/core/extensions/types.ts:1165-1203` for the full overload list.

Payload **types** (the `*Event` interfaces and their `*Result` companions) are defined in `packages/coding-agent/src/core/extensions/types.ts`. Events are **emitted** from `packages/coding-agent/src/core/agent-session.ts`, `packages/coding-agent/src/core/agent-session-runtime.ts`, `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/extensions/runner.ts`, and `packages/coding-agent/src/modes/interactive/interactive-mode.ts`. Specialized emitters (`emitContext`, `emitToolCall`, `emitToolResult`, `emitUserBash`, `emitInput`, `emitBeforeProviderRequest`, `emitBeforeAgentStart`, `emitMessageEnd`, `emitResourcesDiscover`) live in `runner.ts:~700-1060` — they wrap result merging across multiple handlers. The generic `emit()` is for fire-and-forget events; `emitGeneric` covers the cancellable `session_before_*` family.

Cites verified against pi-mono at the current pin (`v0.84.1`, `53fa77cc`). The internal `types.ts:NNN` ranges for individual events drift between releases; if a line drifts, grep for the event-type string literal (e.g. `'project_trust'`, `'session_before_compact'`) — it is unique enough to relocate quickly.

## Startup (pre-resource)

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `project_trust` | Lets user/global and CLI `-e` extensions decide whether pi loads project-local `.pi/` resources for the current cwd. Fires before project-local extensions are loaded — project-local extensions cannot subscribe. Used to skip the built-in trust prompt or persist a yes/no decision. See `SKILL.md` “New in 0.79.x — project_trust event”. | `ProjectTrustEvent` (`types.ts:516-519`) | `ProjectTrustEventResult` (`types.ts:524-527`) — `{ trusted: "yes" \| "no" \| "undecided", remember?: boolean }` | `resource-loader.ts:395-399` (via `resolveProjectTrust` callback) → `core/project-trust.ts:54-70`; handler signature `ProjectTrustHandler` at `types.ts:535-538`; overload at `types.ts:1165` |

## Resources

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `resources_discover` | Discover skills, prompts, themes contributed by extensions. Fired on session start and reload. | `ResourcesDiscoverEvent` (`types.ts:544-548`) | `ResourcesDiscoverResult` (`types.ts:551-555`) | `agent-session.ts:2093` (via `emitResourcesDiscover`); merge logic at `runner.ts:1147-1193` |

## Session lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `session_start` | Session has been started, loaded, or reloaded (carries `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"`). | `SessionStartEvent` (`types.ts:562-568`) | — | `agent-session.ts:2084` (initial), `agent-session.ts:2414` (reload); seed value at `agent-session.ts:343` |
| `session_before_switch` | About to switch to another session; handler may cancel. | `SessionBeforeSwitchEvent` (`types.ts:578-582`) | `SessionBeforeSwitchResult` (`types.ts:1108-1110`) | `agent-session-runtime.ts:120-130` |
| `session_before_fork` | About to fork from an entry; handler may cancel or skip conversation restore. | `SessionBeforeForkEvent` (`types.ts:585-589`) | `SessionBeforeForkResult` (`types.ts:1112-1115`) | `agent-session-runtime.ts:137-147` |
| `session_before_compact` | About to compact; handler may cancel or supply a custom `CompactionResult`. Since 0.79.10 the payload carries `reason: "manual" \| "threshold" \| "overflow"` and `willRetry: boolean` so handlers can distinguish manual `/compact` vs threshold vs overflow-recovery flows. | `SessionBeforeCompactEvent` (`types.ts:592-602`) | `SessionBeforeCompactResult` (`types.ts:1117-1120`) | `agent-session.ts:1673-1688` and `agent-session.ts:1939-1951` (grep `emit.*session_before_compact` if drifted) |
| `session_compact` | Compaction completed. Since 0.79.10 carries `reason` and `willRetry` matching the `session_before_compact` event so a single handler can correlate begin/end. | `SessionCompactEvent` (`types.ts:605-613`) | — | `agent-session.ts:1736` and `agent-session.ts:2018` (grep `emit.*session_compact` if drifted) |
| `session_before_tree` | About to navigate the session tree (re-parent / branch summary); handler may cancel or override summary. | `SessionBeforeTreeEvent` (`types.ts:639-643`) | `SessionBeforeTreeResult` (`types.ts:1122-1135`) | `agent-session.ts:2820-2826` |
| `session_tree` | Session tree navigation completed. | `SessionTreeEvent` (`types.ts:646-652`) | — | `agent-session.ts:2933-2947` |
| `session_shutdown` | Extension runtime is being torn down (quit / reload / replacement). Last chance to flush. | `SessionShutdownEvent` (`types.ts:616-621`) | — | `agent-session-runtime.ts:150-156`, `agent-session-runtime.ts:370-376`, and `agent-session.ts:2410` (all via `emitSessionShutdownEvent`); helper at `runner.ts:192-201` |

## Provider I/O

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `context` | Last hook before each LLM call. Handler may return replacement `messages` (chained across handlers). | `ContextEvent` (`types.ts:670-673`) | `ContextEventResult` (`types.ts:1065-1067`) | `sdk.ts:367` (via `emitContext`); merge logic at `runner.ts:984-1014` |
| `before_provider_request` | Final wire payload immediately before HTTP send. Handler may return a replacement payload (provider-specific shape). | `BeforeProviderRequestEvent` (`types.ts:676-679`) | `BeforeProviderRequestEventResult` (`types.ts:1069`, `unknown`) | `sdk.ts:355` (via `emitBeforeProviderRequest`); merge logic at `runner.ts:1016-1048` |
| `after_provider_response` | After response headers received, before the stream is consumed. Useful for logging rate-limit headers. | `AfterProviderResponseEvent` (`types.ts:692-696`) | — | `sdk.ts:359-365` |

## Agent / turn / message lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `before_agent_start` | After user submits input, before the agent loop begins. Handler may inject a `CustomMessage` or replace the system prompt (chained). | `BeforeAgentStartEvent` (`types.ts:699-709`) | `BeforeAgentStartEventResult` (`types.ts:1102-1106`) | `agent-session.ts:1074` (via `emitBeforeAgentStart`); merge logic at `runner.ts:1081-1145` |
| `agent_start` | Agent loop has started. | `AgentStartEvent` (`types.ts:712-714`) | — | `agent-session.ts:668-670` |
| `agent_end` | Agent loop has ended. Carries final `messages`. | `AgentEndEvent` (`types.ts:717-720`) | — | `agent-session.ts:671-672` |
| `turn_start` | Start of a single agent turn (one provider call). | `TurnStartEvent` (`types.ts:728-732`) | — | `agent-session.ts:673-679` |
| `turn_end` | End of a turn; includes assistant message + tool results. | `TurnEndEvent` (`types.ts:735-740`) | — | `agent-session.ts:680-687` |
| `message_start` | Any message (user / assistant / toolResult) is starting. | `MessageStartEvent` (`types.ts:743-746`) | — | `agent-session.ts:689-694` |
| `message_update` | Streaming token-level update during assistant message. | `MessageUpdateEvent` (`types.ts:749-753`) | — | `agent-session.ts:674-680` |
| `message_end` | Message has finalized. Handler may return a replacement message; replacement must keep the original role. | `MessageEndEvent` (`types.ts:756-759`) | `MessageEndEventResult` (`types.ts:1097-1100`) | `agent-session.ts:698` (via `emitMessageEnd`); merge logic at `runner.ts:835-875` |

## Tool execution

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `tool_execution_start` | Tool implementation is about to run (after argument validation). | `ToolExecutionStartEvent` (`types.ts:762-767`) | — | `agent-session.ts:702-708` |
| `tool_execution_update` | Streaming partial result during tool execution. | `ToolExecutionUpdateEvent` (`types.ts:770-776`) | — | `agent-session.ts:710-717` |
| `tool_execution_end` | Tool implementation finished (or errored). | `ToolExecutionEndEvent` (`types.ts:779-785`) | — | `agent-session.ts:719-727` |
| `tool_call` | Fired before tool dispatch. Handler may **mutate `event.input` in place** to patch arguments (chained — later handlers see earlier mutations) or return `{ block: true, reason }` to veto. No re-validation runs after mutation. | `ToolCallEvent` discriminated union (`types.ts:904-912`) — variants for `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`, plus `CustomToolCallEvent` for extension tools | `ToolCallEventResult` (`types.ts:1071-1080`) | `agent-session.ts:405` (via `emitToolCall`); merge logic at `runner.ts:932-953` |
| `tool_result` | Fired after tool returns. Handler may rewrite `content`, `details`, or `isError`. | `ToolResultEvent` discriminated union (`types.ts:965-973`) — same per-tool variants | `ToolResultEventResult` (`types.ts:1090-1095`) | `agent-session.ts:423` (via `emitToolResult`); merge logic at `runner.ts:877-930` |

## UI / user input

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `input` | User input received, before skill/template expansion and before agent processing. Handler may return `{action: "continue"}`, `{action: "transform", text, images}`, or `{action: "handled"}` to suppress. | `InputEvent` (`types.ts:831-841`) | `InputEventResult` (`types.ts:844-847`) | `agent-session.ts:987` (via `emitInput`); merge logic at `runner.ts:1196-1235` |
| `user_bash` | User executed a `!`/`!!` shell command. Handler may supply custom `BashOperations` or fully replace the result. | `UserBashEvent` (`types.ts:813-821`) | `UserBashEventResult` (`types.ts:1083-1088`) | `interactive-mode.ts:5653` (via `emitUserBash`); merge logic at `runner.ts:955-982` |
| `model_select` | User selected a new model (via `set`, `cycle`, or `restore`). | `ModelSelectEvent` (`types.ts:794-799`) | — | `agent-session.ts:1418-1422` |
| `thinking_level_select` | User changed the thinking level. | `ThinkingLevelSelectEvent` (`types.ts:802-806`) | — | `agent-session.ts:1540-1541` |

## Cross-references

- Union of all events: `ExtensionEvent` (`types.ts:1034-1059`).
- `pi.on(...)` overload list: `types.ts:1108-1159`.
- Generic `runner.emit()` plus the cancellable `RunnerEmitEvent`/`RunnerEmitResult` machinery: `runner.ts:114-162`.
- `hasHandlers(eventName)` short-circuit (used everywhere to skip emit when no extension subscribed): defined on the runner and called e.g. `agent-session.ts:996`, `agent-session.ts:1673`, `agent-session.ts:1939`, `agent-session.ts:2089`, `agent-session.ts:2820`, `sdk.ts:359`, `agent-session-runtime.ts:120`/`137`, `runner.ts:186`.
- Result merging is **handler-order sensitive** for: `context`, `before_provider_request`, `before_agent_start` (system prompt chained), `tool_call` (mutations chained), `tool_result`, `message_end`, `input`, `user_bash`. Read the merge logic in `runner.ts` for the exact precedence rules.
