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
  interactive-mode.ts:166,
  --provider / --model / --api-key / --models, /login / /logout, fuzzy /
  glob model matching (resolveModelScope), models.json overrides, or
  pi.registerProvider. Also USE WHEN debugging
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

- "How does pi resolve my API key?" → `reference/auth-resolution.md`. Order: runtime `--api-key` → `auth.json` (api_key with shell-command / env-var / literal expansion via `resolveConfigValue`, OR oauth with auto-refresh) → env var → `models.json` fallback. Source: `packages/coding-agent/src/core/auth-storage.ts:455-514`.
- "Why does pi say I'm out of Anthropic credits when I have a Max sub?" → `reference/auth-resolution.md`. OAuth tokens (prefix `sk-ant-oat`, detected at `interactive-mode.ts:170-172`) bill against the **third-party-app extra-usage pool**, not your Claude plan — the warning at `interactive-mode.ts:166-167` says exactly that. The pool depletes per token across all third-party harnesses. Switch to `ANTHROPIC_API_KEY` to bill the API account instead.
- "Is pi using OAuth or my API key?" → `auth.json` entry's `type` field (`api_key` vs `oauth`); `auth-storage.ts:23-32`. Or check whether `ANTHROPIC_OAUTH_TOKEN` is set — it takes precedence over `ANTHROPIC_API_KEY` (`env-api-keys.ts:97-100`).
- "What's the env var for provider X?" → `reference/built-in-providers.md` table; canonical map at `packages/ai/src/env-api-keys.ts:101-130`.
- "How does `--model "claude-*-sonnet*"` resolve?" → `resolveModelScope` at `model-resolver.ts:250-280` uses `minimatch` (case-insensitive, matches `provider/id` or just `id`). Also supports a `:thinking-level` suffix.
- "How do I add a custom provider?" → `pi.registerProvider` from an extension (see **pi-extensions** for the registration *event-loop* timing; see `docs/custom-provider.md` for the option shape). For non-coding overrides, `~/.pi/agent/models.json` (see `docs/models.md`).

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
