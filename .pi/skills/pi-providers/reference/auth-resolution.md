# Auth Resolution

How pi resolves credentials for a given provider, what `~/.pi/agent/auth.json` contains, and the OAuth-vs-API-key billing distinction (especially for Anthropic). All cites against the current pin (`v0.85.1`, `d981de12`).

## The resolution order

Re-derived 2026-07-26 against `v0.82.1`, re-anchored 2026-08-13 to `v0.84.1` (confidence: **high** — traced end-to-end through the live call path, not inferred). Replaces the pre-v0.80.8 `AuthStorage.getApiKey` description; that function was deleted by `9993c969` and `auth-storage.ts` is now credential **storage** only (`AuthStorage` at `core/auth-storage.ts:327` — `read` `:441`, `modify` `:449`, `delete` `:473`, `list` `:485`).

**Call path:** `ModelRuntime.getAuth` (`model-runtime.ts:472-493`) → `Models.getAuth` (`packages/ai/src/models.ts`) → **`resolveProviderAuth`** (`packages/ai/src/auth/resolve.ts:46-77`) — *this is the authoritative resolver*. For providers configured via `models.json`/extensions, the provider's own `auth.apiKey` has been wrapped by `composeApiKeyAuth` (`provider-composer.ts:310`, resolve body `:350-371`), which inserts the configured key into the chain.

| # | Source | Code | Notes |
|---|---|---|---|
| 1 | **Per-request override** (`options.apiKey`, `--api-key`) | `resolve.ts:54-60` | Short-circuits everything; builds a synthetic `api_key` credential from the override, carrying `overrides.env`. |
| 2 | **Runtime in-memory key** (`pi.setApiKey` from extensions) | `runtime-credentials.ts:24-27` | `RuntimeCredentials` is a `CredentialStore` **overlay**: `read()` returns the in-memory override if present, else delegates to `AuthStorage`. So runtime keys enter as a "stored credential" ranked above `auth.json`. Process-lifetime only. |
| 3 | **`auth.json` credential** | `resolve.ts:62-72` | `type: "oauth"` → `resolveStoredOAuth` (`:127`) with **double-checked locking**: valid tokens take no lock; expired ones lock, re-check expiry, refresh once globally, persist the rotation. `type: "api_key"` → `resolveApiKey` with `overrides.env` merged over the credential's own `env` (`:66`). |
| 4 | **`models.json` / extension-configured `apiKey`** | `provider-composer.ts:358-363` | Expanded by `resolveConfigValueOrThrow` (`:360`) — `!shell-command`, `$ENV_VAR`, or literal. Reported as `source: "configured API key"`. |
| 5 | **Ambient** (env vars, AWS profiles, ADC files) | `resolve.ts:106-109` → provider's own `apiKey.resolve` | Reached only when there is **no** stored credential. Per-provider env names via `getApiKeyEnvVars`; for `anthropic` the order is `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_OAUTH_TOKEN` → `ANTHROPIC_API_KEY` (`packages/ai/src/env-api-keys.ts:76`). |

### Two corrections vs. the pre-v0.80.8 description

1. **`models.json` outranks environment variables** — they were listed the other way round (env at #4, models.json as a last-resort "fallback" at #5). In `composeApiKeyAuth`, a configured `rawKey` is consumed *before* delegating to `inherited` (the built-in provider's env-var resolution): configured-key branch `:358-363`, env branch `:364-365`. The old `options.includeFallback` flag no longer exists.

2. **A stored credential SHORT-CIRCUITS — it never falls through to env.** `resolve.ts:62-72`: if `credentials.read()` returns anything, that branch decides the outcome, and if the stored type has no matching provider method the function **`return undefined` (`:103`)** rather than trying ambient auth. Practical consequence: a stale or wrong-type entry in `auth.json` makes the provider look *unconfigured* even when a perfectly good `ANTHROPIC_API_KEY` is exported. When debugging "pi says the provider isn't configured but my env var is set", check `auth.json` **first** — deleting the entry (or `/logout`) is what restores env-var resolution.

`packages/coding-agent/docs/providers.md` still summarizes this as CLI → auth.json → env → models.json. That ordering is **wrong on the last two** — trust the table above.

## auth.json shape

Stored at `~/.pi/agent/auth.json`. File mode `0600` (written via `AUTH_FILE_WRITE_OPTIONS` at `auth-storage.ts:69`; reapplied via `chmodSync(this.authPath, 0o600)` at `:93, :115, :160`), parent dir mode `0700` (`mkdirSync(..., { recursive: true, mode: 0o700 })` at `:86`). Path resolved by `getAuthPath()` at `packages/coding-agent/src/config.ts:547-549`.

Top-level shape: `Record<providerId, AuthCredential>` — see `auth-storage.ts:57` (`AuthStorageData`).

Two credential variants (`auth-storage.ts:42-55`):

```typescript
type ApiKeyCredential = { type: "api_key"; key: string; env?: Record<string, string> };
type OAuthCredential  = { type: "oauth" } & OAuthCredentials;
type AuthCredential   = ApiKeyCredential | OAuthCredential;
```

The `env?: Record<string, string>` on `ApiKeyCredential` is the provider-scoped environment override added in 0.79.5 (see below).

### ApiKeyCredential — the `key` field

The `key` string is run through `resolveConfigValue` (defined in `core/resolve-config-value.ts`, called at `auth-storage.ts:446` as `resolveConfigValue(credential.key, credential.env)`). The supported formats:

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

The `OAuthCredentials` shape (imported from `packages/ai`) carries `accessToken`, `refreshToken`, `expires`, plus optional provider-specific fields (e.g. account ID for github-copilot). On refresh, the entry is rewritten in-place under a file lock (`resolveStoredOAuth` at `packages/ai/src/auth/resolve.ts:127+`, double-checked locking; moved out of `auth-storage.ts` in v0.80.8).

OAuth tokens are populated by the `/login` flow per provider. `/logout` clears the entry — see `auth-storage.ts:logout` neighbourhood.

### `/login` is interactive — three branches

`handleLoginCommand(providerRef?)` (`interactive-mode.ts:5479-5500`). It is **not** a "you must name a provider" command:

| Invocation | Behavior | Code |
|---|---|---|
| `/login` (no argument) | Opens the **auth-type selector** — pick provider + auth flavor from a list. This is the normal path. | `:5480-5483` |
| `/login <ref>` matching exactly one provider+authType | Goes straight into that login (`startProviderLogin`; OAuth branch at `:5503`). | `:5486-5488` |
| `/login <ref>` matching several entries that are all the **same** provider id | Opens the auth-type selector scoped to that provider — i.e. "which auth flavor for this provider". | `:5491-5496` |
| `/login <ref>` matching several **different** providers, or nothing | Falls through to `showLoginProviderSelector(undefined, providerRef)` with the ref as a filter. | `:5499` |

`findLoginProviderOptions(providerRef)` (`:5485`) is what produces the candidate list, and `modelRuntime.getAvailable()` is awaited first (`:5151`) so the selector reflects the live registry.

## Anthropic OAuth detection — `sk-ant-oat`

The Anthropic OAuth path is the source of two recurring questions: "is pi using my OAuth or API key?" and "why does pi say I'm out of credits when I have a Max sub?" Both reduce to one detail.

**OAuth-token prefix detection**: `interactive-mode.ts:236-243`:

```typescript
function isAnthropicSubscriptionAuthKey(apiKey: string | undefined): boolean {
  return typeof apiKey === "string" && apiKey.startsWith("sk-ant-oat");
}
```

The `sk-ant-oat` prefix means "Anthropic OAuth Access Token" — i.e. the credential is from `/login` against `claude.ai`, not from the API console. When this returns true, pi shows the warning constant `ANTHROPIC_SUBSCRIPTION_AUTH_WARNING` at `interactive-mode.ts:206-208` (emission helper `maybeWarnAboutAnthropicSubscriptionAuth` at `:4609`, `showWarning(...)` calls at `:4625` and `:4635`):

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
3. The interactive `/login` UI shows the active credential source (look for "stored" / "environment" labels — see `AuthStatus.source` at `auth-storage.ts:59-63`).
4. If pi prints the `ANTHROPIC_SUBSCRIPTION_AUTH_WARNING` at startup or after a `/login`, you're on OAuth/extra-usage.

### "Why does pi say I'm out of Anthropic credits when I have a Max sub?"

You're hitting the third-party-app extra-usage cap, not your Pro/Max plan. The warning at `interactive-mode.ts:206-208` says exactly this: subscription auth bills from extra usage, billed per token, not against your Pro/Max plan limits. Visit https://claude.ai/settings/usage to see the pool state. To bypass, switch to `ANTHROPIC_API_KEY`-based auth (and clear or shadow `ANTHROPIC_OAUTH_TOKEN`).

### "Why does my `--api-key` flag not seem to take effect?"

It does — but only at priority 1 (`packages/ai/src/auth/resolve.ts:54-60` for `options.apiKey`; `runtime-credentials.ts:24-27` for `pi.setApiKey`). Verify it's actually being parsed (see `args.ts`). If you're using `RpcClient` from a host program, pass `apiKey` through `RpcClientOptions` (which becomes `--api-key` on the spawned subprocess) — see **pi-rpc**.

### "How do I make `auth.json` read my key from 1Password / keychain?"

Use the shell-command form: `{ "type": "api_key", "key": "!op read 'op://vault/item/credential'" }`. The `!`-prefix triggers shell execution at `auth-storage.ts:446` via `resolveConfigValue`. Result is cached for the process lifetime.

## Cross-references

- The actual Anthropic OAuth flow (PKCE, `claude.ai`-hosted authorization) lives in `packages/ai/src/auth/oauth/anthropic.ts` (relocated from `packages/ai/src/utils/oauth/anthropic.ts` in the 0.80.x re-architecture) — outside this skill's primary territory but cited here for completeness.
- The `anthropic-beta` headers `claude-code-20250219,oauth-2025-04-20` set on OAuth requests (`api/anthropic-messages.ts:902`) interact with prompt caching — see **pi-prompt-assembly** `reference/cache-breakpoints.md` (the OAuth identity preamble is breakpoint #1a there). Note: in the 0.80.x AI-package re-architecture the streaming/OAuth logic moved from `packages/ai/src/providers/anthropic.ts` (now a 59-line provider shell) to `packages/ai/src/api/anthropic-messages.ts`.
- Per-provider env vars and `auth.json` keys: see `reference/built-in-providers.md`.
- Custom-provider auth (extensions registering their own OAuth flows): `pi.registerProvider` documented in `packages/coding-agent/docs/custom-provider.md`.
- The global `httpProxy` setting in `~/.pi/agent/settings.json` (0.79.5) and per-credential `env: {}` overrides both compose with the auth-resolution path — see `settings-manager.ts:133` for the setting and `http-dispatcher.ts:44-47` for `applyHttpProxySettings` (sets `process.env.HTTP_PROXY` and `HTTPS_PROXY` via `??=`, so pre-existing process-env values still win).
