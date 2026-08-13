# ExtensionAPI

The `pi` argument passed to every extension factory function. All cites against `packages/coding-agent/src/core/extensions/types.ts` at the current pin (`v0.84.1`, `53fa77cc`). The interface itself is `ExtensionAPI` at `extensions/types.ts:1198`. Companion runner-side wiring is in `packages/coding-agent/src/core/extensions/runner.ts` and the loader's `createExtensionAPI` factory at `packages/coding-agent/src/core/extensions/loader.ts:~395`.

For the full hook-event catalog, see `reference/hook-events.md`. For `ctx.*` members (passed to handlers as the second arg), see `reference/extension-context.md`. For `ctx.ui.*` semantics, see `reference/ui-context.md`.

## pi.on(eventName, handler) — hook subscription

Overload list at `extensions/types.ts:1203-1244` (one overload per event). **30** events total (re-counted 2026-08-13 at `v0.84.1`; was documented as 27). The `ExtensionEvent` union at `extensions/types.ts:1034-1059` has **25** members — fewer, because `ToolCallEvent` and `ToolResultEvent` are each themselves a union of per-tool variants.

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

`extensions/types.ts:1165-1167`. Takes a `ToolDefinition<TParams, TDetails, TState>` (`extensions/types.ts:437-486`).

- **Dynamic vs built-in**: built-in tools (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`) are registered by the agent itself, not via `registerTool`. Extension-registered tools always carry the extension's `sourceInfo`. Tools registered with the same `name` as a built-in **override** it (see `examples/extensions/tool-override.ts`).
- **Schema**: `parameters` is a TypeBox `TSchema`. Pi validates LLM-supplied arguments against this before calling `execute`.
- **Late registration**: legal — call from a hook handler or command handler, not just from the factory function. See `examples/extensions/dynamic-tools.ts`.
- **Promotion to system prompt**: only tools with `promptSnippet` appear in the auto-generated `Available tools:` block of the default system prompt (`core/system-prompt.ts:88-92`). Without it the LLM still sees the tool via the wire-protocol tool list, but no per-tool guidance line.
- **Render**: optional `renderCall` and `renderResult` for custom TUI rendering. See `reference/tools.md`.

## pi.registerCommand(name, options) — slash command

`extensions/types.ts:1175`. Adds a `/<name>` slash command. `options` shape: `Omit<RegisteredCommand, "name" | "sourceInfo">` (definition at `extensions/types.ts:1086-1097`).

- **handler**: `(args: string, ctx: ExtensionCommandContext) => Promise<void>`. `ctx` is the **extended** `ExtensionCommandContext` (`extensions/types.ts:353-387`) which adds `waitForIdle`, `newSession`, `fork`, `navigateTree`, `switchSession`, `reload` — these are unsafe to call from non-command contexts.
- **getArgumentCompletions**: optional autocomplete provider for command args.
- Examples: `examples/extensions/commands.ts`, `examples/extensions/shutdown-command.ts`, `examples/extensions/preset.ts`.

## pi.registerShortcut(shortcut, options) — keyboard shortcut

`extensions/types.ts:1177-1184`. Binds a `KeyId` (e.g. `"ctrl+b"`) to a handler.

- **handler**: `(ctx: ExtensionContext) => Promise<void> | void`. Note: this gets the basic `ExtensionContext`, not `ExtensionCommandContext` — no session-control methods.
- **TUI only**: shortcuts are inert in `--mode rpc` and `--mode json` (no keyboard input).
- Example: `examples/extensions/bookmark.ts` binds Ctrl-key shortcuts to `setLabel`.

## pi.registerFlag(name, options) — CLI flag

`extensions/types.ts:1187-1196`. Adds a custom `--<name>` flag to pi's CLI parser.

- **type**: `"boolean" | "string"`. Read back via `pi.getFlag(name)` (`extensions/types.ts:1198`) anywhere after parse.
- **default**: optional. If omitted, `getFlag` returns `undefined` until the flag is set.
- Useful when an extension wants to gate its own behavior on a launch-time switch without re-parsing `process.argv`.

## pi.registerMessageRenderer(customType, renderer) — TUI rendering for CustomMessageEntry

`extensions/types.ts:1203`. Lets extensions render their own `CustomMessage` payloads in the TUI.

- **renderer**: `MessageRenderer<T>` (`extensions/types.ts:1069-1073`) — `(message, options, theme) => Component | undefined`.
- **customType**: matches the `customType` field set by `pi.sendMessage(...)` or `pi.appendEntry(...)`.
- **Key/route**: pi looks up the renderer by `customType` whenever it encounters a `CustomMessageEntry` of that type during TUI render. No fallback path — without a renderer, the message is hidden (or rendered with a default placeholder).
- Example: `examples/extensions/message-renderer.ts`.

## pi.registerProvider(name, config) — custom provider

`extensions/types.ts:1288-1328` (with three full inline examples in the JSDoc). `ProviderConfig` shape at `extensions/types.ts:1443-1487`.

- Three operating modes determined by which `config` fields are set: replace-all-models (`models`), URL override (`baseUrl` only), or fully custom transport (`streamSimple`).
- Optional `oauth` block plugs into pi's `/login` UI.
- **Timing**: during initial extension load this call is **queued** and applied after the runner binds; called later (from a hook or command), it takes effect immediately.
- See `reference/custom-providers.md` for the full contract; see also `pi.unregisterProvider(name)` at `extensions/types.ts:1342`.
- Examples: `examples/extensions/custom-provider-anthropic/`, `examples/extensions/custom-provider-gitlab-duo/`.

## Action methods (not "register*" but called directly)

These are also on `ExtensionAPI`; included for completeness:

| Method | Lines | Purpose |
|---|---|---|
| `sendMessage(message, options?)` | `extensions/types.ts:1207-1210` | Inject a `CustomMessage` into the session. Optional `triggerTurn` and `deliverAs: "steer" | "followUp" | "nextTurn"`. |
| `sendUserMessage(content, options?)` | `extensions/types.ts:1207-1210` | Inject a user message. Always triggers a turn. |
| `appendEntry<T>(customType, data?)` | `extensions/types.ts:1227` | Append a `CustomEntry` for state persistence — **not** sent to LLM. See pi-sessions for `CustomEntry` shape. |
| `setSessionName(name)` / `getSessionName()` | `extensions/types.ts:1234-1237` | Session display name (`SessionInfoEntry`). |
| `setLabel(entryId, label?)` | `extensions/types.ts:1240` | Bookmark/marker on an entry. `undefined` clears. |
| `exec(command, args, options?)` | `extensions/types.ts:1243` | Shell out via the same `exec` helper extensions get on `ctx.exec`. |
| `setModel(model)` / `setThinkingLevel(level)` | `extensions/types.ts:1259-1267` | Programmatic model/thinking switching. `setModel` returns `false` if no API key resolves. |
| `events: EventBus` | `extensions/types.ts:1345` | Cross-extension pub/sub. See `examples/extensions/event-bus.ts`. |

## Cross-references

- Per-event payload and result types: `reference/hook-events.md`.
- `ctx` members (the second arg to every hook handler): `reference/extension-context.md`.
- `ctx.ui` dialog vs fire-and-forget rules: `reference/ui-context.md`.
- Tool registration mechanics and `tool_call` mutation: `reference/tools.md`.
- Provider registration deep dive: `reference/custom-providers.md`.
- Where loaded extension files actually come from: `reference/loading.md`.
- Working examples per API: `reference/examples-index.md`.
