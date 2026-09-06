# ExtensionAPI

The `pi` argument passed to every extension factory function. All cites against `packages/coding-agent/src/core/extensions/types.ts` at the current pin (`v0.85.1`, `d981de12`). The interface itself is `ExtensionAPI` at `extensions/types.ts:1252`. Companion runner-side wiring is in `packages/coding-agent/src/core/extensions/runner.ts` and the loader's `createExtensionAPI` factory at `packages/coding-agent/src/core/extensions/loader.ts:~395`.

For the full hook-event catalog, see `reference/hook-events.md`. For `ctx.*` members (passed to handlers as the second arg), see `reference/extension-context.md`. For `ctx.ui.*` semantics, see `reference/ui-context.md`.

## pi.on(eventName, handler) — hook subscription

Overload list at `extensions/types.ts:1257-1301` (one overload per event). **33** overloads total (re-counted 2026-09-06 at `v0.85.1`; read 30 at `v0.84.1`, and 27 before that). The `ExtensionEvent` union at `extensions/types.ts:1086-1113` has **27** members — fewer than the overload count, because `ToolCallEvent` and `ToolResultEvent` are each themselves a union of per-tool variants.

**The three added between `v0.84.1` and `v0.85.1`** (identified 2026-09-06, all documented in `reference/hook-events.md`): `session_compact_failed` (`:1271`), `ui_prompt_start` (`:1286`), `ui_prompt_end` (`:1287`). Nothing was removed. `SessionCompactFailedEvent` also joined the `SessionEvent` sub-union (declared `extensions/types.ts:671-681`; the new member sits at `:678`).

> **Why the overload count is worth re-measuring every scan.** It is the event count — one overload per event — so when upstream adds an event, this number is the only thing that moves. **No cite check can catch that:** every existing cite still resolves to a real line stating a true thing, and the table is merely missing rows. `.pi/scripts/recount-enumerations.sh` detects the drift; it cannot name the delta. Naming it is a `git show <old-tag>:...types.ts | grep -oE '^\son\(event: "[a-z_]+"'` diff against the new tag — about a minute. Do that in the same pass rather than deferring it; a bare "count moved 30→33" is a fact nobody can act on.

- **Signature**: `on(event: "<name>", handler: (event, ctx) => Promise<R | void> | R | void): void`. Handler return type `R` is event-specific — see `reference/hook-events.md` for the per-event `*Result` shape.
- **Multiple handlers per event**: legal. Each extension may also register multiple handlers for the same event. Per-extension execution order is registration order; cross-extension order is load order.
- **Result merging**: per-event, defined in the corresponding `emit*` method on `ExtensionRunner` (`runner.ts:~700-1060`). See `reference/hook-events.md` "Cross-references" section for which events chain results.

```ts
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && event.input.command.startsWith("rm ")) {
    return { block: true, reason: "rm blocked by extension" };
  }
});
```

## pi.registerTool(tool) — dynamic tool registration

`extensions/types.ts:1219-1221`. Takes a `ToolDefinition<TParams, TDetails, TState>` (`extensions/types.ts:439-488`).

- **Dynamic vs built-in**: built-in tools (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`) are registered by the agent itself, not via `registerTool`. Extension-registered tools always carry the extension's `sourceInfo`. Tools registered with the same `name` as a built-in **override** it (see `examples/extensions/tool-override.ts`).
- **Schema**: `parameters` is a TypeBox `TSchema`. Pi validates LLM-supplied arguments against this before calling `execute`.
- **Late registration**: legal — call from a hook handler or command handler, not just from the factory function. See `examples/extensions/dynamic-tools.ts`.
- **Promotion to system prompt**: only tools with `promptSnippet` appear in the auto-generated `Available tools:` block of the default system prompt (`core/system-prompt.ts:88-92`). Without it the LLM still sees the tool via the wire-protocol tool list, but no per-tool guidance line.
- **Render**: optional `renderCall` and `renderResult` for custom TUI rendering. See `reference/tools.md`.

## pi.registerCommand(name, options) — slash command

`extensions/types.ts:1229`. Adds a `/<name>` slash command. `options` shape: `Omit<RegisteredCommand, "name" | "sourceInfo">` (definition at `extensions/types.ts:1140-1151`).

- **handler**: `(args: string, ctx: ExtensionCommandContext) => Promise<void>`. `ctx` is the **extended** `ExtensionCommandContext` (`extensions/types.ts:355-389`) which adds `waitForIdle`, `newSession`, `fork`, `navigateTree`, `switchSession`, `reload` — these are unsafe to call from non-command contexts.
- **getArgumentCompletions**: optional autocomplete provider for command args.
- Examples: `examples/extensions/commands.ts`, `examples/extensions/shutdown-command.ts`, `examples/extensions/preset.ts`.

## pi.registerShortcut(shortcut, options) — keyboard shortcut

`extensions/types.ts:1231-1238`. Binds a `KeyId` (e.g. `"ctrl+b"`) to a handler.

- **handler**: `(ctx: ExtensionContext) => Promise<void> | void`. Note: this gets the basic `ExtensionContext`, not `ExtensionCommandContext` — no session-control methods.
- **TUI only**: shortcuts are inert in `--mode rpc` and `--mode json` (no keyboard input).
- Example: `examples/extensions/bookmark.ts` binds Ctrl-key shortcuts to `setLabel`.

## pi.registerFlag(name, options) — CLI flag

`extensions/types.ts:1241-1250`. Adds a custom `--<name>` flag to pi's CLI parser.

- **type**: `"boolean" | "string"`. Read back via `pi.getFlag(name)` (`extensions/types.ts:1252`) anywhere after parse.
- **default**: optional. If omitted, `getFlag` returns `undefined` until the flag is set.
- Useful when an extension wants to gate its own behavior on a launch-time switch without re-parsing `process.argv`.

## pi.registerMessageRenderer(customType, renderer) — TUI rendering for CustomMessageEntry

`extensions/types.ts:1257`. Lets extensions render their own `CustomMessage` payloads in the TUI.

- **renderer**: `MessageRenderer<T>` (`extensions/types.ts:1123-1127`) — `(message, options, theme) => Component | undefined`.
- **customType**: matches the `customType` field set by `pi.sendMessage(...)` or `pi.appendEntry(...)`.
- **Key/route**: pi looks up the renderer by `customType` whenever it encounters a `CustomMessageEntry` of that type during TUI render. No fallback path — without a renderer, the message is hidden (or rendered with a default placeholder).
- Example: `examples/extensions/message-renderer.ts`.

## pi.registerProvider(name, config) — custom provider

`extensions/types.ts:1351-1392` (with three full inline examples in the JSDoc). `ProviderConfig` shape at `extensions/types.ts:1513-1557`.

- Three operating modes determined by which `config` fields are set: replace-all-models (`models`), URL override (`baseUrl` only), or fully custom transport (`streamSimple`).
- Optional `oauth` block plugs into pi's `/login` UI.
- **Timing**: during initial extension load this call is **queued** and applied after the runner binds; called later (from a hook or command), it takes effect immediately.
- See `reference/custom-providers.md` for the full contract; see also `pi.unregisterProvider(name)` at `extensions/types.ts:1406`.
- Examples: `examples/extensions/custom-provider-anthropic/`, `examples/extensions/custom-provider-gitlab-duo/`.

## Action methods (not "register*" but called directly)

These are also on `ExtensionAPI`; included for completeness:

| Method | Lines | Purpose |
|---|---|---|
| `sendMessage(message, options?)` | `extensions/types.ts:1261-1264` | Inject a `CustomMessage` into the session. Optional `triggerTurn` and `deliverAs: "steer" | "followUp" | "nextTurn"`. |
| `sendUserMessage(content, options?)` | `extensions/types.ts:1261-1264` | Inject a user message. Always triggers a turn. |
| `appendEntry<T>(customType, data?)` | `extensions/types.ts:1282` | Append a `CustomEntry` for state persistence — **not** sent to LLM. See pi-sessions for `CustomEntry` shape. |
| `setSessionName(name)` / `getSessionName()` | `extensions/types.ts:1291-1294` | Session display name (`SessionInfoEntry`). |
| `setLabel(entryId, label?)` | `extensions/types.ts:1297` | Bookmark/marker on an entry. `undefined` clears. |
| `exec(command, args, options?)` | `extensions/types.ts:1300` | Shell out via the same `exec` helper extensions get on `ctx.exec`. |
| `setModel(model)` / `setThinkingLevel(level)` | `extensions/types.ts:1316-1324` | Programmatic model/thinking switching. `setModel` returns `false` if no API key resolves. |
| `events: EventBus` | `extensions/types.ts:1409` | Cross-extension pub/sub. See `examples/extensions/event-bus.ts`. |

## Cross-references

- Per-event payload and result types: `reference/hook-events.md`.
- `ctx` members (the second arg to every hook handler): `reference/extension-context.md`.
- `ctx.ui` dialog vs fire-and-forget rules: `reference/ui-context.md`.
- Tool registration mechanics and `tool_call` mutation: `reference/tools.md`.
- Provider registration deep dive: `reference/custom-providers.md`.
- Where loaded extension files actually come from: `reference/loading.md`.
- Working examples per API: `reference/examples-index.md`.
