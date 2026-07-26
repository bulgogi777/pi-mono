# ExtensionUIContext (`ctx.ui`)

The user-interaction surface for extensions. The interface is `ExtensionUIContext` at `packages/coding-agent/src/core/extensions/types.ts:127-284`. Two implementations: the interactive TUI (built into the interactive mode; rendered with the in-process TUI loader) and the RPC bridge (`packages/coding-agent/src/modes/rpc/rpc-mode.ts:124-258` — the `createExtensionUIContext` factory at `:123`).

The fundamental split is **awaitable dialogs** (return `Promise<T>`, block until host responds) vs **fire-and-forget** (return synchronously, never block). Getting this wrong is the #1 cause of "my extension hangs in RPC mode" — see **pi-rpc** `reference/extension-ui-bridge.md` for the full debugging checklist.

## The two categories

### Awaited dialogs — return `Promise<T>`, can block

| Method | Type signature | Lines | Default if host doesn't respond |
|---|---|---|---|
| `select(title, options, opts?)` | `Promise<string \| undefined>` | `types.ts:129` / `rpc-mode.ts:124-127` | `undefined` (after `opts.timeout` ms or `opts.signal` abort) |
| `confirm(title, message, opts?)` | `Promise<boolean>` | `types.ts:132` / `rpc-mode.ts:129-132` | `false` |
| `input(title, placeholder?, opts?)` | `Promise<string \| undefined>` | `types.ts:135` / `rpc-mode.ts:134-137` | `undefined` |
| `editor(title, prefill?)` | `Promise<string \| undefined>` | `types.ts:221` / `rpc-mode.ts:240-258` | `undefined` (**no `opts` parameter — no timeout, no signal**; if the host never replies, the promise hangs forever) |
| `custom<T>(factory, options?)` | `Promise<T>` | `types.ts:192` | TUI-only; returns `undefined as never` from the RPC stub (`rpc-mode.ts:223-226`) |

`opts: ExtensionUIDialogOptions` (`types.ts:90-98`) carries `timeout?: number` (ms) and `signal?: AbortSignal`. Both routes resolve the promise to the per-method default rather than rejecting.

**Block semantics in interactive mode**: the dialog is rendered as an overlay; the call awaits user input, which is keyboard-driven. No timeout fires unless `opts.timeout` is explicitly set.

**Block semantics in RPC mode**: `rpc-mode.ts:84-122` (`createDialogPromise`) generates a UUID, stores `{ resolve, reject }` in `pendingExtensionRequests`, emits `extension_ui_request` on stdout, and waits for a matching `extension_ui_response` on stdin. The promise resolves on (a) matching response, (b) `opts.signal` abort, or (c) `opts.timeout` elapsed. Without (b) or (c), it can hang indefinitely.

### Fire-and-forget — return `void`, never block

| Method | Lines | Notes |
|---|---|---|
| `notify(message, type?)` | `types.ts:138` / `rpc-mode.ts:144-154` | `type: "info" \| "warning" \| "error"`. |
| `setStatus(key, text)` | `types.ts:144` / `rpc-mode.ts:163-172` | `text: undefined` clears that key. |
| `setWidget(key, content, options?)` | `types.ts:166-172` / `rpc-mode.ts:194-205` | RPC: only `string[]` content is forwarded; component factories silently ignored. `options.placement: "aboveEditor" \| "belowEditor"`. |
| `setTitle(title)` | `types.ts:188` / `rpc-mode.ts:225-232` | Terminal window/tab title. |
| `setEditorText(text)` | `types.ts:215` / `rpc-mode.ts:240-248` | Set the input editor contents. |
| `pasteToEditor(text)` | `types.ts:212` / `rpc-mode.ts:233-238` | RPC delegates to `setEditorText` (no paste-collapse handling). |
| `setWorkingMessage(message?)` | `types.ts:147` | TUI-only. RPC stub at `rpc-mode.ts:174-176` is a no-op. |
| `setWorkingVisible(visible)` | `types.ts:150` | TUI-only. RPC no-op (`:178-180`). |
| `setWorkingIndicator(options?)` | `types.ts:160` | TUI-only. RPC no-op (`:182-184`). |
| `setHiddenThinkingLabel(label?)` | `types.ts:163` | TUI-only. RPC no-op (`:186-188`). |
| `setFooter(factory)` | `types.ts:178-183` | TUI-only. RPC no-op (`:208-211`). |
| `setHeader(factory)` | `types.ts:186` | TUI-only. RPC no-op (`:212-215`). |

## Synchronous reads

| Method | Lines | Notes |
|---|---|---|
| `getEditorText()` | `types.ts:218` | RPC always returns `""` (`rpc-mode.ts:249-253`) — synchronous methods can't await an RPC round-trip. Hosts must track editor state locally if they need it. |
| `getEditorComponent()` | `types.ts:273` | TUI-only. |
| `theme` (readonly) | `types.ts:276` | The active `Theme`. RPC stub returns the default theme (`rpc-mode.ts:282-284`). |
| `getAllThemes()` | `types.ts:279` | RPC returns `[]`. |
| `getTheme(name)` | `types.ts:281` | RPC returns `undefined`. |
| `setTheme(theme)` | `types.ts:284` | RPC returns `{ success: false, error: "Theme switching not supported in RPC mode" }`. |
| `getToolsExpanded()` / `setToolsExpanded(expanded)` | (end of `ExtensionUIContext`) | RPC: getter returns `false`, setter is a no-op. |

## Other

- `onTerminalInput(handler)`: `types.ts:141`. Raw keystroke listener. **Interactive TUI only**; RPC stub returns a no-op unsubscribe (`rpc-mode.ts:159-161`). Use sparingly — interferes with the editor.
- `addAutocompleteProvider(factory)`: `types.ts:226`. Stack additional autocomplete behavior. TUI-only.
- `setEditorComponent(factory)`: `types.ts:270`. Replace the input editor entirely. TUI-only. See `examples/extensions/modal-editor.ts` (vim-like) and `examples/extensions/rainbow-editor.ts`.

## The `hasUI` gate — what it actually means

`ctx.hasUI` (`types.ts:306`) is **`true`** in both interactive TUI mode **and** RPC mode (because the bridge counts as UI). It's `false` only in modes with no UI bridge at all — `--mode json`, programmatic SDK use without a host.

So `hasUI` answers "will my dialogs eventually return?" not "is there a human looking at the screen right now?" If your extension truly needs interactive input from a human (vs. a programmatic host), you have to inspect `process.argv` for `--mode rpc` or `--mode json` yourself.

In `--mode json` and other UI-less callers: dialog methods may resolve to defaults rather than blocking, depending on the implementation. Always pass `opts.timeout` defensively when running in unknown contexts.

## Cross-references

- RPC bridge implementation deep dive: **pi-rpc** `reference/extension-ui-bridge.md` (every method, response shapes, hang-debugging checklist).
- The `extension_ui_request` / `extension_ui_response` wire types: `packages/coding-agent/src/modes/rpc/rpc-types.ts:190-237`.
- `ctx.hasUI` and the broader `ExtensionContext`: `reference/extension-context.md`.
