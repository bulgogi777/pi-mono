# ExtensionContext

The second argument passed to every hook handler and to many command/shortcut handlers. Carries cwd, the active session, the model registry, abort plumbing, and the UI bridge. All cites against `packages/coding-agent/src/core/extensions/types.ts` at the current pin (`v0.87.1`, `f07218c4`).

The base interface is `ExtensionContext` at `extensions/types.ts:308-344`. Slash-command handlers receive the extended `ExtensionCommandContext` (`extensions/types.ts:359-393`); session-replacement callbacks receive `ReplacedSessionContext` (`extensions/types.ts:400-410`). This file documents the base interface; the extensions are summarized at the end.

## Members of `ExtensionContext`

| Member | Type | Lines | Notes |
|---|---|---|---|
| `ui` | `ExtensionUIContext` | `:307` | Always present. In `--mode rpc` it's bridged via `extension_ui_request` / `extension_ui_response` (see `reference/ui-context.md`). In `--mode json` and other UI-less modes the dialog methods may resolve to defaults rather than blocking — check `hasUI` first if your code path actually needs an interactive answer. |
| `hasUI` | `boolean` | `:309` | The honest gate. `false` in print/JSON mode (no rendering, no input). **`true` in RPC mode** (the bridge counts as UI), so `hasUI` does not by itself tell you whether you're interactive vs RPC. Test for `process.argv` containing `--mode rpc` if you need that distinction. |
| `cwd` | `string` | `:311` | Working directory the agent is running in. Read-only; reflects the value passed to `loadExtensions` (`extensions/loader.ts:639`). |
| `sessionManager` | `ReadonlySessionManager` | `:353` | Read-only view (`extensions/types.ts:195-229`) over the active `SessionManager`. Use `sessionManager.getEntries()`, `getLeafId()`, `getEntry(id)`, `getBranch()`, `getTree()`, `getHeader()`, `getLabel(id)` for inspection. To **mutate** session state, use `pi.setLabel`, `pi.setSessionName`, `pi.appendEntry`, or the command-context methods (`fork`, `newSession`, `navigateTree`). The full API is in **pi-sessions**. |
| `modelRegistry` | `ModelRegistry` | `:315` | The registry pi uses for model lookups and API-key resolution. Mostly used by `pi.registerProvider` plumbing; extensions rarely touch it directly. |
| `model` | `Model<any> \| undefined` | `:317` | The currently selected model. `undefined` before any model is selected (very early in startup, or if the user hasn't `/login`'d to any provider). Mutate via `pi.setModel(model)`. |
| `isIdle()` | `() => boolean` | `:319` | True when the agent isn't streaming. Inverse of `isStreaming` in `RpcSessionState`. |
| `signal` | `AbortSignal \| undefined` | `:321` | The current agent's abort signal. **`undefined` when the agent isn't streaming**, so guard with `isIdle()` or `if (ctx.signal)`. Wire long-running extension work to it: `await fetch(url, { signal: ctx.signal })`. |
| `abort()` | `() => void` | `:323` | Aborts the active agent operation (no-op if idle). Equivalent to the RPC `abort` command. |
| `hasPendingMessages()` | `() => boolean` | `:325` | True when steering / follow-up queues are non-empty. |
| `shutdown()` | `() => void` | `:327` | Graceful pi exit. Available in **all** contexts (interactive, RPC, JSON). Used e.g. by `examples/extensions/shutdown-command.ts`. |
| `getContextUsage()` | `() => ContextUsage \| undefined` | `:334` | Returns `{ tokens, max }`-style estimates (`ContextUsage` at `extensions/types.ts:294-304`). Right after compaction (before next assistant message), `tokens` may be `null` — handle accordingly. |
| `compact(options?)` | `(options?: CompactOptions) => void` | `:336` | Triggers compaction without awaiting. Optional `customInstructions`. See **pi-sessions** for the compaction flow. |
| `getSystemPrompt()` | `() => string` | `:338` | Returns the **effective** system prompt assembled by `buildSystemPrompt`. Useful for status widgets that surface prompt size. See `examples/extensions/system-prompt-header.ts`. Per-turn `BeforeAgentStartEvent` carries the same string in `event.systemPrompt`. |

## ExtensionCommandContext (slash command handlers)

`extensions/types.ts:350-385` extends `ExtensionContext` with five session-mutating methods that are only safe under user-initiated commands:

| Method | Lines | Purpose |
|---|---|---|
| `waitForIdle()` | `:348` | `await` the agent stopping. |
| `newSession(options?)` | `:350-354` | Cancellable via `session_before_switch` hook. `options.setup` runs against the new `SessionManager` before any messages; `options.withSession` runs against the bound `ReplacedSessionContext`. |
| `fork(entryId, options?)` | `:356-359` | Cancellable via `session_before_fork`. Creates a new file (in-place branch is `pi.setLabel`-style territory; see pi-sessions for `branch()` vs `forkFrom()`). |
| `navigateTree(targetId, options?)` | `:361-364` | Cancellable via `session_before_tree`. Optional `summarize` writes a `BranchSummaryEntry`. |
| `switchSession(sessionPath, options?)` | `:366-369` | Cancellable via `session_before_switch`. |
| `reload()` | `:379` | Re-runs extension/skill/prompt/theme discovery. Triggers `session_shutdown` then `session_start` with `reason: "reload"`. |

Each cancellable method returns `{ cancelled: boolean }` so the caller can distinguish "extension vetoed" from "operation completed."

## ReplacedSessionContext (withSession callbacks)

`extensions/types.ts:388-402` extends `ExtensionCommandContext` with two messaging methods bound to the **new** session created by `newSession` / `fork` / `switchSession`:

- `sendMessage(message, options?)` — inject a `CustomMessage` into the replacement session.
- `sendUserMessage(content, options?)` — inject a user message into the replacement session.

Both return `Promise<void>` (vs the fire-and-forget versions on `ExtensionAPI`) because the new session needs to be fully bound before the message can reach the runner.

## Common gotchas

- **`ctx.signal` is `undefined` when idle.** A handler that fires from a non-streaming context (e.g., `session_start`, command handler before `prompt`) sees `undefined`. Use `ctx.isIdle()` to know whether you're inside a streaming turn.
- **`ctx.model` is `undefined` very early.** `session_start` handlers may run before any model resolves. Defer model-dependent work to `before_agent_start` or `agent_start`.
- **`ctx.sessionManager` is `ReadonlySessionManager`.** No `appendXXX` methods. Mutate through `pi.*` actions or command-context methods.
- **`ctx.ui` calls in non-interactive contexts**: see `reference/ui-context.md` for the per-method matrix of "blocks", "resolves to default", "no-op".

## Cross-references

- `ExtensionUIContext` semantics: `reference/ui-context.md`.
- Hook handlers receive `ctx` as the second arg — payload contracts in `reference/hook-events.md`.
- `ReadonlySessionManager` and full `SessionManager` API: **pi-sessions** `reference/branching-resume.md`.
- `getSystemPrompt()` returns what `buildSystemPrompt` produced — see **pi-prompt-assembly** `reference/assembly-order.md` for what's in there.
