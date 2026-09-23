# Anthropic Prompt-Cache Breakpoints

Anthropic's Messages API allows up to **4** `cache_control: { type: "ephemeral" }` markers per request. Pi's Anthropic provider places them at fixed positions. All cites are against `packages/ai/src/api/anthropic-messages.ts` at the current pin (`v0.87.1`, `f07218c4`).

> **Re-derived 2026-09-22 for 0.86/0.87.** Three mechanism changes, not line drift:
> 1. The system text is no longer `context.systemPrompt`. It is the transcript's **initial system message** (`getInitialSystemMessage(context.messages)`, `:1043-1044`). Provider stream inputs changed from `Context` to `TranscriptContext` in 0.86.0.
> 2. Later system messages (prompt patches, tool additions/removals) can travel **inside `messages[]`**, and the conversation breakpoint now also lands on a trailing **system** message (`:1399-1402`).
> 3. The tool breakpoint is gated by a new `supportsCacheControlOnTools` compat flag (`:1114`).
>
> Background: 0.80.x moved everything out of `packages/ai/src/providers/anthropic.ts` (now a 59-line shell). Any `providers/anthropic.ts:NNN` cite in a downstream doc is broken on both path and line.

## The resolver

`getCacheControl(model, cacheRetention, env)` at `packages/ai/src/api/anthropic-messages.ts:70-84` returns `{ retention: "none" }` (no markers at all) or `{ retention, cacheControl: { type: "ephemeral", ttl? } }`. Retention comes from `resolveCacheRetention` (`:60-68`): an explicit option wins, then the `PI_CACHE_RETENTION=long` env, then `"short"`. `ttl: "1h"` is added only when retention is `"long"` **and** `getAnthropicCompat(model).supportsLongCacheRetention` (`:79`; default `true` at `:210`). `buildParams` (`:1035`) resolves it once at `:1041`. Every site below is gated on `cacheControl` being defined.

## Transcript resolution happens first

Before any breakpoint is placed, `stream` resolves the transcript (`:517`) with `resolveTranscript(context, compat.supportsMidConvoSystemMessages)` (`packages/ai/src/utils/transcript.ts:115-120`):

- **Model supports mid-conversation system messages.** The transcript is kept as-is. The leading system message is the prompt as it was *first* sent. Each later change is a small patch system message sitting at the point in the conversation where it happened.
- **Model does not.** `collapseSystemMessages` (`transcript.ts:108-112`) drops every system message and puts the **current** one at the head.

Measured from the shipped `@earendil-works/pi-ai@0.87.1` catalog (`dist/providers/data/anthropic.json`, not the git tree):

| Model | `supportsMidConvoSystemMessages` | `supportsMidConvoToolChanges` |
|---|---|---|
| `claude-opus-5`, `claude-opus-5-5`, `claude-opus-4-8` | `true` | `true` |
| `claude-sonnet-5`, `claude-haiku-4-5` | unset → `false` (`:217`) | unset → `false` |

## The four breakpoint sites

| # | Site | Where | Caches | Invalidated by |
|---|---|---|---|---|
| 1a | OAuth identity preamble | `:1079-1085` (in `if (isOAuthToken)` at `:1078`) | The literal `"You are Claude Code, Anthropic's official CLI for Claude."` (`:1082`), marker at `:1083` | Token type changing. The text is constant. |
| 1b | Non-OAuth system prompt | `:1093-1101`, marker `:1099` | `sanitizeSurrogates(initialSystemText)`, the **initial** system message rendered by `getSystemMessageText` | Any byte change in the **leading** system message. On a mid-convo-capable model, a later prompt edit does **not** change the leading message. It becomes a patch (see "Practical implications"). |
| 2 | OAuth user system prompt | `:1086-1092`, marker `:1090` | Same text as #1b, as a second `system[]` block after the identity preamble | Same as #1b |
| 3 | Last tool definition | `convertTools` (`:1457`), marker at `:1489` on `index === tools.length - 1` | The whole tool-definitions block | Any change to the declared tool list, with one exception: **native tool changes** (below). Only emitted when `supportsCacheControlOnTools` is true (default, `:213`); otherwise `toolCacheControl` is `undefined` (`:1114`). |
| 4 | Last conversation message | `convertMessages`, `:1399-1424` | Marker on the last block of the last `params[]` entry when that entry is `user` **or `system`** (`:1402`). The block may be `text`, `image`, `tool_result`, `tool_addition` or `tool_removal` (`:1406-1413`); string content is converted to a single marked text block (`:1415-1422`). | Every new turn. The marker moves forward and the previous one is dropped, so there is only ever one conversation breakpoint. |

### Native tool changes keep the tool block stable

When `supportsMidConvoSystemMessages` **and** `supportsMidConvoToolChanges` are both true, the initial system message declares tools, and no tool is redefined, `nativeToolChanges` is on (`:1051-1055`). Then:

- `params.tools` = the **initial** tools (cache marker on the last one), then a deferred placeholder, then every later-declared tool with `defer_loading: true` (`:1115-1137`). The request-level list **only grows**, so breakpoint #3's prefix survives tool changes.
- The changes themselves travel as `tool_addition` / `tool_removal` blocks inside system messages in `messages[]` (`:1256-1269`), with the beta `mid-conversation-tool-changes-2026-07-01` added (`:186`, `:1031`).

Otherwise the current tool list is sent as before (`:1138-1148`), and any change invalidates #3.

## Counting per request

- **Non-OAuth:** #1b, #3, #4, so 3 of 4.
- **OAuth:** #1a, #2, #3, #4, so 4 of 4.
- **No tools / `supportsCacheControlOnTools: false`:** #3 disappears.
- **No initial system message:** #1b / #2 disappear. In OAuth mode #1a still fires.

## Practical implications

Read each item as cause → cascade. **Which case applies depends on the model row in the table above.**

- **Editing APPEND_SYSTEM.md, a reachable AGENTS.md, or a skill's name/description/location mid-session.**
  - *Mid-convo-capable model (Opus 5 / 5.5 / 4.8):* pi appends a **section patch** to the transcript (`core/agent-session.ts:1416-1420`; see `assembly-order.md`). The leading system block (#1b / #2), the tools (#3) and all earlier history keep their cache. Only the patch and what follows it are new. **This is the 0.86 feature that makes mid-session prompt edits cheap.**
  - *Other models (Sonnet 5, Haiku 4.5):* the transcript collapses and the current prompt becomes the head, so #1b / #2 and **everything after it** are rewritten. That's the same blast radius as pre-0.86.
- **A `before_agent_start` extension that returns `systemPrompt`** (a *forced* prompt). The request is projected to a single head holding the forced text, with every other system message removed (`core/agent-session.ts:1433-1448`), **on every model**. Any change in the forced text rewrites the head and invalidates the whole prefix. On this box `~/.pi/agent/extensions/pai-context.ts` returns `systemPrompt` in every session, and apex-app's `cora-context-inject` does the same in Cora sessions. **APEX sessions are therefore on the collapsed path even on Opus**, and their cache stability depends on the injected text staying byte-identical from turn to turn. Mutating `event.systemPromptOptions` instead would restore patching.
- **Editing a skill's body** → **zero** system-prompt impact. The body is never in the prompt.
- **Adding/removing/reordering tools.** With native tool changes: #3 survives, and the change rides in `messages[]`. Without: #3 and everything after it invalidate.
- **Date rollover** is not a concern. The `Current date:` line was removed in 0.80.x (`f4e9ca74`, #6621).
- **Switching between API key and OAuth mid-session** loses all cache, because the `system[]` shape changes.
- **Long retention (1h)** only takes effect where `supportsLongCacheRetention` holds. Elsewhere `"long"` silently becomes short.
- **Cache warming (0.86.0).** Pi can send cost-aware refresh requests to keep an expiring cache alive during long tool runs, and optionally while idle. Extensions can veto a refresh through `cache_warming_decision` (see **pi-extensions** `hook-events.md`). Each refresh is recorded as a `usage` entry in the session JSONL, **not** as a message, so it adds `cacheRead` / `cacheWrite` spend with no turn attached.

## Cross-references

- Usage surfaces as `output.usage.cacheRead` / `cacheWrite` (plus `cacheWrite1h`) at `:619-624` (message start) and `:773-786` (usage deltas).
- `sanitizeSurrogates` (system blocks at `:1089`, `:1098`; message text at `:144`, `:152`) strips lone UTF-16 surrogates. It is orthogonal to caching.
- How the transcript's system messages are built and patched: `reference/assembly-order.md`.
