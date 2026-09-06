# Custom Providers — `models.json` and `pi.registerProvider`

Two complementary mechanisms for adding non-built-in providers (Ollama, LM Studio, vLLM, BYOK gateways, corporate proxies):

1. **`~/.pi/agent/models.json`** — declarative override file. Pure JSON, no code. Best for static providers and BYOK proxies.
2. **`pi.registerProvider(name, config)`** from an extension — full control. Best for dynamic models, OAuth flows, or custom transports.

This file documents both. The extension-side registration mechanics (timing, the four operating modes, the OAuth contract) are documented in **pi-extensions** `reference/custom-providers.md` — that file is the deep dive on the `ProviderConfig` shape. This file is the auth/registry side.

For built-in provider env vars and the auth resolution order, see `reference/auth-resolution.md` and `reference/built-in-providers.md`.

## models.json (declarative)

User-facing doc: `packages/coding-agent/docs/models.md`. File path: `~/.pi/agent/models.json` (`getModelsPath()` at `config.ts:429-431`).

### Minimal example

For Ollama, only the model `id` is required:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

`apiKey` is required by the schema even when the server ignores it — Ollama doesn't validate, so any non-empty string works.

### Full provider entry

`ProviderConfigInput` shape at `packages/coding-agent/src/core/provider-composer.ts:46-71` (moved out of `model-registry.ts` by `9993c969`, v0.80.8; still re-exported from `model-registry.ts:16` for compatibility):

```ts
{
  name?: string;                      // display name in UI
  baseUrl?: string;                   // HTTP endpoint base
  apiKey?: string;                    // literal key, env-var name, or "!shell-cmd"
  api?: Api;                          // "anthropic-messages", "openai-completions", "openai-responses", "google-generative-ai", ...
  streamSimple?: function;            // custom transport (extension-only; cannot live in models.json)
  headers?: Record<string, string>;
  authHeader?: boolean;               // adds "Authorization: Bearer <key>"
  oauth?: ...;                        // extension-only
  models?: Array<{
    id: string;
    name?: string;
    api?: Api;                        // per-model API override
    baseUrl?: string;                 // per-model URL override (honored as of v0.72.0)
    reasoning?: boolean;
    thinkingLevelMap?: ThinkingLevelMap;  // per-model thinking-level support (added v0.72.0; replaces compat.reasoningEffortMap)
    input?: ("text" | "image")[];
    cost?: { input, output, cacheRead, cacheWrite };
    contextWindow?: number;
    maxTokens?: number;
    headers?: Record<string, string>;
    compat?: { ... };
  }>;
}
```

Fields are optional in `models.json` because pi falls back to sensible defaults for local models. For commercial endpoints (cost tracking, accurate context windows), supply explicit values.

### Per-model `baseUrl` (fixed in v0.72.0)

Before v0.72.0, `pi.registerProvider()` and `models.json` ignored per-model `baseUrl` fields, always falling back to the provider-level `baseUrl`. Fixed in `provider-composer.ts` (relocated from `model-registry.ts:886` **as of the pre-v0.80.8 tree** — that path no longer exists at the current pin; moved by `9993c969`) — `definition.baseUrl ?? providerConfig.baseUrl ?? defaults?.baseUrl` at `:142` for the `models.json` path and `definition.baseUrl ?? config.baseUrl ?? defaults?.baseUrl` at `:234` for the `pi.registerProvider()` path ([#4063](https://github.com/badlogic/pi-mono/issues/4063)). After upgrade, models with their own `baseUrl` route there as expected.

### thinking levels: `thinkingLevelMap` (added v0.72.0, replaces `reasoningEffortMap`)

v0.72.0 introduced model-level thinking-level metadata. Type at `packages/ai/src/types.ts:55`:

```ts
type ThinkingLevelMap = Partial<Record<ModelThinkingLevel, string | null>>;
```

Keys are pi thinking levels (`off | minimal | low | medium | high | xhigh`). Values are provider-specific strings (e.g. `"high"`, `"max"`) or `null` to mark the level as **unsupported** (hidden from cycling, skipped during selection). Missing keys fall back to provider defaults.

Migration from `compat.reasoningEffortMap` (removed):

```jsonc
// BEFORE (v0.71.x and earlier)
{
  "models": [{
    "id": "my-model",
    "reasoning": true,
    "compat": { "reasoningEffortMap": { "high": "high", "xhigh": "max" } }
  }]
}

// AFTER (v0.72.0+)
{
  "models": [{
    "id": "my-model",
    "reasoning": true,
    "thinkingLevelMap": { "minimal": null, "low": null, "medium": null, "high": "high", "xhigh": "max" }
  }]
}
```

The field moves from `model.compat.reasoningEffortMap` to **top-level** `model.thinkingLevelMap`. Map values keep the same provider-specific string semantics; `null` is the new way to mark a level unsupported. See `packages/ai/CHANGELOG.md` v0.72.0 for the canonical migration note and `packages/ai/src/models.ts:70-101` for the `getSupportedThinkingLevels()` and `clampThinkingLevel()` helpers that now consume this metadata.

`supportsXhigh()` was also removed in the same release. Use `getSupportedThinkingLevels(model).includes("xhigh")` or `clampThinkingLevel(model, requested)` instead.

### Compat overrides (Ollama / vLLM / SGLang)

Some OpenAI-compatible servers don't understand `developer` role messages or `reasoning_effort`. Set per-provider or per-model `compat`:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [{ "id": "gpt-oss:20b", "reasoning": true }]
    }
  }
}
```

When set at provider level, applies to all models in that provider. Per-model overrides win.

### `compat.forceAdaptiveThinking` (Anthropic-compatible endpoints)

`forceAdaptiveThinking?: boolean` (`packages/ai/src/types.ts:710`, default `false`). Anthropic-compatible providers set it to `true` for any model whose upstream **requires** the adaptive thinking format; set it to `false` to opt out on an overridden built-in model.

You rarely set this by hand for first-party Anthropic models — the catalog generator applies it automatically for adaptive-thinking families (`packages/ai/scripts/generate-models.ts`, the `isAnthropicAdaptiveThinkingModel` list). `claude-opus-5` ships with `forceAdaptiveThinking: true`, `supportsTemperature: false`, `thinkingLevelMap {xhigh, max}`. It matters when you point a custom provider at an Anthropic-compatible gateway (Xiaomi MiMo, a BYOK proxy): if the upstream expects the adaptive format and the model entry doesn't declare it, thinking requests fail or silently degrade.

Neighbouring compat flags on the same type: `allowEmptySignature` (`:712` — replay empty thinking signatures as `signature: ""` rather than converting thinking to text) and `supportsStrictTools` (`:714` — Anthropic strict tool schemas; generated Anthropic models enable it explicitly).

### Overriding built-in providers

To redirect the built-in `anthropic` provider through a corporate proxy:

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.corp.com/anthropic"
    }
  }
}
```

Just `baseUrl` — pi keeps all the built-in models and just changes the URL they hit. Same effect can be achieved at runtime via `pi.registerProvider("anthropic", { baseUrl })` (URL-override mode).

To add models alongside built-ins under a custom provider name, use a non-`KnownProvider` name (e.g. `"my-anthropic-clone"`). To replace an existing provider's models, set the same name and provide `models: [...]` — pi replaces the built-in models for that provider with the supplied list.

### Per-model overrides

Each model can override `baseUrl`, `api`, `headers`, and `compat`. Useful when one model in a provider needs different routing:

```json
{
  "providers": {
    "openrouter": {
      "models": [
        {
          "id": "anthropic/claude-sonnet-4-5",
          "baseUrl": "https://other-proxy.corp.com/openrouter",
          "headers": { "X-Custom": "value" }
        }
      ]
    }
  }
}
```

## Auth resolution for custom providers

For both `models.json` and `pi.registerProvider` registrations, the API key flows through the same resolution path as built-ins — `ModelRuntime.getAuth(providerId)` (`model-runtime.ts:470-472`) → `composeApiKeyAuth` (`provider-composer.ts:310`). (Pre-v0.80.8 this was `AuthStorage.getApiKey`, now removed.) Precedence — re-derived at v0.82.1, full table in `reference/auth-resolution.md`:

1. **Runtime override** (`--api-key`, `pi.setApiKey`)
2. **`auth.json` API-key entry** keyed by `providerId`
3. **`auth.json` OAuth entry** keyed by `providerId`
4. **Environment variable** — but custom providers are **not in `env-api-keys.ts:110-122`**, so this step returns nothing for them
5. **Custom resolver fallback** — this is where `models.json`'s `apiKey` field surfaces

Step 5 is implemented as a `fallbackResolver` callback registered by the model registry. The `apiKey` string in `models.json` is interpreted via `resolveConfigValue` (in `core/resolve-config-value.ts`), which supports the same three forms as `auth.json`:

- **Shell command** prefixed with `!` — runs the command, caches stdout for the process lifetime.
- **Env-var name** — bare uppercase identifier; pi reads `process.env[name]`.
- **Literal value** — anything else, used directly.

So `"apiKey": "OLLAMA_KEY"` in `models.json` reads from `$OLLAMA_KEY`. `"apiKey": "!op read 'op://vault/...'"` runs 1Password CLI.

## When to use which mechanism

| Scenario | Use |
|---|---|
| Ollama / LM Studio / vLLM | `models.json` |
| BYOK proxy (corporate AI gateway with stored keys) | `models.json` |
| Just changing `baseUrl` for an existing provider | `models.json` (or `pi.registerProvider` URL-override) |
| Need OAuth / `/login` flow for the new provider | Extension with `pi.registerProvider` |
| Need a custom transport (non-standard wire format) | Extension with `pi.registerProvider` + `streamSimple` |
| Models need to be computed dynamically (e.g. from a remote registry) | Extension with `pi.registerProvider` (called from a hook) |
| Auth requires per-credential model adjustment (`modifyModels`) | Extension with `pi.registerProvider` |

`pi.registerProvider` always wins on collision — extensions applied after `models.json` override the same provider.

## Worked extension examples

Two reference implementations under `packages/coding-agent/examples/extensions/`:

- **`custom-provider-anthropic/index.ts`** — full custom transport with custom API identifier, custom `streamSimple`, OAuth, and env-var key fallback.
- **`custom-provider-gitlab-duo/index.ts`** — delegating wrapper using pi-ai's `streamSimpleAnthropic` and `streamSimpleOpenAIResponses`. OAuth flow specific to GitLab.

For the registration call's full signature and timing semantics, see **pi-extensions** `reference/custom-providers.md` (do not duplicate here).

## Common gotchas

- **`models.json` `apiKey` is required even when the server ignores it.** Schema enforcement; supply any non-empty string for Ollama-style local servers.
- **Custom providers don't get auto env-var detection.** Setting `OLLAMA_API_KEY=...` in your shell does NOT auto-resolve unless you point `models.json`'s `apiKey` at it explicitly.
- **`pi.registerProvider` from a factory is queued.** Initial extension load runs the factory before the runner is bound; the call is parked and replayed. From a hook handler, it takes effect immediately. See **pi-extensions** `reference/custom-providers.md` "Timing".
- **`pi.unregisterProvider(name)`** restores any built-ins that were overridden. There's no `models.json` equivalent — to undo a `models.json` override, edit the file.
- **Compat flags propagate.** A provider-level `compat: {...}` sets the default for every model in that provider. Per-model `compat` only overrides the keys it specifies; unset keys inherit from provider level.

## Cross-references

- **`pi.registerProvider` deep dive** (the four operating modes, OAuth contract, registration timing, `ProviderConfig` field reference, worked examples): **pi-extensions** `reference/custom-providers.md`.
- Auth resolution order, `auth.json` shape, `resolveConfigValue` rules: `reference/auth-resolution.md`.
- Built-in `KnownProvider` union and env-var mapping: `reference/built-in-providers.md`.
- The user-facing `models.json` documentation: `packages/coding-agent/docs/models.md`.
- `--api-key` and `--provider` / `--model` flags: `reference/cli-flags.md`.
