# Hook Events

Complete catalog of pi extension hook events. Subscribe via `pi.on(eventName, handler)` from inside an extension factory; see `packages/coding-agent/src/core/extensions/types.ts:1219-1257` for the full overload list.

Payload **types** (the `*Event` interfaces and their `*Result` companions) are defined in `packages/coding-agent/src/core/extensions/types.ts`. Events are **emitted** from `packages/coding-agent/src/core/agent-session.ts`, `packages/coding-agent/src/core/agent-session-runtime.ts`, `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/extensions/runner.ts`, and `packages/coding-agent/src/modes/interactive/interactive-mode.ts`. Specialized emitters (`emitContext`, `emitToolCall`, `emitToolResult`, `emitUserBash`, `emitInput`, `emitBeforeProviderRequest`, `emitBeforeAgentStart`, `emitMessageEnd`, `emitResourcesDiscover`) live in `runner.ts:~700-1060` — they wrap result merging across multiple handlers. The generic `emit()` is for fire-and-forget events; `emitGeneric` covers the cancellable `session_before_*` family.

Cites verified against pi-mono at the current pin (`v0.85.1`, `d981de12`). The internal `types.ts:NNN` ranges for individual events drift between releases; if a line drifts, grep for the event-type string literal (e.g. `'project_trust'`, `'session_before_compact'`) — it is unique enough to relocate quickly.

## Startup (pre-resource)

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `project_trust` | Lets user/global and CLI `-e` extensions decide whether pi loads project-local `.pi/` resources for the current cwd. Fires before project-local extensions are loaded — project-local extensions cannot subscribe. Used to skip the built-in trust prompt or persist a yes/no decision. See `SKILL.md` “New in 0.79.x — project_trust event”. | `ProjectTrustEvent` (`extensions/types.ts:518-521`) | `ProjectTrustEventResult` (`extensions/types.ts:526-529`) — `{ trusted: "yes" \| "no" \| "undecided", remember?: boolean }` | `resource-loader.ts:396-400` (via `resolveProjectTrust` callback) → `core/project-trust.ts:54-70`; handler signature `ProjectTrustHandler` at `extensions/types.ts:537-540`; overload at `extensions/types.ts:1219` |

## Resources

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `resources_discover` | Discover skills, prompts, themes contributed by extensions. Fired on session start and reload. | `ResourcesDiscoverEvent` (`extensions/types.ts:546-550`) | `ResourcesDiscoverResult` (`extensions/types.ts:553-557`) | `agent-session.ts:2283` (via `emitResourcesDiscover`); merge logic at `runner.ts:1197-1243` |

## Session lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `session_start` | Session has been started, loaded, or reloaded (carries `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"`). | `SessionStartEvent` (`extensions/types.ts:564-570`) | — | `agent-session.ts:2274` (initial), `agent-session.ts:2622` (reload); seed value at `agent-session.ts:350` |
| `session_before_switch` | About to switch to another session; handler may cancel. | `SessionBeforeSwitchEvent` (`extensions/types.ts:580-584`) | `SessionBeforeSwitchResult` (`extensions/types.ts:1162-1164`) | `agent-session-runtime.ts:120-130` |
| `session_before_fork` | About to fork from an entry; handler may cancel or skip conversation restore. | `SessionBeforeForkEvent` (`extensions/types.ts:587-591`) | `SessionBeforeForkResult` (`extensions/types.ts:1166-1169`) | `agent-session-runtime.ts:137-147` |
| `session_before_compact` | About to compact; handler may cancel or supply a custom `CompactionResult`. Since 0.79.10 the payload carries `reason: "manual" \| "threshold" \| "overflow"` and `willRetry: boolean` so handlers can distinguish manual `/compact` vs threshold vs overflow-recovery flows. | `SessionBeforeCompactEvent` (`extensions/types.ts:594-604`) | `SessionBeforeCompactResult` (`extensions/types.ts:1171-1174`) | `agent-session.ts:1781-1797` and `agent-session.ts:1939-1951` (grep `emit.*session_before_compact` if drifted) |
| `session_compact` | Compaction completed. Since 0.79.10 carries `reason` and `willRetry` matching the `session_before_compact` event so a single handler can correlate begin/end. | `SessionCompactEvent` (`extensions/types.ts:607-615`) | — | `agent-session.ts:1846` and `agent-session.ts:2198` (grep `emit.*session_compact` if drifted) |
| `session_before_tree` | About to navigate the session tree (re-parent / branch summary); handler may cancel or override summary. | `SessionBeforeTreeEvent` (`extensions/types.ts:656-660`) | `SessionBeforeTreeResult` (`extensions/types.ts:1176-1189`) | `agent-session.ts:3028-3034` |
| `session_tree` | Session tree navigation completed. | `SessionTreeEvent` (`extensions/types.ts:663-669`) | — | `agent-session.ts:3141-3155` |
| `session_shutdown` | Extension runtime is being torn down (quit / reload / replacement). Last chance to flush. | `SessionShutdownEvent` (`extensions/types.ts:633-638`) | — | `agent-session-runtime.ts:150-156`, `agent-session-runtime.ts:370-376`, and `agent-session.ts:2618` (all via `emitSessionShutdownEvent`); helper at `runner.ts:193-202` |

## Provider I/O

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `context` | Last hook before each LLM call. Handler may return replacement `messages` (chained across handlers). | `ContextEvent` (`extensions/types.ts:688-691`) | `ContextEventResult` (`extensions/types.ts:1119-1121`) | `sdk.ts:379` (via `emitContext`); merge logic at `runner.ts:1034-1064` |
| `before_provider_request` | Final wire payload immediately before HTTP send. Handler may return a replacement payload (provider-specific shape). | `BeforeProviderRequestEvent` (`extensions/types.ts:694-697`) | `BeforeProviderRequestEventResult` (`extensions/types.ts:1123`, `unknown`) | `sdk.ts:367` (via `emitBeforeProviderRequest`); merge logic at `runner.ts:1066-1098` |
| `after_provider_response` | After response headers received, before the stream is consumed. Useful for logging rate-limit headers. | `AfterProviderResponseEvent` (`extensions/types.ts:710-714`) | — | `sdk.ts:371-377` |

## Agent / turn / message lifecycle

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `before_agent_start` | After user submits input, before the agent loop begins. Handler may inject a `CustomMessage` or replace the system prompt (chained). | `BeforeAgentStartEvent` (`extensions/types.ts:717-727`) | `BeforeAgentStartEventResult` (`extensions/types.ts:1156-1160`) | `agent-session.ts:1117` (via `emitBeforeAgentStart`); merge logic at `runner.ts:1131-1195` |
| `agent_start` | Agent loop has started. | `AgentStartEvent` (`extensions/types.ts:730-732`) | — | `agent-session.ts:701-703` |
| `agent_end` | Agent loop has ended. Carries final `messages`. | `AgentEndEvent` (`extensions/types.ts:735-738`) | — | `agent-session.ts:704-705` |
| `turn_start` | Start of a single agent turn (one provider call). | `TurnStartEvent` (`extensions/types.ts:764-768`) | — | `agent-session.ts:706-712` |
| `turn_end` | End of a turn; includes assistant message + tool results. | `TurnEndEvent` (`extensions/types.ts:771-776`) | — | `agent-session.ts:680-687` |
| `message_start` | Any message (user / assistant / toolResult) is starting. | `MessageStartEvent` (`extensions/types.ts:779-782`) | — | `agent-session.ts:731-736` |
| `message_update` | Streaming token-level update during assistant message. | `MessageUpdateEvent` (`extensions/types.ts:785-789`) | — | `agent-session.ts:707-713` |
| `message_end` | Message has finalized. Handler may return a replacement message; replacement must keep the original role. | `MessageEndEvent` (`extensions/types.ts:792-795`) | `MessageEndEventResult` (`extensions/types.ts:1151-1154`) | `agent-session.ts:740` (via `emitMessageEnd`); merge logic at `runner.ts:885-925` |

## Tool execution

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `tool_execution_start` | Tool implementation is about to run (after argument validation). | `ToolExecutionStartEvent` (`extensions/types.ts:798-803`) | — | `agent-session.ts:744-750` |
| `tool_execution_update` | Streaming partial result during tool execution. | `ToolExecutionUpdateEvent` (`extensions/types.ts:806-812`) | — | `agent-session.ts:752-759` |
| `tool_execution_end` | Tool implementation finished (or errored). | `ToolExecutionEndEvent` (`extensions/types.ts:815-821`) | — | `agent-session.ts:761-769` |
| `tool_call` | Fired before tool dispatch. Handler may **mutate `event.input` in place** to patch arguments (chained — later handlers see earlier mutations) or return `{ block: true, reason }` to veto. No re-validation runs after mutation. | `ToolCallEvent` discriminated union (`extensions/types.ts:945-954`) — variants for `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`, plus `CustomToolCallEvent` for extension tools | `ToolCallEventResult` (`extensions/types.ts:1125-1134`) | `agent-session.ts:412` (via `emitToolCall`); merge logic at `runner.ts:982-1003` |
| `tool_result` | Fired after tool returns. Handler may rewrite `content`, `details`, or `isError`. | `ToolResultEvent` discriminated union (`extensions/types.ts:1012-1021`) — same per-tool variants | `ToolResultEventResult` (`extensions/types.ts:1144-1149`) | `agent-session.ts:430` (via `emitToolResult`); merge logic at `runner.ts:927-980` |

## UI / user input

| Event | Purpose | Payload type | Result type | Emit site |
|---|---|---|---|---|
| `input` | User input received, before skill/template expansion and before agent processing. Handler may return `{action: "continue"}`, `{action: "transform", text, images}`, or `{action: "handled"}` to suppress. | `InputEvent` (`extensions/types.ts:867-877`) | `InputEventResult` (`extensions/types.ts:880-883`) | `agent-session.ts:1029` (via `emitInput`); merge logic at `runner.ts:1246-1285` |
| `user_bash` | User executed a `!`/`!!` shell command. Handler may supply custom `BashOperations` or fully replace the result. | `UserBashEvent` (`extensions/types.ts:849-857`) | `UserBashEventResult` (`extensions/types.ts:1137-1142`) | `interactive-mode.ts:5919` (via `emitUserBash`); merge logic at `runner.ts:1005-1032` |
| `model_select` | User selected a new model (via `set`, `cycle`, or `restore`). | `ModelSelectEvent` (`extensions/types.ts:830-835`) | — | `agent-session.ts:1462-1466` |
| `thinking_level_select` | User changed the thinking level. | `ThinkingLevelSelectEvent` (`extensions/types.ts:838-842`) | — | `agent-session.ts:1609-1610` |

## Cross-references

- Union of all events: `ExtensionEvent` (`extensions/types.ts:1086-1113`).
- `pi.on(...)` overload list: `extensions/types.ts:1162-1213`.
- Generic `runner.emit()` plus the cancellable `RunnerEmitEvent`/`RunnerEmitResult` machinery: `runner.ts:115-163`.
- `hasHandlers(eventName)` short-circuit (used everywhere to skip emit when no extension subscribed): defined on the runner and called e.g. `agent-session.ts:1038`, `agent-session.ts:1781`, `agent-session.ts:2100`, `agent-session.ts:2279`, `agent-session.ts:3028`, `sdk.ts:371`, `agent-session-runtime.ts:120`/`137`, `runner.ts:187`.
- Result merging is **handler-order sensitive** for: `context`, `before_provider_request`, `before_agent_start` (system prompt chained), `tool_call` (mutations chained), `tool_result`, `message_end`, `input`, `user_bash`. Read the merge logic in `runner.ts` for the exact precedence rules.
