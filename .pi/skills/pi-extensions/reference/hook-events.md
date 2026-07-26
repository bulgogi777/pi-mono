# Hook Events

Complete catalog of pi extension hook events. Subscribe via `pi.on(eventName, handler)` from inside an extension factory; see `packages/coding-agent/src/core/extensions/types.ts:1146-1184` for the full overload list.

Payload **types** (the `*Event` interfaces and their `*Result` companions) are defined in `packages/coding-agent/src/core/extensions/types.ts`. Events are **emitted** from `packages/coding-agent/src/core/agent-session.ts`, `packages/coding-agent/src/core/agent-session-runtime.ts`, `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/extensions/runner.ts`, and `packages/coding-agent/src/modes/interactive/interactive-mode.ts`. Specialized emitters (`emitContext`, `emitToolCall`, `emitToolResult`, `emitUserBash`, `emitInput`, `emitBeforeProviderRequest`, `emitBeforeAgentStart`, `emitMessageEnd`, `emitResourcesDiscover`) live in `runner.ts:~700-1060` — they wrap result merging across multiple handlers. The generic `emit()` is for fire-and-forget events; `emitGeneric` covers the cancellable `session_before_*` family.

Cites verified against pi-mono at the current pin (`v0.79.10`, `8e190066`). The internal `types.ts:NNN` ranges for individual events drift between releases; if a line drifts, grep for the event-type string literal (e.g. `'project_trust'`, `'session_before_compact'`) — it is unique enough to relocate quickly.

## Startup (pre-resource)

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `project_trust` | Lets user/global and CLI `-e` extensions decide whether pi loads project-local `.pi/` resources for the current cwd. Fires before project-local extensions are loaded — project-local extensions cannot subscribe. Used to skip the built-in trust prompt or persist a yes/no decision. See `SKILL.md` “New in 0.79.x — project_trust event”. | `ProjectTrustEvent` (`types.ts:510-513`) | `ProjectTrustEventResult` (`types.ts:518-521`) — `{ trusted: "yes" \| "no" \| "undecided", remember?: boolean }` | `resource-loader.ts:349-346` (via `resolveProjectTrust` callback) → `project-trust.ts:54-70`; handler signature `ProjectTrustHandler` at `types.ts:529-532`; overload at `types.ts:1146` |

## Resources

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `resources_discover` | Discover skills, prompts, themes contributed by extensions. Fired on session start and reload. | `ResourcesDiscoverEvent` (`types.ts:502-507`) | `ResourcesDiscoverResult` (`types.ts:509-514`) | `agent-session.ts:2089` (via `emitResourcesDiscover`); merge logic at `runner.ts:1004-1073` |

## Session lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `session_start` | Session has been started, loaded, or reloaded (carries `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"`). | `SessionStartEvent` (`types.ts:520-527`) | — | `agent-session.ts:2080` (initial), `agent-session.ts:2406` (reload); seed value at `agent-session.ts:341` |
| `session_before_switch` | About to switch to another session; handler may cancel. | `SessionBeforeSwitchEvent` (`types.ts:529-533`) | `SessionBeforeSwitchResult` (`types.ts:1027-1029`) | `agent-session-runtime.ts:120-130` |
| `session_before_fork` | About to fork from an entry; handler may cancel or skip conversation restore. | `SessionBeforeForkEvent` (`types.ts:537-541`) | `SessionBeforeForkResult` (`types.ts:1031-1034`) | `agent-session-runtime.ts:137-147` |
| `session_before_compact` | About to compact; handler may cancel or supply a custom `CompactionResult`. Since 0.79.10 the payload carries `reason: "manual" \| "threshold" \| "overflow"` and `willRetry: boolean` so handlers can distinguish manual `/compact` vs threshold vs overflow-recovery flows. | `SessionBeforeCompactEvent` (`types.ts:569-586`) | `SessionBeforeCompactResult` (`types.ts:1069-1080`) | `agent-session.ts:1666-1681` and `agent-session.ts:1931-1943` (grep `emit.*session_before_compact` if drifted) |
| `session_compact` | Compaction completed. Since 0.79.10 carries `reason` and `willRetry` matching the `session_before_compact` event so a single handler can correlate begin/end. | `SessionCompactEvent` (`types.ts:589-598`) | — | `agent-session.ts:1729` and `agent-session.ts:2007` (grep `emit.*session_compact` if drifted) |
| `session_before_tree` | About to navigate the session tree (re-parent / branch summary); handler may cancel or override summary. | `SessionBeforeTreeEvent` (`types.ts:582-587`) | `SessionBeforeTreeResult` (`types.ts:1041-1052`) | `agent-session.ts:2808-2814` |
| `session_tree` | Session tree navigation completed. | `SessionTreeEvent` (`types.ts:589-596`) | — | `agent-session.ts:2915-2929` |
| `session_shutdown` | Extension runtime is being torn down (quit / reload / replacement). Last chance to flush. | `SessionShutdownEvent` (`types.ts:559-565`) | — | `agent-session-runtime.ts:150-156`, `agent-session-runtime.ts:367-373`, and `agent-session.ts:2402` (all via `emitSessionShutdownEvent`); helper at `runner.ts:180-190` |

## Provider I/O

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `context` | Last hook before each LLM call. Handler may return replacement `messages` (chained across handlers). | `ContextEvent` (`types.ts:612-617`) | `ContextEventResult` (`types.ts:978-989`) | `sdk.ts:367` (via `emitContext`); merge logic at `runner.ts:850-869` |
| `before_provider_request` | Final wire payload immediately before HTTP send. Handler may return a replacement payload (provider-specific shape). | `BeforeProviderRequestEvent` (`types.ts:618-622`) | `BeforeProviderRequestEventResult` (`types.ts:992`, `unknown`) | `sdk.ts:355` (via `emitBeforeProviderRequest`); merge logic at `runner.ts:930-958` |
| `after_provider_response` | After response headers received, before the stream is consumed. Useful for logging rate-limit headers. | `AfterProviderResponseEvent` (`types.ts:624-628`) | — | `sdk.ts:359-365` |

## Agent / turn / message lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `before_agent_start` | After user submits input, before the agent loop begins. Handler may inject a `CustomMessage` or replace the system prompt (chained). | `BeforeAgentStartEvent` (`types.ts:632-643`) | `BeforeAgentStartEventResult` (`types.ts:1019-1023`) | `agent-session.ts:1072` (via `emitBeforeAgentStart`); merge logic at `runner.ts:947-1019` |
| `agent_start` | Agent loop has started. | `AgentStartEvent` (`types.ts:644-648`) | — | `agent-session.ts:653-655` |
| `agent_end` | Agent loop has ended. Carries final `messages`. | `AgentEndEvent` (`types.ts:649-652`) | — | `agent-session.ts:656-657` |
| `turn_start` | Start of a single agent turn (one provider call). | `TurnStartEvent` (`types.ts:655-659`) | — | `agent-session.ts:658-664` |
| `turn_end` | End of a turn; includes assistant message + tool results. | `TurnEndEvent` (`types.ts:663-668`) | — | `agent-session.ts:665-672` |
| `message_start` | Any message (user / assistant / toolResult) is starting. | `MessageStartEvent` (`types.ts:670-667`) | — | `agent-session.ts:674-679` |
| `message_update` | Streaming token-level update during assistant message. | `MessageUpdateEvent` (`types.ts:676-680`) | — | `agent-session.ts:659-665` |
| `message_end` | Message has finalized. Handler may return a replacement message; replacement must keep the original role. | `MessageEndEvent` (`types.ts:673-686`) | `MessageEndEventResult` (`types.ts:1015-1017`) | `agent-session.ts:683` (via `emitMessageEnd`); merge logic at `runner.ts:749-738` |

## Tool execution

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `tool_execution_start` | Tool implementation is about to run (after argument validation). | `ToolExecutionStartEvent` (`types.ts:689-694`) | — | `agent-session.ts:687-693` |
| `tool_execution_update` | Streaming partial result during tool execution. | `ToolExecutionUpdateEvent` (`types.ts:697-703`) | — | `agent-session.ts:695-702` |
| `tool_execution_end` | Tool implementation finished (or errored). | `ToolExecutionEndEvent` (`types.ts:706-708`) | — | `agent-session.ts:704-712` |
| `tool_call` | Fired before tool dispatch. Handler may **mutate `event.input` in place** to patch arguments (chained — later handlers see earlier mutations) or return `{ block: true, reason }` to veto. No re-validation runs after mutation. | `ToolCallEvent` discriminated union (`types.ts:829-838`) — variants for `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`, plus `CustomToolCallEvent` for extension tools | `ToolCallEventResult` (`types.ts:993-998`) | `agent-session.ts:403` (via `emitToolCall`); merge logic at `runner.ts:840-858` |
| `tool_result` | Fired after tool returns. Handler may rewrite `content`, `details`, or `isError`. | `ToolResultEvent` discriminated union (`types.ts:888-896`) — same per-tool variants | `ToolResultEventResult` (`types.ts:1000-1012`) | `agent-session.ts:423` (via `emitToolResult`); merge logic at `runner.ts:792-835` |

## UI / user input

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `input` | User input received, before skill/template expansion and before agent processing. Handler may return `{action: "continue"}`, `{action: "transform", text, images}`, or `{action: "handled"}` to suppress. | `InputEvent` (`types.ts:758-759`) | `InputEventResult` (`types.ts:769-772`) | `agent-session.ts:985` (via `emitInput`); merge logic at `runner.ts:1079-1101` |
| `user_bash` | User executed a `!`/`!!` shell command. Handler may supply custom `BashOperations` or fully replace the result. | `UserBashEvent` (`types.ts:734-749`) | `UserBashEventResult` (`types.ts:1000-1005`) | `interactive-mode.ts:5289` (via `emitUserBash`); merge logic at `runner.ts:820-880` |
| `model_select` | User selected a new model (via `set`, `cycle`, or `restore`). | `ModelSelectEvent` (`types.ts:721-728`) | — | `agent-session.ts:1410-1414` |
| `thinking_level_select` | User changed the thinking level. | `ThinkingLevelSelectEvent` (`types.ts:729-732`) | — | `agent-session.ts:1532-1533` |

## Cross-references

- Union of all events: `ExtensionEvent` (`types.ts:959-956`).
- `pi.on(...)` overload list: `types.ts:1097-1140`.
- Generic `runner.emit()` plus the cancellable `RunnerEmitEvent`/`RunnerEmitResult` machinery: `runner.ts:112-160`.
- `hasHandlers(eventName)` short-circuit (used everywhere to skip emit when no extension subscribed): defined on the runner and called e.g. `agent-session.ts:994`, `agent-session.ts:1666`, `agent-session.ts:1931`, `agent-session.ts:2085`, `agent-session.ts:2808`, `sdk.ts:359`, `agent-session-runtime.ts:120`/`137`, `runner.ts:184`.
- Result merging is **handler-order sensitive** for: `context`, `before_provider_request`, `before_agent_start` (system prompt chained), `tool_call` (mutations chained), `tool_result`, `message_end`, `input`, `user_bash`. Read the merge logic in `runner.ts` for the exact precedence rules.
