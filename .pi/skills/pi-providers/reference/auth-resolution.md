# Auth Resolution

How pi resolves credentials for a given provider, what `~/.pi/agent/auth.json` contains, and the OAuth-vs-API-key billing distinction (especially for Anthropic). All cites against the current pin (`v0.82.1`, `b4f29368`).

## The five-step resolution order

> ⚠️ **STALE — pending re-derivation (confidence: low).** The table below described `AuthStorage.getApiKey(providerId, options?)`, which **no longer exists**. The `9993c969` "replace model registry with model runtime" refactor (landed **v0.80.8**, so this was already dead at the previous `v0.80.9` pin — missed by that gap-scan) moved auth resolution out of `AuthStorage` entirely. Every `auth-storage.ts:4xx/5xx` cite in the table is dead: the file is now 271 lines and holds **credential storage only** (`AuthStorage` class at `auth-storage.ts:171` — `read` `:217`, `modify` `:224`, `delete` `:242`, `list` `:252`, with `resolveConfigValue` expansion at `:221`).
>
> **Verified new entry points** (confidence: high):
> - `ModelRuntime.getAuth(providerId | model, overrides?)` — `packages/coding-agent/src/core/model-runtime.ts:374-376`. The runtime-level resolver.
> - `composeApiKeyAuth(...)` — `packages/coding-agent/src/core/provider-composer.ts:293`. Composes the per-provider API-key chain: stored credential → configured API key (`resolveConfigValueOrThrow` at `:343`) → `inherited` provider default (env vars). `composeOAuthAuth` at `:359` handles the OAuth branch.
> - `ModelRegistry.getApiKeyForProvider(provider)` — `packages/coding-agent/src/core/model-registry.ts:107-113`, now a thin delegate to `runtime.getAuth(provider)`.
> - Env-var lookup: `getEnvApiKey` — `packages/ai/src/env-api-keys.ts:143`.
>
> The *precedence outcome* below is probably still broadly right (runtime override → `auth.json` → env → `models.json`), but it has **not** been re-derived against the composer chain — do not cite the line numbers in the table until it has.

| # | Source | Code | Notes |
|---|---|---|---|
| 1 | **Runtime override** (`--api-key` CLI flag, `pi.setApiKey` from extensions) | `auth-storage.ts:474-477` (`runtimeOverrides` map declared at `:201`, populated by `setRuntimeApiKey` at `:230-232`) | In-memory only, lives for the process. CLI flag wires here via `args.ts` → `main.ts`. |
| 2 | **`auth.json` API-key entry** | `auth-storage.ts:482-484` | Calls `resolveConfigValue(cred.key, cred.env)` (`:483`) — supports `!shell-command`, env-var-name lookup, or literal value. The optional `cred.env` is the per-credential env scope added in 0.79.5 (see "Provider-scoped env overrides" below). |
| 3 | **`auth.json` OAuth entry** | `auth-storage.ts:486-522` | Auto-refreshes if `Date.now() >= cred.expires` (`:494`) using a file lock (`refreshOAuthTokenWithLock` at `:418-462`). On refresh failure, re-reads the file in case another instance won the lock; otherwise returns `undefined` so model discovery skips this provider rather than erroring. |
| 4 | **Environment variable** (via `getEnvApiKey`) | `auth-storage.ts:524-525` → `packages/ai/src/env-api-keys.ts:143-`(function body) | The env-var name is per-provider; see `reference/built-in-providers.md` and `getApiKeyEnvVars` at `env-api-keys.ts:68-117`. |
| 5 | **Custom resolver** (`models.json` provider keys) | `auth-storage.ts:528-531` | Behind `options?.includeFallback !== false` so model discovery can opt out. The `fallbackResolver` is wired up by the model registry. |

The `packages/coding-agent/docs/providers.md` doc summarizes this as a four-step list (CLI → auth.json → env → models.json) — accurate in spirit, but it flattens steps 2 and 3 (api_key vs oauth inside `auth.json`) into one. Both file entries are checked at the same priority level; the entry's `type` field decides which branch runs.

## auth.json shape

Stored at `~/.pi/agent/auth.json`. File mode `0600` (written via `AUTH_FILE_WRITE_OPTIONS` at `auth-storage.ts:49`; reapplied via `chmodSync(this.authPath, 0o600)` at `:73, :115, :160`), parent dir mode `0700` (`mkdirSync(..., { recursive: true, mode: 0o700 })` at `:66`). Path resolved by `getAuthPath()` at `packages/coding-agent/src/config.ts:534-536`.

Top-level shape: `Record<providerId, AuthCredential>` — see `auth-storage.ts:36` (`AuthStorageData`).

Two credential variants (`auth-storage.ts:24-34`):

```typescript
type ApiKeyCredential = { type: "api_key"; key: string; env?: Record<string, string> };
type OAuthCredential  = { type: "oauth" } & OAuthCredentials;
type AuthCredential   = ApiKeyCredential | OAuthCredential;
```

The `env?: Record<string, string>` on `ApiKeyCredential` is the provider-scoped environment override added in 0.79.5 (see below).

### ApiKeyCredential — the `key` field

The `key` string is run through `resolveConfigValue` (defined in `core/resolve-config-value.ts`, called at `auth-storage.ts:483` as `resolveConfigValue(cred.key, cred.env)`). The supported formats:

- **Shell command**: leading `!` — pi runs the command, captures stdout, caches the result for the lifetime of the process. Useful for `!security find-generic-password -ws 'anthropic'`, `!op read 'op://vault/item/credential'`, etc.
- **Env-var indirection**: an explicit `$ENV_VAR` or `${ENV_VAR}` reference — expanded against `cred.env` first, then `process.env`. (Note: 0.79.4 made plain uppercase strings literals — use the `$` prefix for env-var indirection. See `providers.md` "Key Resolution".)
- **Literal**: anything else, including a `sk-…` API key, used verbatim. Escape a leading `$` as `$$` and a leading `!` as `$!`.

### ApiKeyCredential.env — provider-scoped environment overrides (0.79.5+)

Added in 0.79.5. The optional `env: Record<string, string>` on an `ApiKeyCredential` is consulted *before* `process.env` whenever `resolveConfigValue` expands a `$VAR` reference — both inside the credential's own `key` and when the provider asks for related config values (Cloudflare account/gateway IDs, Vertex project/location, Bedrock settings, `PI_CACHE_RETENTION`, `HTTP_PROXY`/`HTTPS_PROXY`). Lets you scope all provider-specific settings to pi without polluting the project shell.

Example (`docs/providers.md`):

```json
{
  "cloudflare-ai-gateway": {
    "type": "api_key",
    "key": "$CLOUDFLARE_API_KEY",
    "env": {
      "CLOUDFLARE_API_KEY": "...",
      "CLOUDFLARE_ACCOUNT_ID": "account-id",
      "CLOUDFLARE_GATEWAY_ID": "gateway-id"
    }
  }
}
```

Wired through the `ProviderEnv` parameter that `resolveConfigValue` accepts; see also `env-api-keys.ts:findEnvKeys`/`getEnvApiKey` which accept an optional `env` argument and consult it before `process.env`.

### OAuthCredential — what's in there

The `OAuthCredentials` shape (imported from `packages/ai`) carries `accessToken`, `refreshToken`, `expires`, plus optional provider-specific fields (e.g. account ID for github-copilot). On refresh, the entry is rewritten in-place under a file lock (`refreshOAuthTokenWithLock` at `auth-storage.ts:418-462`).

OAuth tokens are populated by the `/login` flow per provider (`/login` resolves to a per-provider OAuth flow in `interactive-mode.ts`). `/logout` clears the entry — see `auth-storage.ts:logout` neighbourhood.

## Anthropic OAuth detection — `sk-ant-oat`

The Anthropic OAuth path is the source of two recurring questions: "is pi using my OAuth or API key?" and "why does pi say I'm out of credits when I have a Max sub?" Both reduce to one detail.

**OAuth-token prefix detection**: `interactive-mode.ts:200-203`:

```typescript
function isAnthropicSubscriptionAuthKey(apiKey: string | undefined): boolean {
  return typeof apiKey === "string" && apiKey.startsWith("sk-ant-oat");
}
```

The `sk-ant-oat` prefix means "Anthropic OAuth Access Token" — i.e. the credential is from `/login` against `claude.ai`, not from the API console. When this returns true, pi shows the warning constant `ANTHROPIC_SUBSCRIPTION_AUTH_WARNING` at `interactive-mode.ts:197-199` (emission helper `maybeWarnAboutAnthropicSubscriptionAuth` at `:4165`, `showWarning(...)` calls at `:4181` and `:4191`):

> "Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at https://claude.ai/settings/usage."

This is the canonical statement of the billing model: **OAuth-from-Claude-Pro/Max → extra-usage pool → per-token billing**. The Pro/Max plan limit (e.g. "5x messages every 5 hours") covers usage **inside the Claude.ai web app**, not OAuth API traffic from third-party harnesses like pi.

### Env-var precedence: `ANTHROPIC_OAUTH_TOKEN` wins

`packages/ai/src/env-api-keys.ts:76` — for the `anthropic` provider only, `ANTHROPIC_OAUTH_TOKEN` is checked **before** `ANTHROPIC_API_KEY`. So:

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
2. If env vars matter: check `ANTHROPIC_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` in the running shell. OAuth wins (`packages/ai/src/env-api-keys.ts:76`).
3. The interactive `/login` UI shows the active credential source (look for "stored" / "environment" labels — see `AuthStatus.source` at `auth-storage.ts:38-42`).
4. If pi prints the `ANTHROPIC_SUBSCRIPTION_AUTH_WARNING` at startup or after a `/login`, you're on OAuth/extra-usage.

### "Why does pi say I'm out of Anthropic credits when I have a Max sub?"

You're hitting the third-party-app extra-usage cap, not your Pro/Max plan. The warning at `interactive-mode.ts:197-199` says exactly this: subscription auth bills from extra usage, billed per token, not against your Pro/Max plan limits. Visit https://claude.ai/settings/usage to see the pool state. To bypass, switch to `ANTHROPIC_API_KEY`-based auth (and clear or shadow `ANTHROPIC_OAUTH_TOKEN`).

### "Why does my `--api-key` flag not seem to take effect?"

It does — but only at priority 1 (`auth-storage.ts:474-477`). Verify it's actually being parsed (see `args.ts`). If you're using `RpcClient` from a host program, pass `apiKey` through `RpcClientOptions` (which becomes `--api-key` on the spawned subprocess) — see **pi-rpc**.

### "How do I make `auth.json` read my key from 1Password / keychain?"

Use the shell-command form: `{ "type": "api_key", "key": "!op read 'op://vault/item/credential'" }`. The `!`-prefix triggers shell execution at `auth-storage.ts:483` via `resolveConfigValue`. Result is cached for the process lifetime.

## Cross-references

- The actual Anthropic OAuth flow (PKCE, `claude.ai`-hosted authorization) lives in `packages/ai/src/auth/oauth/anthropic.ts` (relocated from `packages/ai/src/utils/oauth/anthropic.ts` in the 0.80.x re-architecture) — outside this skill's primary territory but cited here for completeness.
- The `anthropic-beta` headers `claude-code-20250219,oauth-2025-04-20` set on OAuth requests (`api/anthropic-messages.ts:894`) interact with prompt caching — see **pi-prompt-assembly** `reference/cache-breakpoints.md` (the OAuth identity preamble is breakpoint #1a there). Note: in the 0.80.x AI-package re-architecture the streaming/OAuth logic moved from `packages/ai/src/providers/anthropic.ts` (now an 18-line provider shell) to `packages/ai/src/api/anthropic-messages.ts`.
- Per-provider env vars and `auth.json` keys: see `reference/built-in-providers.md`.
- Custom-provider auth (extensions registering their own OAuth flows): `pi.registerProvider` documented in `packages/coding-agent/docs/custom-provider.md`.
- The global `httpProxy` setting in `~/.pi/agent/settings.json` (0.79.5) and per-credential `env: {}` overrides both compose with the auth-resolution path — see `settings-manager.ts:120` for the setting and `http-dispatcher.ts:42-45` for `applyHttpProxySettings` (sets `process.env.HTTP_PROXY` and `HTTPS_PROXY` via `??=`, so pre-existing process-env values still win).
