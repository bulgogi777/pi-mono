---
name: pi-providers
description: >-
  Pi-mono provider/model registry and auth resolution. USE WHEN asked about ~/.pi/agent/auth.json (api_key vs
  oauth credentials, sk-ant-oat OAuth-token detection), the auth
  resolution order (--api-key → auth.json → env vars → models.json
  fallback in auth-storage.ts:getApiKey), built-in providers (anthropic,
  openai, openai-codex, google, amazon-bedrock, openrouter, deepseek,
  cloudflare-ai-gateway — full KnownProvider in packages/ai/src/types.ts),
  env-var mapping in env-api-keys.ts,
  Anthropic subscription auth and the extra-usage warning at
  interactive-mode.ts:190,
  --provider / --model / --api-key / --models, /login / /logout, fuzzy /
  glob model matching (resolveModelScope), models.json overrides, or
  pi.registerProvider. Also USE WHEN asked about provider-scoped env: {} blocks in
  auth.json (0.79.5), the global httpProxy setting (0.79.5), Claude Fable
  5 as a first-class Anthropic model (0.79.1), or Mistral session-keyed
  prompt caching (0.79.8). Also USE WHEN debugging
  out-of-credits with a Max sub or whether pi is using API key vs OAuth. Do NOT use for OAuth
  identity preamble cache (pi-prompt-assembly), hook events
  (pi-extensions), session JSONL (pi-sessions), path discovery
  (pi-architecture), or RPC protocol (pi-rpc).
---

# pi-providers

Provider registry, auth resolution, and model selection reference for pi-mono. Each `reference/*.md` is a focused deep-dive with file:line cites — read the matching one rather than reconstructing from memory.

## Reference index

- `reference/auth-resolution.md` — full resolution order with cites (`auth-storage.ts:getApiKey`), per-provider `auth.json` shape, the OAuth-vs-API-key billing distinction (Anthropic subscription vs extra usage), the third-party-app extra-usage pool, and diagnostic recipes for "out of credits" / "is pi using OAuth or API key".
- `reference/built-in-providers.md` — full table of supported providers at HEAD (id, default model, auth flavor, env var, `auth.json` key), `KnownProvider` union, fuzzy / glob matching for `--model` (`resolveModelScope` in `model-resolver.ts`), and how `--models` builds the Ctrl+P cycling list.
- `reference/custom-providers.md` — declarative `models.json` overrides (Ollama, LM Studio, vLLM, BYOK gateways) and the auth/registry side of `pi.registerProvider`. Compat flags, per-model overrides, the five-step auth resolution path for custom providers. Cross-links to **pi-extensions** `reference/custom-providers.md` for the extension authoring deep dive.
- `reference/cli-flags.md` — provider/model CLI flags (`--provider`, `--model`, `--api-key`, `--models`, `--list-models`, `--thinking`). `resolveCliModel` exact / scoped / glob / fuzzy match modes, the `:thinking-level` suffix, the Ctrl+P / `cycle_model` integration. Cross-links to pi-architecture and pi-sessions for their flag surfaces.

## Quick start when asked

- "How does pi resolve my API key?" → `reference/auth-resolution.md`. Order: runtime `--api-key` → `auth.json` (api_key with shell-command / env-var / literal expansion via `resolveConfigValue`, OR oauth with auto-refresh) → env var → `models.json` fallback. Source: `packages/coding-agent/src/core/auth-storage.ts:473-534` (`async getApiKey`).
- "Why does pi say I'm out of Anthropic credits when I have a Max sub?" → `reference/auth-resolution.md`. OAuth tokens (prefix `sk-ant-oat`, detected at `interactive-mode.ts:193-195`) bill against the **third-party-app extra-usage pool**, not your Claude plan — the warning constant `ANTHROPIC_SUBSCRIPTION_AUTH_WARNING` at `interactive-mode.ts:190-191` says exactly that (emitted via `maybeWarnAboutAnthropicSubscriptionAuth` at `:4165`). The pool depletes per token across all third-party harnesses. Switch to `ANTHROPIC_API_KEY` to bill the API account instead.
- "Is pi using OAuth or my API key?" → `auth.json` entry's `type` field (`api_key` vs `oauth`); `auth-storage.ts:24-34` (the `ApiKeyCredential` / `OAuthCredential` / `AuthCredential` types). Or check whether `ANTHROPIC_OAUTH_TOKEN` is set — it takes precedence over `ANTHROPIC_API_KEY` (`env-api-keys.ts:69-72`).
- "What's the env var for provider X?" → `reference/built-in-providers.md` table; canonical map at `packages/ai/src/env-api-keys.ts:74-110` (`getApiKeyEnvVars`).
- "How does `--model "claude-*-sonnet*"` resolve?" → `resolveModelScope` at `model-resolver.ts:258-289` uses `minimatch` (case-insensitive, matches `provider/id` or just `id`, `:280-282`). Also supports a `:thinking-level` suffix (`:265-275`).
- "How do I add a custom provider?" → `pi.registerProvider` from an extension (see **pi-extensions** for the registration *event-loop* timing; see `docs/custom-provider.md` for the option shape). For non-coding overrides, `~/.pi/agent/models.json` (see `docs/models.md`).
- "How do I set provider-specific env vars without polluting my shell?" → 0.79.5 added a per-credential `env: { ... }` block on `ApiKeyCredential` (`auth-storage.ts:24-28`). Use it to scope Cloudflare account/gateway IDs, Vertex project/location, Bedrock settings, `PI_CACHE_RETENTION`, or `HTTP_PROXY`/`HTTPS_PROXY` to one provider's resolution path. `resolveConfigValue` reads `cred.env` before `process.env` (`auth-storage.ts:483`). See `reference/auth-resolution.md` and `docs/providers.md`.
- "How do I set an HTTP proxy for all of pi?" → 0.79.5 added a global `httpProxy` setting in `~/.pi/agent/settings.json` (`settings-manager.ts:120`). Applied as both `HTTP_PROXY` and `HTTPS_PROXY` to all pi-managed HTTP clients via `applyHttpProxySettings` (`http-dispatcher.ts:42-45`). Process-env values still win if pre-set; the setting fills in via `??=`.
- "What's the default Anthropic model now?" → `claude-opus-4-8`, set in `defaultModelPerProvider` at `model-resolver.ts:17` (since 0.77.0). Claude Fable 5 was added as a first-class Anthropic model in 0.79.1 (`models.generated.ts:1873-1880` for `claude-fable-5` on `anthropic`, plus Bedrock regional variants at `:353, :493, :1385`). The default did not change to Fable 5.
- "Does Mistral support pi's prompt cache?" → Yes since 0.79.8. Mistral sessions use provider-side caching keyed by pi's session ID as `promptCacheKey` (`providers/mistral.ts:267-280`).

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
