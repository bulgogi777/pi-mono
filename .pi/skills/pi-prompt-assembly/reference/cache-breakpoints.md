# Anthropic Prompt-Cache Breakpoints

Anthropic's Messages API supports up to **4** `cache_control: { type: "ephemeral" }` markers per request. Pi's Anthropic provider places them at fixed positions. All cites against `packages/ai/src/providers/anthropic.ts` at the current pin (`v0.79.10`, `8e190066`). Note: this file relocated from `packages/ai/src/anthropic.ts` in the 0.79.x AI-package refactor; any reference to `packages/ai/src/anthropic.ts:NNN` in downstream docs is broken on both path and line.

## The resolver

`getCacheControl(model, cacheRetention, env)` at `providers/anthropic.ts:57-71`. Inputs the model, requested retention (`"none" | "short" | "long"`), and provider env; returns either `{ retention: "none" }` (no caching at all) or `{ retention, cacheControl: { type: "ephemeral", ttl? } }`. The `ttl: "1h"` is added only when `retention === "long"` AND `getAnthropicCompat(model).supportsLongCacheRetention` is true (`:66`). Otherwise the breakpoint is the default short (5 min) ephemeral cache.

The result feeds `buildParams` (definition at `providers/anthropic.ts:913`) via `const { cacheControl } = getCacheControl(model, options?.cacheRetention, options?.env)` at `:919`. Every breakpoint site below is gated on `cacheControl` being defined — when retention is `"none"`, **no** `cache_control` markers are emitted at all.

## The four breakpoint sites

| # | Site | Where | Caches | Invalidated by |
|---|---|---|---|---|
| 1a | OAuth identity preamble | `providers/anthropic.ts:934` (inside the `isOAuthToken` block at `:929-936`) | The literal block `text: "You are Claude Code, Anthropic's official CLI for Claude."` (`:933`). Hard-coded — never changes between requests for the same OAuth token. | Token type changing from OAuth to API key. The text itself is constant. |
| 1b | Non-OAuth system prompt | `providers/anthropic.ts:950` (inside the `else if (context.systemPrompt)` block at `:945-953`) | The full assembled system prompt (`context.systemPrompt`), passed through `sanitizeSurrogates(...)` at `:949`. This is everything `buildSystemPrompt` produced — preamble + tools list + guidelines + APPEND_SYSTEM + `<project_context>` block (was `# Project Context` Markdown heading pre-0.75.0; XML tags since PRs #4541 / #4709) + skills + date + cwd. | **Any** byte change inside the system prompt: AGENTS.md edit, APPEND_SYSTEM.md edit, skill name/description/location change, switching `--system-prompt`, even the daily date rollover (`system-prompt.ts` builds the `date` string each rebuild). |
| 2 | OAuth user system prompt | `providers/anthropic.ts:941` (inside `if (context.systemPrompt)` nested under `isOAuthToken`, `:937-943`) | Same content as #1b — `sanitizeSurrogates(context.systemPrompt)` — but emitted as a **second** `system[]` block following the identity preamble. Only present in OAuth mode. | Same triggers as #1b. |
| 3 | Last tool definition | `providers/anthropic.ts:1220` (inside `convertTools`, definition at `:1200`) | Marker is attached to the **last** tool in the `tools` array (`index === tools.length - 1`). Acts as a cache breakpoint for the *whole* tool-definitions block — once the last tool is marked, everything earlier in `tools[]` rides the same cached prefix. | Any change to the tool list: enabling/disabling tools, schema changes, tool order changes, OAuth-mode renaming via `toClaudeCodeName` (`:1212`), toggling `eager_input_streaming` (`:1214`). |
| 4 | Last user message | `providers/anthropic.ts:1170-1186` (after `convertMessages` builds `params`) | Marker attached to the last block of the last `params[]` entry, but **only** when that last entry has `role: "user"` (`:1172`). For an array `content`, the very last `text` / `image` / `tool_result` block gets `cache_control` (`:1173-1180`). For a string `content`, it's converted to `[{ type: "text", text, cache_control }]` (`:1181-1188`). | Any new turn appended to the conversation, since the marker moves to the new last user message. Also: the *previous* turn's marker is silently dropped — there is no rolling window of >1 conversation breakpoint here. |

## Counting per request

- **Non-OAuth (API key)**: 3 sites used — `:950` system, `:1220` last tool, `:1170-1186` last user. One slot of the 4-breakpoint budget is unused.
- **OAuth (subscription / Claude Code identity)**: 4 sites used — `:934` identity preamble, `:941` user system, `:1220` last tool, `:1170-1186` last user. Budget fully consumed.
- **Tools-empty request**: site #3 disappears (no `tools[]` entries to mark), so non-OAuth drops to 2 breakpoints, OAuth to 3.
- **No system prompt** (rare in pi but possible if a caller passes `systemPrompt: undefined` to the SDK directly): site #1b disappears in non-OAuth mode; in OAuth mode #1a still fires (the identity preamble is unconditional inside `isOAuthToken`) but #2 is skipped (`:937`).

## OAuth identity preamble specifics

The OAuth path adds the literal string `"You are Claude Code, Anthropic's official CLI for Claude."` as a separate `system[]` entry **before** the user's system prompt. Visible in pi via the system prompt header. This is required by Anthropic's OAuth contract for subscription auth and is what claims the first cache breakpoint. The `anthropic-beta` header at `providers/anthropic.ts:878` (`"claude-code-20250219,oauth-2025-04-20,..."`) is set in the same OAuth code path.

Because the identity preamble is constant, breakpoint #1a is the cheapest cache hit pi has — it survives across every session, every model switch within OAuth, and every system-prompt edit.

## Practical implications

Read these as cause → cascade.

- **Editing `APPEND_SYSTEM.md` (or `--append-system-prompt`)** → invalidates breakpoint #1b (non-OAuth) or #2 (OAuth). The identity preamble #1a survives. Tools (#3) survive. Last user message (#4) survives. **Net cost**: full system-prompt cache_write next turn, but tools and conversation history still cache-hit.

- **Editing an `AGENTS.md` / `CLAUDE.md` reachable from cwd** → same as APPEND_SYSTEM: invalidates the system-prompt block, leaves everything else intact. The pi-architecture ancestor walk decides which file content is in scope (see `pi-architecture` skill).

- **Editing a skill's `name` / `description` / file `location`** → invalidates the system-prompt block because `formatSkillsForPrompt` (`skills.ts:335-361`) renders these into the prompt. Same blast radius as AGENTS.md.

- **Editing a skill's body (everything after the YAML frontmatter)** → **zero** cache impact. The body is never in the system prompt; it's loaded by the model via a `read` tool call when the skill is invoked. Tool-result caching for that read still works the same way as any other read result (gets cached on the next conversation-tail breakpoint).

- **Adding/removing/reordering tools** → invalidates breakpoint #3, which by extension invalidates everything after it in the request (tools come after system in the wire order). `cache_write` next turn covers all tool definitions; system stays cached.

- **Date rollover at midnight local time** → invalidates breakpoint #1b/#2. The trailing `Current date: YYYY-MM-DD` line (rendered by `system-prompt.ts` near the end of both branches; the `date` string is rebuilt each call to `buildSystemPrompt`) changes once per day. First request after midnight pays a full system-prompt cache_write.

- **Switching from API-key to OAuth mid-session** → loses all cache (different system block shape; identity preamble appears).

- **Long retention (1h)**: only effective on models where `getAnthropicCompat(model).supportsLongCacheRetention` is true (`:66`; the compat default lives at `providers/anthropic.ts:180`). On unsupported models, requesting `"long"` silently downgrades to short. Check the compat table in `packages/ai/src/providers/anthropic.ts` (`getAnthropicCompat`) if a model isn't getting the 1h TTL you expected.

## Cross-references

- `cacheRead` / `cacheWrite` token usage values surface from the API into `output.usage.cacheRead` / `cacheWrite` at `providers/anthropic.ts:541-543` (streaming start_message) and `:684-687` (streaming usage deltas). These are the numbers pi's footer / telemetry display.
- The `CacheRetention` type is imported at `providers/anthropic.ts:16`; `resolveCacheRetention` helper at `:47`.
- Surrogate sanitization (`sanitizeSurrogates`, used in `convertMessages` at `:131, :139` and in `buildParams` for system blocks at `:940, :949`) is an orthogonal concern — it strips lone UTF-16 surrogates that would otherwise crash the JSON serializer. Worth knowing but not part of the cache logic.
- Model-level cache support flags: `getAnthropicCompat(model).supportsLongCacheRetention` (used at `:66`); other compat flags (`supportsEagerToolInputStreaming`, etc.) live in the same compat block within `providers/anthropic.ts`.
