# Auth Resolution

How pi resolves credentials for a given provider, what `~/.pi/agent/auth.json` contains, and the OAuth-vs-API-key billing distinction (especially for Anthropic). All cites against pi-mono `HEAD` on the date this file was written.

## The five-step resolution order

The authoritative resolver is `AuthStorage.getApiKey(providerId, options?)` at `packages/coding-agent/src/core/auth-storage.ts:455-514`. The order below mirrors the function body. Higher entries win; the resolver short-circuits as soon as one returns a value.

| # | Source | Code | Notes |
|---|---|---|---|
| 1 | **Runtime override** (`--api-key` CLI flag, `pi.setApiKey` from extensions) | `auth-storage.ts:457-460` (`runtimeOverrides` map populated by `setRuntimeApiKey` at `:220-222`) | In-memory only, lives for the process. CLI flag wires here via `args.ts` → `main.ts`. |
| 2 | **`auth.json` API-key entry** | `auth-storage.ts:464-466` | Calls `resolveConfigValue(cred.key)` (`:466`) — supports `!shell-command`, env-var-name lookup, or literal value. |
| 3 | **`auth.json` OAuth entry** | `auth-storage.ts:468-505` | Auto-refreshes if `Date.now() >= cred.expires` (`:475`) using a file lock (`refreshOAuthTokenWithLock`). On refresh failure, re-reads the file in case another instance won the lock; otherwise returns `undefined` so model discovery skips this provider rather than erroring. |
| 4 | **Environment variable** (via `getEnvApiKey`) | `auth-storage.ts:507-509` → `packages/ai/src/env-api-keys.ts:153-205` | The env-var name is per-provider; see `reference/built-in-providers.md` and the `envMap` at `env-api-keys.ts:101-130`. |
| 5 | **Custom resolver** (`models.json` provider keys) | `auth-storage.ts:511-514` | Behind `options?.includeFallback !== false` so model discovery can opt out. The `fallbackResolver` is wired up by the model registry. |

The `packages/coding-agent/docs/providers.md:226-232` doc summarizes this as a four-step list (CLI → auth.json → env → models.json) — accurate in spirit, but it flattens steps 2 and 3 (api_key vs oauth inside `auth.json`) into one. Both file entries are checked at the same priority level; the entry's `type` field decides which branch runs.

## auth.json shape

Stored at `~/.pi/agent/auth.json`. File mode `0600`, parent dir mode `0700` (`auth-storage.ts:53-67`). Path resolved by `getAuthPath()` at `packages/coding-agent/src/config.ts:421-423`.

Top-level shape: `Record<providerId, AuthCredential>` — see `auth-storage.ts:34` (`AuthStorageData`).

Two credential variants (`auth-storage.ts:23-32`):

```typescript
type ApiKeyCredential = { type: "api_key"; key: string };
type OAuthCredential  = { type: "oauth" } & OAuthCredentials;
type AuthCredential   = ApiKeyCredential | OAuthCredential;
```

### ApiKeyCredential — the `key` field

The `key` string is run through `resolveConfigValue` (defined in `core/resolve-config-value.ts`, called at `auth-storage.ts:466`). Three formats, documented at `providers.md:88-104`:

- **Shell command**: leading `!` — pi runs the command, captures stdout, caches the result for the lifetime of the process. Useful for `!security find-generic-password -ws 'anthropic'`, `!op read 'op://vault/item/credential'`, etc.
- **Env-var indirection**: a bare uppercase identifier matching an env var (e.g. `"MY_ANTHROPIC_KEY"`) → uses `process.env[that]`.
- **Literal**: anything else, including a `sk-…` API key, used verbatim.

### OAuthCredential — what's in there

The `OAuthCredentials` shape (imported from `packages/ai`) carries `accessToken`, `refreshToken`, `expires`, plus optional provider-specific fields (e.g. account ID for github-copilot). On refresh, the entry is rewritten in-place under a file lock (`refreshOAuthTokenWithLock` at `auth-storage.ts:402-453`).

OAuth tokens are populated by the `/login` flow per provider (`/login` resolves to a per-provider OAuth flow in `interactive-mode.ts`). `/logout` clears the entry — see `auth-storage.ts:logout` neighbourhood.

## Anthropic OAuth detection — `sk-ant-oat`

The Anthropic OAuth path is the source of two recurring questions: "is pi using my OAuth or API key?" and "why does pi say I'm out of credits when I have a Max sub?" Both reduce to one detail.

**OAuth-token prefix detection**: `interactive-mode.ts:170-172`:

```typescript
function isAnthropicSubscriptionAuthKey(apiKey: string | undefined): boolean {
  return typeof apiKey === "string" && apiKey.startsWith("sk-ant-oat");
}
```

The `sk-ant-oat` prefix means "Anthropic OAuth Access Token" — i.e. the credential is from `/login` against `claude.ai`, not from the API console. When this returns true, pi shows the warning constant at `interactive-mode.ts:166-167` (fired at `:3943` and `:3953`):

> "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage."

This is the canonical statement of the billing model: **OAuth-from-Claude-Pro/Max → extra-usage pool → per-token billing**. The Pro/Max plan limit (e.g. "5x messages every 5 hours") covers usage **inside the Claude.ai web app**, not OAuth API traffic from third-party harnesses like pi.

### Env-var precedence: `ANTHROPIC_OAUTH_TOKEN` wins

`env-api-keys.ts:97-100` — for the `anthropic` provider only, `ANTHROPIC_OAUTH_TOKEN` is checked **before** `ANTHROPIC_API_KEY`. So:

- Both env vars set → OAuth wins → subscription/extra-usage billing.
- Only `ANTHROPIC_API_KEY` set → API billing on the corresponding API account.
- Only `auth.json` entry → its `type` decides (oauth → extra usage; api_key → API account).

### The third-party-app extra-usage pool depletion

Anthropic's extra-usage pool is **shared across third-party apps using OAuth**. If a user has Claude Code, pi, and any other OAuth-using harness pulling from the same Pro/Max account, they all draw from the same per-account pool. The pool refills (terms aren't documented stably; treat as opaque). Practical implication: if a teammate's session ran heavy on Claude Code earlier in the day, pi may report "out of credits" even though the user hasn't used pi much.

Recovery options:
- Wait for the pool to refill.
- Switch to API billing: unset OAuth in `auth.json` (or set `ANTHROPIC_API_KEY` directly — but remember `ANTHROPIC_OAUTH_TOKEN` takes precedence; you may need to clear that too).
- Switch to a different provider entirely.

## Diagnostic recipes

### "Is pi using OAuth or my API key right now?"

1. Read `~/.pi/agent/auth.json`. The `anthropic` entry's `type` field tells you (`"api_key"` vs `"oauth"`).
2. If env vars matter: check `ANTHROPIC_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` in the running shell. OAuth wins (`env-api-keys.ts:97-100`).
3. The interactive `/login` UI shows the active credential source (look for "stored" / "environment" labels — see `AuthStatus.source` at `auth-storage.ts:36-40`).
4. If pi prints the `ANTHROPIC_SUBSCRIPTION_AUTH_WARNING` at startup or after a `/login`, you're on OAuth/extra-usage.

### "Why does pi say I'm out of Anthropic credits when I have a Max sub?"

You're hitting the third-party-app extra-usage cap, not your Pro/Max plan. The warning at `interactive-mode.ts:166-167` says exactly this: subscription auth bills from extra usage, billed per token, not against your Pro/Max plan limits. Visit https://claude.ai/settings/usage to see the pool state. To bypass, switch to `ANTHROPIC_API_KEY`-based auth (and clear or shadow `ANTHROPIC_OAUTH_TOKEN`).

### "Why does my `--api-key` flag not seem to take effect?"

It does — but only at priority 1 (`auth-storage.ts:457-460`). Verify it's actually being parsed (see `args.ts`). If you're using `RpcClient` from a host program, pass `apiKey` through `RpcClientOptions` (which becomes `--api-key` on the spawned subprocess) — see **pi-rpc**.

### "How do I make `auth.json` read my key from 1Password / keychain?"

Use the shell-command form: `{ "type": "api_key", "key": "!op read 'op://vault/item/credential'" }`. The `!`-prefix triggers shell execution at `auth-storage.ts:466` via `resolveConfigValue`. Result is cached for the process lifetime.

## Cross-references

- The actual Anthropic OAuth flow (PKCE, `claude.ai`-hosted authorization) lives in `packages/ai/src/utils/oauth/anthropic.ts` — outside this skill's primary territory but cited here for completeness.
- The `anthropic-beta` headers `claude-code-20250219,oauth-2025-04-20` set on OAuth requests (`anthropic.ts:840`) interact with prompt caching — see **pi-prompt-assembly** `reference/cache-breakpoints.md` (the OAuth identity preamble is breakpoint #1a there).
- Per-provider env vars and `auth.json` keys: see `reference/built-in-providers.md`.
- Custom-provider auth (extensions registering their own OAuth flows): `pi.registerProvider` documented in `packages/coding-agent/docs/custom-provider.md`.
