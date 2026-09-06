# Extension UI Bridge in RPC Mode

When pi runs in `--mode rpc`, extensions still call methods on `ctx.ui` (`select`, `confirm`, `input`, `editor`, `notify`, `setStatus`, `setWidget`, `setTitle`, `setEditorText`, …). There is no TUI to render them. The RPC dispatcher fakes the UI by emitting `extension_ui_request` lines on stdout and, for awaitable methods only, waiting for matching `extension_ui_response` lines on stdin. This file is the canonical reference for which methods need a host reply and which don't, including the timeout-and-default semantics that determine "why does my extension hang in RPC mode."

All cites against `packages/coding-agent/src/modes/rpc/rpc-mode.ts` at the current pin (`v0.85.1`, `d981de12`). Wire types live in `rpc-types.ts:198-235` (request union) and `:233-236` (response union). Documented at `packages/coding-agent/docs/rpc.md:1048-1247`.

## The two halves

There are two semantic categories of `ctx.ui` method, and the RPC bridge handles them differently:

### 1. Dialog methods (await a host reply)

`select`, `confirm`, `input`, `editor`. These return a `Promise<T>`; the extension awaits them. The dispatcher generates a UUID, stores `{ resolve, reject }` in `pendingExtensionRequests` (`rpc-mode.ts:72-75`), emits `extension_ui_request`, and the promise hangs until one of:

- An `extension_ui_response` arrives on stdin with the matching `id` → `resolve(parseResponse(value))`.
- The host signals abort via `opts?.signal` → `resolve(defaultValue)` (`rpc-mode.ts:100-104`).
- `opts?.timeout` ms elapse → `resolve(defaultValue)` (`rpc-mode.ts:106-111`).

The "resolve to default" semantics matter: a non-responsive host does **not** reject the extension; it returns the safe default after timeout (or never, if no timeout was set). Default values per dialog method are baked into the call sites (`rpc-mode.ts:128-142`):

- `select` → `undefined`
- `confirm` → `false`
- `input` → `undefined`
- `editor` → `undefined` (no signal/timeout support — see below)

The shared promise machinery is `createDialogPromise<T>` at `rpc-mode.ts:85-123`. Note that `editor` does **not** go through `createDialogPromise` — it has a separate hand-rolled promise at `rpc-mode.ts:241-259` and therefore lacks `signal` / `timeout` support. If a host never replies to an `editor` request, the extension hangs forever. Same for an in-process call site that didn't pass `opts`: with no signal and no timeout, the dialog promise is held until response.

### 2. Fire-and-forget methods (no reply expected)

`notify`, `setStatus`, `setWidget`, `setTitle`, `setEditorText` (called via `set_editor_text`), `pasteToEditor` (delegates to `setEditorText`). These return synchronously (or `void`). The dispatcher emits an `extension_ui_request` with a freshly-generated UUID and **does not** record anything in `pendingExtensionRequests`. The `id` field is still required by the wire schema, but the host may safely ignore it (no response is expected). Implementations at `rpc-mode.ts:145-155` (`notify`), `:164-173` (`setStatus`), `:195-206` (`setWidget`), `:226-233` (`setTitle`), `:241-249` (`setEditorText`).

If a host **does** send an `extension_ui_response` with an `id` that doesn't appear in `pendingExtensionRequests` (because the request was fire-and-forget), the response is silently dropped at the dispatch site that reads stdin (the `Map.get(id)` returns `undefined` → no-op).

## Method-by-method reference

| `ctx.ui` method | Wire `method` | Category | Request fields (besides `type`, `id`, `method`) | Response shape | Default on timeout/abort | Source |
|---|---|---|---|---|---|---|
| `select(title, options, opts)` | `"select"` | Dialog | `title`, `options[]`, `timeout?` | `{ value: string }` or `{ cancelled: true }` | `undefined` | `rpc-mode.ts:125-128`; types `rpc-types.ts:200` |
| `confirm(title, message, opts)` | `"confirm"` | Dialog | `title`, `message`, `timeout?` | `{ confirmed: boolean }` or `{ cancelled: true }` | `false` | `rpc-mode.ts:130-133`; types `:186` |
| `input(title, placeholder, opts)` | `"input"` | Dialog | `title`, `placeholder?`, `timeout?` | `{ value: string }` or `{ cancelled: true }` | `undefined` | `rpc-mode.ts:135-138`; types `:187-193` |
| `editor(title, prefill?)` | `"editor"` | Dialog | `title`, `prefill?` | `{ value: string }` or `{ cancelled: true }` | `undefined` (**no signal/timeout** — hand-rolled at `rpc-mode.ts:241-259`) | `rpc-mode.ts:241-259`; types `:194` |
| `notify(message, type?)` | `"notify"` | Fire-and-forget | `message`, `notifyType?: "info" \| "warning" \| "error"` | — | n/a | `rpc-mode.ts:145-155`; types `:195-201` |
| `setStatus(key, text)` | `"setStatus"` | Fire-and-forget | `statusKey`, `statusText: string \| undefined` | — | n/a; pass `statusText: undefined` to clear | `rpc-mode.ts:164-173`; types `:202-208` |
| `setWidget(key, lines, options)` | `"setWidget"` | Fire-and-forget | `widgetKey`, `widgetLines: string[] \| undefined`, `widgetPlacement?: "aboveEditor" \| "belowEditor"` | — | Component factories ignored — only `string[]` content is forwarded (`rpc-mode.ts:190-206`) | types `:209-216` |
| `setTitle(title)` | `"setTitle"` | Fire-and-forget | `title` | — | n/a | `rpc-mode.ts:226-233`; types `:217` |
| `setEditorText(text)` / `pasteToEditor(text)` | `"set_editor_text"` | Fire-and-forget | `text` | — | n/a | `rpc-mode.ts:241-249`; types `:218` |

### Methods that are **not** bridged at all

These are silently no-ops in RPC mode (the extension still calls them; they return without effect):

- `onTerminalInput` — raw terminal input not available in RPC (`rpc-mode.ts:160-162`)
- `setWorkingMessage`, `setWorkingVisible`, `setWorkingIndicator`, `setHiddenThinkingLabel` — TUI loader concepts (`rpc-mode.ts:175-186`)
- `setFooter`, `setHeader` — TUI components (`rpc-mode.ts:209-221`)
- `custom`, `addAutocompleteProvider`, `setEditorComponent`, `getEditorComponent` (`rpc-mode.ts:224-…`)
- `getAllThemes` returns `[]`, `getTheme` returns `undefined`, `setTheme` returns `{ success: false, error: "Theme switching not supported in RPC mode" }`, `getToolsExpanded` returns `false`, `setToolsExpanded` is a no-op.

`getEditorText` is also a no-op (returns `""`) because it's synchronous and can't await an RPC round-trip — hosts that need editor state must track it locally (`rpc-mode.ts:250-254`).

`ctx.hasUI` is **`true`** in RPC mode. The extension cannot use `hasUI` to detect "headless." Test for `--mode rpc` via `process.argv` if you genuinely need to branch.

## Response shapes (host → pi)

The host MUST send `extension_ui_response` with the matching `id` for dialog methods only. Three shapes (`rpc-types.ts:241-245`):

```jsonc
// select / input / editor — return a string value
{"type": "extension_ui_response", "id": "uuid-1", "value": "the chosen string"}

// confirm — return a boolean
{"type": "extension_ui_response", "id": "uuid-2", "confirmed": true}

// any dialog — user dismissed without choosing
{"type": "extension_ui_response", "id": "uuid-3", "cancelled": true}
```

The `parseResponse` callback in `createDialogPromise` translates these into the per-method default if `cancelled: true` is seen (`rpc-mode.ts:128-142`). Sending a malformed response (missing `id`, neither `value`/`confirmed`/`cancelled`) is a host bug — pi will resolve with the default if the dialog has a timeout/signal, or hang otherwise.

## Hang-debugging checklist

> **First, on 0.85.x+: make the wait observable instead of inferring it.** The `ui_prompt_start` / `ui_prompt_end` hook events (added 0.85.x, `extensions/types.ts:748-761`, emitted from `runner.ts:453-486`) announce exactly when pi begins and stops blocking on a user-facing extension UI prompt, carrying `kind` (`select` / `confirm` / `input` / `editor` / `custom`) and an optional `title`. **A `ui_prompt_start` with no matching `ui_prompt_end` localises the hang to a specific prompt** and tells you which method to look for below — turning items 2-5 from guesswork into a lookup. Register a tiny logging extension for these two events when diagnosing.
>
> Three caveats before you build on them: they are **outermost-only** (depth-tracked — nested `ctx.ui` calls emit ONE pair), they are **balanced even when the prompt throws**, and they are **fire-and-forget** (`queueMicrotask`, return value discarded) so they can observe a hang but never prevent or answer one. Full semantics: **pi-extensions** `reference/hook-events.md` § UI / user input.

When an extension hangs in RPC mode, the cause is almost always one of:

1. **Host isn't reading stdout, or is reading line-naively.** If the host uses Node `readline`, a U+2028 in a payload will desync the framer (see `reference/protocol.md` framing section). Switch to `attachJsonlLineReader` or equivalent.
2. **Host received the `extension_ui_request` but never sent `extension_ui_response`.** Check the `id` in the request and confirm the host's response carries the same string.
3. **The extension called `editor` without a timeout and the host never replied.** `editor` has no signal/timeout escape (`rpc-mode.ts:241-259`). The promise is held forever. Two fixes: host always replies, or add timeout/signal support to `editor` upstream.
4. **The extension called a dialog method with no `opts`.** `signal` and `timeout` are both undefined, so neither escape fires. Either pass `{ timeout: <ms> }` from the extension side, or guarantee the host always responds.
5. **The host sent `extension_ui_response` but with a stale `id` from a previous abort.** The map entry was already removed by `cleanup()` at `rpc-mode.ts:92-97`; the response is silently dropped; the new dialog still hangs.
6. **Pi crashed mid-dialog and the host is still waiting.** Pi exits without flushing the response. Hosts should detect process exit (`ChildProcess.on("exit", …)`) and reject all pending dialog promises locally — `RpcClient` does this implicitly because it owns the process lifecycle.

## Cross-references

- Wire types: `rpc-types.ts:198-235` (request) and `:233-236` (response).
- Dispatcher: `rpc-mode.ts:85-259` covers the entire UI bridge (dialog promise machinery, all method implementations, fire-and-forget paths).
- The `pendingExtensionRequests` map at `rpc-mode.ts:72-75` is where the dispatch reads on incoming responses; the read site lives further down in the stdin handler (search `pendingExtensionRequests.get` in `rpc-mode.ts`).
- Extension-side authoring (the actual `ctx.ui` API the extension calls) is **pi-extensions** territory — see its `reference/hook-events.md` and the eventual `reference/extension-context.md` (TBW in pi-extensions).
