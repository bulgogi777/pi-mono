# Hook Events

Complete catalog of pi extension hook events. Subscribe via `pi.on(eventName, handler)` from inside an extension factory; see `packages/coding-agent/src/core/extensions/types.ts:1133-1170` for the full overload list.

Payload **types** (the `*Event` interfaces and their `*Result` companions) are defined in `packages/coding-agent/src/core/extensions/types.ts`. Events are **emitted** from `packages/coding-agent/src/core/agent-session.ts`, `packages/coding-agent/src/core/agent-session-runtime.ts`, `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/extensions/runner.ts`, and `packages/coding-agent/src/modes/interactive/interactive-mode.ts`. Specialized emitters (`emitContext`, `emitToolCall`, `emitToolResult`, `emitUserBash`, `emitInput`, `emitBeforeProviderRequest`, `emitBeforeAgentStart`, `emitMessageEnd`, `emitResourcesDiscover`) live in `runner.ts:~700-1060` — they wrap result merging across multiple handlers. The generic `emit()` is for fire-and-forget events; `emitGeneric` covers the cancellable `session_before_*` family.

Cites verified against pi-mono at the current pin (`v0.79.10`, `8e190066`). The internal `types.ts:NNN` ranges for individual events drift between releases; if a line drifts, grep for the event-type string literal (e.g. `'project_trust'`, `'session_before_compact'`) — it is unique enough to relocate quickly.

## Startup (pre-resource)

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `project_trust` | Lets user/global and CLI `-e` extensions decide whether pi loads project-local `.pi/` resources for the current cwd. Fires before project-local extensions are loaded — project-local extensions cannot subscribe. Used to skip the built-in trust prompt or persist a yes/no decision. See `SKILL.md` “New in 0.79.x — project_trust event”. | `ProjectTrustEvent` (`types.ts:503-505`) | `ProjectTrustEventResult` (`types.ts:510-513`) — `{ trusted: "yes" \| "no" \| "undecided", remember?: boolean }` | `resource-loader.ts:346-350` (via `resolveProjectTrust` callback) → `project-trust.ts:54-70`; handler signature `ProjectTrustHandler` at `types.ts:522-525`; overload at `types.ts:1133` |

## Resources

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `resources_discover` | Discover skills, prompts, themes contributed by extensions. Fired on session start and reload. | `ResourcesDiscoverEvent` (`types.ts:495-500`) | `ResourcesDiscoverResult` (`types.ts:502-507`) | `agent-session.ts:2075` (via `emitResourcesDiscover`); merge logic at `runner.ts:1004-1039` |

## Session lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `session_start` | Session has been started, loaded, or reloaded (carries `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"`). | `SessionStartEvent` (`types.ts:513-520`) | — | `agent-session.ts:2066` (initial), `agent-session.ts:2417` (reload); seed value at `agent-session.ts:322` |
| `session_before_switch` | About to switch to another session; handler may cancel. | `SessionBeforeSwitchEvent` (`types.ts:522-526`) | `SessionBeforeSwitchResult` (`types.ts:1018-1020`) | `agent-session-runtime.ts:120-130` |
| `session_before_fork` | About to fork from an entry; handler may cancel or skip conversation restore. | `SessionBeforeForkEvent` (`types.ts:529-533`) | `SessionBeforeForkResult` (`types.ts:1022-1025`) | `agent-session-runtime.ts:137-147` |
| `session_before_compact` | About to compact; handler may cancel or supply a custom `CompactionResult`. Since 0.79.10 the payload carries `reason: "manual" \| "threshold" \| "overflow"` and `willRetry: boolean` so handlers can distinguish manual `/compact` vs threshold vs overflow-recovery flows. | `SessionBeforeCompactEvent` (`types.ts:569-579`) | `SessionBeforeCompactResult` (`types.ts:1068-1071`) | `agent-session.ts:1655-1670` and `agent-session.ts:1913-1925` (grep `emit.*session_before_compact` if drifted) |
| `session_compact` | Compaction completed. Since 0.79.10 carries `reason` and `willRetry` matching the `session_before_compact` event so a single handler can correlate begin/end. | `SessionCompactEvent` (`types.ts:582-590`) | — | `agent-session.ts:1717` and `agent-session.ts:1989` (grep `emit.*session_compact` if drifted) |
| `session_before_tree` | About to navigate the session tree (re-parent / branch summary); handler may cancel or override summary. | `SessionBeforeTreeEvent` (`types.ts:575-580`) | `SessionBeforeTreeResult` (`types.ts:1032-1043`) | `agent-session.ts:2749-2755` |
| `session_tree` | Session tree navigation completed. | `SessionTreeEvent` (`types.ts:582-588`) | — | `agent-session.ts:2867-2870` |
| `session_shutdown` | Extension runtime is being torn down (quit / reload / replacement). Last chance to flush. | `SessionShutdownEvent` (`types.ts:552-558`) | — | `agent-session-runtime.ts:150-156`, `agent-session-runtime.ts:367-373`, and `agent-session.ts:2401` (all via `emitSessionShutdownEvent`); helper at `runner.ts:180-190` |

## Provider I/O

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `context` | Last hook before each LLM call. Handler may return replacement `messages` (chained across handlers). | `ContextEvent` (`types.ts:605-609`) | `ContextEventResult` (`types.ts:978-980`) | `sdk.ts:367` (via `emitContext`); merge logic at `runner.ts:863-889` |
| `before_provider_request` | Final wire payload immediately before HTTP send. Handler may return a replacement payload (provider-specific shape). | `BeforeProviderRequestEvent` (`types.ts:611-615`) | `BeforeProviderRequestEventResult` (`types.ts:982`, `unknown`) | `sdk.ts:350` (via `emitBeforeProviderRequest`); merge logic at `runner.ts:895-923` |
| `after_provider_response` | After response headers received, before the stream is consumed. Useful for logging rate-limit headers. | `AfterProviderResponseEvent` (`types.ts:617-621`) | — | `sdk.ts:354-360` |

## Agent / turn / message lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `before_agent_start` | After user submits input, before the agent loop begins. Handler may inject a `CustomMessage` or replace the system prompt (chained). | `BeforeAgentStartEvent` (`types.ts:624-635`) | `BeforeAgentStartEventResult` (`types.ts:1010-1014`) | `agent-session.ts:1068` (via `emitBeforeAgentStart`); merge logic at `runner.ts:943-985` |
| `agent_start` | Agent loop has started. | `AgentStartEvent` (`types.ts:637-640`) | — | `agent-session.ts:632-634` |
| `agent_end` | Agent loop has ended. Carries final `messages`. | `AgentEndEvent` (`types.ts:642-645`) | — | `agent-session.ts:635-636` |
| `turn_start` | Start of a single agent turn (one provider call). | `TurnStartEvent` (`types.ts:648-652`) | — | `agent-session.ts:637-643` |
| `turn_end` | End of a turn; includes assistant message + tool results. | `TurnEndEvent` (`types.ts:655-660`) | — | `agent-session.ts:644-651` |
| `message_start` | Any message (user / assistant / toolResult) is starting. | `MessageStartEvent` (`types.ts:663-666`) | — | `agent-session.ts:653-658` |
| `message_update` | Streaming token-level update during assistant message. | `MessageUpdateEvent` (`types.ts:669-673`) | — | `agent-session.ts:659-665` |
| `message_end` | Message has finalized. Handler may return a replacement message; replacement must keep the original role. | `MessageEndEvent` (`types.ts:676-679`) | `MessageEndEventResult` (`types.ts:1006-1008`) | `agent-session.ts:671` (via `emitMessageEnd`); merge logic at `runner.ts:720-757` |

## Tool execution

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `tool_execution_start` | Tool implementation is about to run (after argument validation). | `ToolExecutionStartEvent` (`types.ts:682-687`) | — | `agent-session.ts:675-682` |
| `tool_execution_update` | Streaming partial result during tool execution. | `ToolExecutionUpdateEvent` (`types.ts:690-696`) | — | `agent-session.ts:683-691` |
| `tool_execution_end` | Tool implementation finished (or errored). | `ToolExecutionEndEvent` (`types.ts:699-707`) | — | `agent-session.ts:692-700` |
| `tool_call` | Fired before tool dispatch. Handler may **mutate `event.input` in place** to patch arguments (chained — later handlers see earlier mutations) or return `{ block: true, reason }` to veto. No re-validation runs after mutation. | `ToolCallEvent` discriminated union (`types.ts:822-831`) — variants for `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`, plus `CustomToolCallEvent` for extension tools | `ToolCallEventResult` (`types.ts:984-989`) | `agent-session.ts:384` (via `emitToolCall`); merge logic at `runner.ts:811-829` |
| `tool_result` | Fired after tool returns. Handler may rewrite `content`, `details`, or `isError`. | `ToolResultEvent` discriminated union (`types.ts:881-889`) — same per-tool variants | `ToolResultEventResult` (`types.ts:998-1003`) | `agent-session.ts:404` (via `emitToolResult`); merge logic at `runner.ts:762-805` |

## UI / user input

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `input` | User input received, before skill/template expansion and before agent processing. Handler may return `{action: "continue"}`, `{action: "transform", text, images}`, or `{action: "handled"}` to suppress. | `InputEvent` (`types.ts:751-760`) | `InputEventResult` (`types.ts:762-765`) | `agent-session.ts:983` (via `emitInput`); merge logic at `runner.ts:1045-1066` |
| `user_bash` | User executed a `!`/`!!` shell command. Handler may supply custom `BashOperations` or fully replace the result. | `UserBashEvent` (`types.ts:733-742`) | `UserBashEventResult` (`types.ts:991-996`) | `interactive-mode.ts:5300` (via `emitUserBash`); merge logic at `runner.ts:833-859` |
| `model_select` | User selected a new model (via `set`, `cycle`, or `restore`). | `ModelSelectEvent` (`types.ts:714-720`) | — | `agent-session.ts:1398-1402` |
| `thinking_level_select` | User changed the thinking level. | `ThinkingLevelSelectEvent` (`types.ts:722-725`) | — | `agent-session.ts:1520-1525` |

## Cross-references

- Union of all events: `ExtensionEvent` (`types.ts:950-972`).
- `pi.on(...)` overload list: `types.ts:1086-1126`.
- Generic `runner.emit()` plus the cancellable `RunnerEmitEvent`/`RunnerEmitResult` machinery: `runner.ts:112-160`.
- `hasHandlers(eventName)` short-circuit (used everywhere to skip emit when no extension subscribed): defined on the runner and called e.g. `agent-session.ts:982`, `agent-session.ts:1655`, `agent-session.ts:1913`, `agent-session.ts:2071`, `agent-session.ts:2749`, `sdk.ts:354`, `agent-session-runtime.ts:120`/`137`, `runner.ts:184`.
- Result merging is **handler-order sensitive** for: `context`, `before_provider_request`, `before_agent_start` (system prompt chained), `tool_call` (mutations chained), `tool_result`, `message_end`, `input`, `user_bash`. Read the merge logic in `runner.ts` for the exact precedence rules.
