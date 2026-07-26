# Custom Providers — `pi.registerProvider`

How extensions add (or override) LLM providers. This file is about the **extension-side registration contract**. For auth resolution semantics, env-var mapping, OAuth-vs-API-key billing, the `sk-ant-oat` Anthropic detection, and the third-party-app extra-usage pool, see **pi-providers** (`reference/auth-resolution.md` and `reference/built-in-providers.md`).

All cites against `packages/coding-agent/src/core/extensions/types.ts` at pi-mono `HEAD`.

## Signature

```ts
pi.registerProvider(name: string, config: ProviderConfig): void;
pi.unregisterProvider(name: string): void;
```

`registerProvider` at `types.ts:1269-1306` (with three full inline examples in the JSDoc above the signature). `unregisterProvider` at `types.ts:1308-1320`.

## ProviderConfig — three operating modes

The shape is `ProviderConfig` at `types.ts:1332-1371`. Which fields you set determines the behavior:

| Mode | Fields set | What happens |
|---|---|---|
| **Replace all models** | `models` (with `baseUrl`, `apiKey`, `api`, etc.) | All existing models for `name` are removed; the supplied `models[]` replaces them. |
| **URL override only** | `baseUrl` only (no `models`) | Existing models for `name` keep their definitions but their requests route to the new URL. Useful for proxies. |
| **OAuth registration** | `oauth` block | Plugs into the `/login` UI. Combine with `models` for a full custom provider, or `baseUrl` to add OAuth to a built-in. |
| **Custom transport** | `streamSimple` | Bypasses pi-ai's built-in providers entirely; the extension ships its own `(model, context, options) => AssistantMessageEventStream` implementation. |

Field reference (`types.ts:1332-1371`):

| Field | Type | Required when | Notes |
|---|---|---|---|
| `name` | `string?` | Always optional | Display name in UI. Defaults to the registration `name`. |
| `baseUrl` | `string?` | Defining models | The HTTP endpoint base. |
| `apiKey` | `string?` | Defining models (unless `oauth`) | Either a literal key or an env-var name. Resolved via the same path as `auth.json` `key` fields — see **pi-providers**. |
| `api` | `Api?` | Defining models | Which built-in API implementation to use. Common: `"anthropic-messages"`, `"openai-completions"`, `"openai-responses"`, `"google-generative-ai"`. |
| `streamSimple` | function | When you need a fully custom transport | `(model, context, options?) => AssistantMessageEventStream`. |
| `headers` | `Record<string, string>?` | Optional | Extra request headers. |
| `authHeader` | `boolean?` | Optional | When `true`, adds `Authorization: Bearer <resolved-key>`. |
| `models` | `ProviderModelConfig[]?` | Optional | If set, replaces all models for the provider. |
| `oauth` | `{ name, login, refreshToken, getApiKey, modifyModels? }` | Optional | Plugs into `/login`. See OAuth subsection below. |

The model-entry type (formerly `ProviderModelConfig`; that named type no longer exists — it is now the inline element type of `ProviderConfigInput["models"]` at `packages/coding-agent/src/core/provider-composer.ts:53-67`, per `9993c969`/v0.80.8) carries `id`, `name`, optional `api` override, `baseUrl` (per-model override; **honored as of v0.72.0** — now `provider-composer.ts:136` for `models.json` and `:218` for `registerProvider`), `reasoning`, `thinkingLevelMap` (added v0.72.0; replaces removed `compat.reasoningEffortMap`), `input` modalities, `cost`, `contextWindow`, `maxTokens`, etc. — same shape as built-in model definitions. For the migration from `reasoningEffortMap`, see **pi-providers** `reference/custom-providers.md`.

## OAuth provider contract

When `config.oauth` is set, pi adds the provider to the `/login` flow. Contract (`types.ts:1355-1368`):

```ts
oauth?: {
  name: string;                                                    // /login UI label
  login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>; // run the flow
  refreshToken(credentials): Promise<OAuthCredentials>;            // refresh on expiry
  getApiKey(credentials): string;                                  // credentials → bearer
  modifyModels?(models, credentials): Model<Api>[];                // optional: tweak models per-credential
};
```

`OAuthLoginCallbacks` exposes the host UI hooks the login flow needs (browser open, code entry, etc.). Credentials are persisted to `~/.pi/agent/auth.json` under `{ "<name>": { "type": "oauth", ...credentials } }` — see **pi-providers** `reference/auth-resolution.md` for the storage format.

The `id` field on `oauth` is set automatically from the registration `name`.

## Timing — when registration takes effect

JSDoc at `types.ts:1262-1266`:

> During initial extension load this call is **queued** and applied once the runner has bound its context. After that it takes effect immediately, so it is safe to call from command handlers or event callbacks without requiring a `/reload`.

Concretely: a `registerProvider` call from the factory function runs before the runner exists, so it's parked in `pendingProviderRegistrations` (`types.ts:1463`) and replayed during runner binding. A `registerProvider` call from inside a hook handler or command handler executes immediately against the live registry.

## Worked examples

Two reference implementations live in `packages/coding-agent/examples/extensions/`:

### `custom-provider-anthropic/` — full custom transport

`examples/extensions/custom-provider-anthropic/index.ts`. Demonstrates:

- Custom API identifier (`"custom-anthropic-api"`)
- Custom `streamSimple` implementation (calls Anthropic SDK directly, translates events)
- OAuth support via the `oauth` block
- API key support via env var (`CUSTOM_ANTHROPIC_API_KEY`)
- Two model definitions

This is the right starting point if you're talking to a non-standard endpoint and need full control over the request/response cycle.

### `custom-provider-gitlab-duo/` — delegating wrapper

`examples/extensions/custom-provider-gitlab-duo/index.ts`. Demonstrates:

- Two model families (Claude and GPT) under one provider
- **Delegation** to pi-ai's built-in `streamSimpleAnthropic` and `streamSimpleOpenAIResponses` rather than rolling a custom transport
- OAuth flow specific to GitLab (PAT or `glpat-...` token)
- `modifyModels` to adjust per-credential

This is the right starting point if your provider speaks a standard wire protocol but with non-standard auth or routing.

## Auth resolution touchpoints

Once registered, pi resolves the API key for the custom provider via the same five-step order documented in **pi-providers** `reference/auth-resolution.md`:

1. Runtime override (`--api-key`, `pi.setApiKey`)
2. `auth.json` `api_key` entry
3. `auth.json` `oauth` entry (with auto-refresh)
4. Environment variable (resolved via `env-api-keys.ts:108-120` — but custom providers aren't in that map; they fall through to step 5)
5. **Custom resolver** — `models.json` provider keys, plus the `apiKey` field from `ProviderConfig`

The fifth step is how `apiKey: "MY_VAR"` in `ProviderConfig` actually wires up: `resolveConfigValue` (in `core/resolve-config-value.ts`) interprets the string as either `!shell-command`, an env-var name, or a literal — same rules as `auth.json`.

## When to use `pi.registerProvider` vs `models.json`

- **Extension** (`pi.registerProvider`): when you need OAuth, custom transport, dynamic model lists, or behavior that can't be expressed declaratively.
- **`models.json` overrides** (no extension required): when you just need to add static models or override `baseUrl` for an existing provider. See `packages/coding-agent/docs/models.md`.

The two mechanisms cooperate — `pi.registerProvider` applied later wins over `models.json`.

## Cross-references

- Auth resolution order, `auth.json` shape, OAuth-vs-API-key billing: **pi-providers** `reference/auth-resolution.md`.
- Built-in `KnownProvider` union, env-var mapping, default models: **pi-providers** `reference/built-in-providers.md`.
- The `streamSimple*` helpers re-exported from `@mariozechner/pi-ai`: see `packages/ai/src/providers/`.
- `ExtensionAPI.registerProvider` overview and other register methods: `reference/extension-api.md`.
