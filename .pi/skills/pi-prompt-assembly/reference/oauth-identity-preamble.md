# OAuth Identity Preamble

The hard-coded `"You are Claude Code, Anthropic's official CLI for Claude."` system block that pi emits for Anthropic OAuth tokens, why it exists, and how it interacts with prompt caching. All cites against `packages/ai/src/api/anthropic-messages.ts` at the current pin (`v0.82.1`, `b4f29368`). Note: in the 0.80.x AI-package re-architecture, `packages/ai/src/providers/anthropic.ts` became an 18-line provider shell and this streaming/OAuth logic moved to `packages/ai/src/api/anthropic-messages.ts`.

## What it is

In `buildParams` (definition at `api/anthropic-messages.ts:930`), when the resolved API key is an OAuth token, pi splits `params.system` into **two** text blocks:

```ts
// api/anthropic-messages.ts:967-981 (the OAuth branch)
if (isOAuthToken) {
  params.system = [
    {
      type: "text",
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
      ...(cacheControl ? { cache_control: cacheControl } : {}),
    },
  ];
  if (context.systemPrompt) {
    params.system.push({
      type: "text",
      text: sanitizeSurrogates(context.systemPrompt),
      ...(cacheControl ? { cache_control: cacheControl } : {}),
    });
  }
}
```

Cites for the actual lines:

- Identity preamble text: `api/anthropic-messages.ts:971`
- Identity preamble `cache_control`: `api/anthropic-messages.ts:972`
- User-system-prompt `cache_control` (OAuth branch): `api/anthropic-messages.ts:972`
- Non-OAuth single-block `cache_control`: `api/anthropic-messages.ts:972`

The user's assembled system prompt (everything `buildSystemPrompt` produced — see `reference/assembly-order.md`) becomes the **second** block in OAuth mode. The first block is the constant identity string.

## Why pi emits it

Anthropic's OAuth contract (subscription auth via Claude Pro/Max) requires that requests identify as Claude Code. Pi mimics Claude Code's wire shape so OAuth tokens authenticate correctly:

- The identity text in the system block is constant and required.
- The `anthropic-beta` request header (set at `api/anthropic-messages.ts:894` inside the OAuth client construction) is `"claude-code-20250219,oauth-2025-04-20"` plus any extra beta features the model needs.
- The `user-agent` header is `claude-cli/<version>` (`api/anthropic-messages.ts:895`, `claudeCodeVersion` constant at `:74`).
- An `x-app: cli` header is set at `api/anthropic-messages.ts:896`.

Without these, an OAuth token is rejected by the API. They are inert (or omitted) when authenticating with a normal `sk-ant-...` API key.

## OAuth-token detection — `sk-ant-oat`

Detection function at `api/anthropic-messages.ts:838-840`:

```ts
function isOAuthToken(apiKey: string): boolean {
  return apiKey.includes("sk-ant-oat");
}
```

Used by `createClient` (def `api/anthropic-messages.ts:842`) at the OAuth-branch check `api/anthropic-messages.ts:884` to decide whether to:

- Set `apiKey: null` and `authToken: <token>` (Bearer auth, OAuth flow).
- Add the Claude Code identity headers (`api/anthropic-messages.ts:893-896`).

Note pi-mono has the `sk-ant-oat` detection in **two** places:

- `packages/ai/src/api/anthropic-messages.ts:838-840` — uses `apiKey.includes("sk-ant-oat")` (substring match).
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:217` — uses `apiKey.startsWith("sk-ant-oat")`.

The interactive-mode check fires the user-facing `ANTHROPIC_SUBSCRIPTION_AUTH_WARNING` constant at `interactive-mode.ts:213-214` (the "Third-party harness usage draws from extra usage" message). See **pi-providers** `reference/auth-resolution.md` for the user-facing implications.

## How it adds a fourth cache breakpoint

Anthropic supports up to four `cache_control` markers per request. Without OAuth:

- **Site #1b** (`api/anthropic-messages.ts:972`) — system prompt block (single text block in `params.system`).
- **Site #3** (`api/anthropic-messages.ts:1311`) — last tool definition.
- **Site #4** (`api/anthropic-messages.ts:1247-1269`) — last user message.

That's three breakpoints, one slot unused.

OAuth adds a second system-prompt block, splitting site #1 into two:

- **Site #1a** (`api/anthropic-messages.ts:972`) — the identity preamble. Constant text → cache hit on every request for the same OAuth token.
- **Site #2** (`api/anthropic-messages.ts:972`) — the user system prompt. Same content as the non-OAuth #1b, just in the second block.

Net result: 4 breakpoints, all slots used.

The identity preamble is the cheapest cache hit pi has — its text is invariant across every session, every model switch within OAuth, and every system-prompt edit. Once warmed up, it never invalidates as long as the OAuth path is active.

## Cache invalidation cascade

| Edit | Site #1a | Site #2 | Site #3 | Site #4 |
|---|---|---|---|---|
| Anthropic OAuth token rotates | invalidated | invalidated | invalidated | invalidated |
| Switch from OAuth to API key | site collapses to single-block #1b | n/a | invalidated (different request shape) | invalidated |
| Edit AGENTS.md / APPEND_SYSTEM.md | survives | invalidated | survives | survives |
| Add/remove a tool | survives | survives | invalidated | survives |
| Send a new message | survives | survives | survives | invalidated |

Edge case: if `cacheRetention` resolves to `"none"` (`getCacheControl` at `api/anthropic-messages.ts:59-57`), **none** of the breakpoints are emitted. Including the OAuth identity preamble — site #1a still has its text but no `cache_control` marker, so it's not a cache breakpoint, just a regular system-block prefix.

## Practical implications for hosts and extensions

- **Hosts using OAuth tokens** see one extra `cache_creation_input_tokens` charge on the very first request after acquiring or refreshing the token (warming up site #1a).
- **Subsequent requests** read site #1a from cache for free, even after `--system-prompt` swaps that invalidate site #2.
- **Extensions that mutate `context.systemPrompt`** via the `before_agent_start` hook only invalidate site #2, not the identity preamble.
- **Switching models within Anthropic** preserves both #1a and #2 (the model id is in the request body, not in the cached system blocks).

## Cross-references

- Per-breakpoint deep dive (what each caches, what invalidates it, the practical implications cascade): `reference/cache-breakpoints.md`.
- The `sk-ant-oat` token-prefix story from the auth angle (subscription billing, third-party-app extra-usage pool): **pi-providers** `reference/auth-resolution.md`.
- The `anthropic-beta` header construction and other OAuth-only headers: `api/anthropic-messages.ts:893-896`.
- `getCacheControl` resolver (governs whether breakpoints are emitted at all): `api/anthropic-messages.ts:59-57`.
