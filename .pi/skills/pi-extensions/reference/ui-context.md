# ExtensionUIContext (`ctx.ui`)

The user-interaction surface for extensions. The interface is `ExtensionUIContext` at `packages/coding-agent/src/core/extensions/types.ts:128-285`. Two implementations: the interactive TUI (built into the interactive mode; rendered with the in-process TUI loader) and the RPC bridge (`packages/coding-agent/src/modes/rpc/rpc-mode.ts:125-259` — the `createExtensionUIContext` factory at `:124`).

The fundamental split is **awaitable dialogs** (return `Promise<T>`, block until host responds) vs **fire-and-forget** (return synchronously, never block). Getting this wrong is the #1 cause of "my extension hangs in RPC mode" — see **pi-rpc** `reference/extension-ui-bridge.md` for the full debugging checklist.

## The two categories

### Awaited dialogs — return `Promise<T>`, can block

| Method | Type signature | Lines | Default if host doesn't respond |
|---|---|---|---|
| `select(title, options, opts?)` | `Promise<string \| undefined>` | `extensions/types.ts:130` / `rpc-mode.ts:125-128` | `undefined` (after `opts.timeout` ms or `opts.signal` abort) |
| `confirm(title, message, opts?)` | `Promise<boolean>` | `extensions/types.ts:133` / `rpc-mode.ts:130-133` | `false` |
| `input(title, placeholder?, opts?)` | `Promise<string \| undefined>` | `extensions/types.ts:136` / `rpc-mode.ts:135-138` | `undefined` |
| `editor(title, prefill?)` | `Promise<string \| undefined>` | `extensions/types.ts:222` / `rpc-mode.ts:241-259` | `undefined` (**no `opts` parameter — no timeout, no signal**; if the host never replies, the promise hangs forever) |
| `custom<T>(factory, options?)` | `Promise<T>` | `extensions/types.ts:193` | TUI-only; returns `undefined as never` from the RPC stub (`rpc-mode.ts:224-227`) |

`opts: ExtensionUIDialogOptions` (`extensions/types.ts:91-99`) carries `timeout?: number` (ms) and `signal?: AbortSignal`. Both routes resolve the promise to the per-method default rather than rejecting.

**Block semantics in interactive mode**: the dialog is rendered as an overlay; the call awaits user input, which is keyboard-driven. No timeout fires unless `opts.timeout` is explicitly set.

**Block semantics in RPC mode**: `rpc-mode.ts:85-123` (`createDialogPromise`) generates a UUID, stores `{ resolve, reject }` in `pendingExtensionRequests`, emits `extension_ui_request` on stdout, and waits for a matching `extension_ui_response` on stdin. The promise resolves on (a) matching response, (b) `opts.signal` abort, or (c) `opts.timeout` elapsed. Without (b) or (c), it can hang indefinitely.

### Fire-and-forget — return `void`, never block

| Method | Lines | Notes |
|---|---|---|
| `notify(message, type?)` | `extensions/types.ts:139` / `rpc-mode.ts:145-155` | `type: "info" \| "warning" \| "error"`. |
| `setStatus(key, text)` | `extensions/types.ts:145` / `rpc-mode.ts:164-173` | `text: undefined` clears that key. |
| `setWidget(key, content, options?)` | `extensions/types.ts:167-173` / `rpc-mode.ts:195-206` | RPC: only `string[]` content is forwarded; component factories silently ignored. `options.placement: "aboveEditor" \| "belowEditor"`. |
| `setTitle(title)` | `extensions/types.ts:189` / `rpc-mode.ts:226-233` | Terminal window/tab title. |
| `setEditorText(text)` | `extensions/types.ts:216` / `rpc-mode.ts:241-249` | Set the input editor contents. |
| `pasteToEditor(text)` | `extensions/types.ts:213` / `rpc-mode.ts:234-239` | RPC delegates to `setEditorText` (no paste-collapse handling). |
| `setWorkingMessage(message?)` | `extensions/types.ts:148` | TUI-only. RPC stub at `rpc-mode.ts:175-177` is a no-op. |
| `setWorkingVisible(visible)` | `extensions/types.ts:151` | TUI-only. RPC no-op (`:179-181`). |
| `setWorkingIndicator(options?)` | `extensions/types.ts:161` | TUI-only. RPC no-op (`:183-185`). |
| `setHiddenThinkingLabel(label?)` | `extensions/types.ts:164` | TUI-only. RPC no-op (`:187-189`). |
| `setFooter(factory)` | `extensions/types.ts:179-184` | TUI-only. RPC no-op (`:209-212`). |
| `setHeader(factory)` | `extensions/types.ts:187` | TUI-only. RPC no-op (`:213-216`). |

## Synchronous reads

| Method | Lines | Notes |
|---|---|---|
| `getEditorText()` | `extensions/types.ts:219` | RPC always returns `""` (`rpc-mode.ts:250-254`) — synchronous methods can't await an RPC round-trip. Hosts must track editor state locally if they need it. |
| `getEditorComponent()` | `extensions/types.ts:274` | TUI-only. |
| `theme` (readonly) | `extensions/types.ts:277` | The active `Theme`. RPC stub returns the default theme (`rpc-mode.ts:283-285`). |
| `getAllThemes()` | `extensions/types.ts:280` | RPC returns `[]`. |
| `getTheme(name)` | `extensions/types.ts:282` | RPC returns `undefined`. |
| `setTheme(theme)` | `extensions/types.ts:285` | RPC returns `{ success: false, error: "Theme switching not supported in RPC mode" }`. |
| `getToolsExpanded()` / `setToolsExpanded(expanded)` | (end of `ExtensionUIContext`) | RPC: getter returns `false`, setter is a no-op. |

## Other

- `onTerminalInput(handler)`: `extensions/types.ts:142`. Raw keystroke listener. **Interactive TUI only**; RPC stub returns a no-op unsubscribe (`rpc-mode.ts:160-162`). Use sparingly — interferes with the editor.
- `addAutocompleteProvider(factory)`: `extensions/types.ts:227`. Stack additional autocomplete behavior. TUI-only.
- `setEditorComponent(factory)`: `extensions/types.ts:271`. Replace the input editor entirely. TUI-only. See `examples/extensions/modal-editor.ts` (vim-like) and `examples/extensions/rainbow-editor.ts`.

## The `hasUI` gate — what it actually means

`ctx.hasUI` (`extensions/types.ts:307`) is **`true`** in both interactive TUI mode **and** RPC mode (because the bridge counts as UI). It's `false` only in modes with no UI bridge at all — `--mode json`, programmatic SDK use without a host.

So `hasUI` answers "will my dialogs eventually return?" not "is there a human looking at the screen right now?" If your extension truly needs interactive input from a human (vs. a programmatic host), you have to inspect `process.argv` for `--mode rpc` or `--mode json` yourself.

In `--mode json` and other UI-less callers: dialog methods may resolve to defaults rather than blocking, depending on the implementation. Always pass `opts.timeout` defensively when running in unknown contexts.

## Cross-references

- RPC bridge implementation deep dive: **pi-rpc** `reference/extension-ui-bridge.md` (every method, response shapes, hang-debugging checklist).
- The `extension_ui_request` / `extension_ui_response` wire types: `packages/coding-agent/src/modes/rpc/rpc-types.ts:190-237`.
- `ctx.hasUI` and the broader `ExtensionContext`: `reference/extension-context.md`.
