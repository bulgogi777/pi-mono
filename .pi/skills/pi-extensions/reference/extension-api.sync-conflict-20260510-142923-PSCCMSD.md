# ExtensionAPI

The `pi` argument passed to every extension factory function. All cites against `packages/coding-agent/src/core/extensions/types.ts` at pi-mono `HEAD`. The interface itself is `ExtensionAPI` at `types.ts:1086-1310`. Companion runner-side wiring is in `packages/coding-agent/src/core/extensions/runner.ts` and the loader's `createExtensionAPI` factory at `packages/coding-agent/src/core/extensions/loader.ts:~395`.

For the full hook-event catalog, see `reference/hook-events.md`. For `ctx.*` members (passed to handlers as the second arg), see `reference/extension-context.md`. For `ctx.ui.*` semantics, see `reference/ui-context.md`.

## pi.on(eventName, handler) — hook subscription

Overload list at `types.ts:1089-1126` (one overload per event). 27 events total; `ExtensionEvent` union at `types.ts:950-972`.

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

`types.ts:1133-1135`. Takes a `ToolDefinition<TParams, TDetails, TState>` (`types.ts:426-473`).

- **Dynamic vs built-in**: built-in tools (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`) are registered by the agent itself, not via `registerTool`. Extension-registered tools always carry the extension's `sourceInfo`. Tools registered with the same `name` as a built-in **override** it (see `examples/extensions/tool-override.ts`).
- **Schema**: `parameters` is a TypeBox `TSchema`. Pi validates LLM-supplied arguments against this before calling `execute`.
- **Late registration**: legal — call from a hook handler or command handler, not just from the factory function. See `examples/extensions/dynamic-tools.ts`.
- **Promotion to system prompt**: only tools with `promptSnippet` appear in the auto-generated `Available tools:` block of the default system prompt (`system-prompt.ts:88-92`). Without it the LLM still sees the tool via the wire-protocol tool list, but no per-tool guidance line.
- **Render**: optional `renderCall` and `renderResult` for custom TUI rendering. See `reference/tools.md`.

## pi.registerCommand(name, options) — slash command

`types.ts:1142`. Adds a `/<name>` slash command. `options` shape: `Omit<RegisteredCommand, "name" | "sourceInfo">` (definition at `types.ts:1066-1076`).

- **handler**: `(args: string, ctx: ExtensionCommandContext) => Promise<void>`. `ctx` is the **extended** `ExtensionCommandContext` (`types.ts:333-368`) which adds `waitForIdle`, `newSession`, `fork`, `navigateTree`, `switchSession`, `reload` — these are unsafe to call from non-command contexts.
- **getArgumentCompletions**: optional autocomplete provider for command args.
- Examples: `examples/extensions/commands.ts`, `examples/extensions/shutdown-command.ts`, `examples/extensions/preset.ts`.

## pi.registerShortcut(shortcut, options) — keyboard shortcut

`types.ts:1145-1152`. Binds a `KeyId` (e.g. `"ctrl+b"`) to a handler.

- **handler**: `(ctx: ExtensionContext) => Promise<void> | void`. Note: this gets the basic `ExtensionContext`, not `ExtensionCommandContext` — no session-control methods.
- **TUI only**: shortcuts are inert in `--mode rpc` and `--mode json` (no keyboard input).
- Example: `examples/extensions/bookmark.ts` binds Ctrl-key shortcuts to `setLabel`.

## pi.registerFlag(name, options) — CLI flag

`types.ts:1154-1163`. Adds a custom `--<name>` flag to pi's CLI parser.

- **type**: `"boolean" | "string"`. Read back via `pi.getFlag(name)` (`types.ts:1166`) anywhere after parse.
- **default**: optional. If omitted, `getFlag` returns `undefined` until the flag is set.
- Useful when an extension wants to gate its own behavior on a launch-time switch without re-parsing `process.argv`.

## pi.registerMessageRenderer(customType, renderer) — TUI rendering for CustomMessageEntry

`types.ts:1171`. Lets extensions render their own `CustomMessage` payloads in the TUI.

- **renderer**: `MessageRenderer<T>` (`types.ts:1054-1058`) — `(message, options, theme) => Component | undefined`.
- **customType**: matches the `customType` field set by `pi.sendMessage(...)` or `pi.appendEntry(...)`.
- **Key/route**: pi looks up the renderer by `customType` whenever it encounters a `CustomMessageEntry` of that type during TUI render. No fallback path — without a renderer, the message is hidden (or rendered with a default placeholder).
- Example: `examples/extensions/message-renderer.ts`.

## pi.registerProvider(name, config) — custom provider

`types.ts:1255-1292` (with three full inline examples in the JSDoc). `ProviderConfig` shape at `types.ts:1318-1357`.

- Three operating modes determined by which `config` fields are set: replace-all-models (`models`), URL override (`baseUrl` only), or fully custom transport (`streamSimple`).
- Optional `oauth` block plugs into pi's `/login` UI.
- **Timing**: during initial extension load this call is **queued** and applied after the runner binds; called later (from a hook or command), it takes effect immediately.
- See `reference/custom-providers.md` for the full contract; see also `pi.unregisterProvider(name)` at `types.ts:1307`.
- Examples: `examples/extensions/custom-provider-anthropic/`, `examples/extensions/custom-provider-gitlab-duo/`.

## Action methods (not "register*" but called directly)

These are also on `ExtensionAPI`; included for completeness:

| Method | Lines | Purpose |
|---|---|---|
| `sendMessage(message, options?)` | `types.ts:1180-1183` | Inject a `CustomMessage` into the session. Optional `triggerTurn` and `deliverAs: "steer" | "followUp" | "nextTurn"`. |
| `sendUserMessage(content, options?)` | `types.ts:1189-1192` | Inject a user message. Always triggers a turn. |
| `appendEntry<T>(customType, data?)` | `types.ts:1195` | Append a `CustomEntry` for state persistence — **not** sent to LLM. See pi-sessions for `CustomEntry` shape. |
| `setSessionName(name)` / `getSessionName()` | `types.ts:1202-1205` | Session display name (`SessionInfoEntry`). |
| `setLabel(entryId, label?)` | `types.ts:1208` | Bookmark/marker on an entry. `undefined` clears. |
| `exec(command, args, options?)` | `types.ts:1211` | Shell out via the same `exec` helper extensions get on `ctx.exec`. |
| `setModel(model)` / `setThinkingLevel(level)` | `types.ts:1227-1235` | Programmatic model/thinking switching. `setModel` returns `false` if no API key resolves. |
| `events: EventBus` | `types.ts:1310` | Cross-extension pub/sub. See `examples/extensions/event-bus.ts`. |

## Cross-references

- Per-event payload and result types: `reference/hook-events.md`.
- `ctx` members (the second arg to every hook handler): `reference/extension-context.md`.
- `ctx.ui` dialog vs fire-and-forget rules: `reference/ui-context.md`.
- Tool registration mechanics and `tool_call` mutation: `reference/tools.md`.
- Provider registration deep dive: `reference/custom-providers.md`.
- Where loaded extension files actually come from: `reference/loading.md`.
- Working examples per API: `reference/examples-index.md`.
