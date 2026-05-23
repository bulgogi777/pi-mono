# Built-in Providers

Full table of providers pi knows about at HEAD, plus model-selection mechanics. All cites against pi-mono `HEAD` on the date this file was written.

## The `KnownProvider` union (28 providers)

Defined at `packages/ai/src/types.ts:18-46` as a string-literal union of provider IDs. The current set:

```
amazon-bedrock, anthropic, google, google-vertex, openai, azure-openai-responses,
openai-codex, deepseek, github-copilot, xai, groq, cerebras, openrouter,
vercel-ai-gateway, zai, mistral, minimax, minimax-cn, moonshotai, moonshotai-cn,
huggingface, fireworks, opencode, opencode-go, kimi-coding, cloudflare-workers-ai,
cloudflare-ai-gateway, xiaomi
```

`xiaomi` was added in **v0.72.0** (Xiaomi MiMo Token Plan, Anthropic-compatible).


`Provider` itself (`types.ts:46`) widens this to `KnownProvider | string` so extensions can register custom IDs (see `pi.registerProvider`).

## Per-provider auth and env vars

The single source of truth for env-var → provider mapping is `packages/ai/src/env-api-keys.ts:97-130`. The `auth.json` keys mirror the `KnownProvider` IDs verbatim (one entry per provider). Documentation table at `packages/coding-agent/docs/providers.md:48-72`.

| Provider ID (`auth.json` key) | Auth flavor | Primary env var(s) | Default model (HEAD) | Notes |
|---|---|---|---|---|
| `anthropic` | OAuth or API key | `ANTHROPIC_OAUTH_TOKEN` (precedence) → `ANTHROPIC_API_KEY` | `claude-opus-4-7` | OAuth = subscription/extra-usage billing — see `reference/auth-resolution.md`. |
| `openai` | API key | `OPENAI_API_KEY` | `gpt-5.4` | |
| `openai-codex` | OAuth | `/login` only (ChatGPT Plus/Pro) | `gpt-5.5` | Officially endorsed; see [Codex for OSS](https://developers.openai.com/community/codex-for-oss). |
| `azure-openai-responses` | API key + URL | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL` or `AZURE_OPENAI_RESOURCE_NAME` | `gpt-5.4` | Optional `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`. |
| `amazon-bedrock` | AWS profile / IAM / bearer | `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` or `AWS_BEARER_TOKEN_BEDROCK`; `AWS_REGION` (default `us-east-1`) | `us.anthropic.claude-opus-4-6-v1` | Also supports ECS task roles, IRSA, proxy via `AWS_ENDPOINT_URL_BEDROCK_RUNTIME`. Cache via `AWS_BEDROCK_FORCE_CACHE=1` for application inference profiles. |
| `google` | API key | `GEMINI_API_KEY` | `gemini-3.1-pro-preview` | |
| `google-vertex` | API key OR ADC | `GOOGLE_CLOUD_API_KEY` or `gcloud auth application-default login` | `gemini-3.1-pro-preview` | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, optional `GOOGLE_APPLICATION_CREDENTIALS`. |
| `github-copilot` | OAuth | `/login` (github.com or GHES) | `gpt-5.4` | "model not supported" → enable in VS Code Copilot Chat first. |
| `deepseek` | API key | `DEEPSEEK_API_KEY` | `deepseek-v4-pro` | |
| `xai` | API key | `XAI_API_KEY` | `grok-4.20-0309-reasoning` | |
| `groq` | API key | `GROQ_API_KEY` | `openai/gpt-oss-120b` | |
| `cerebras` | API key | `CEREBRAS_API_KEY` | `zai-glm-4.7` | |
| `openrouter` | API key | `OPENROUTER_API_KEY` | `moonshotai/kimi-k2.6` | |
| `vercel-ai-gateway` | API key | `AI_GATEWAY_API_KEY` | `zai/glm-5.1` | |
| `zai` | API key | `ZAI_API_KEY` | `glm-5.1` | |
| `mistral` | API key | `MISTRAL_API_KEY` | `devstral-medium-latest` | |
| `minimax` | API key | `MINIMAX_API_KEY` | `MiniMax-M2.7` | |
| `minimax-cn` | API key | `MINIMAX_CN_API_KEY` | `MiniMax-M2.7` | China endpoint variant. |
| `moonshotai` | API key | `MOONSHOT_API_KEY` | `kimi-k2.6` | |
| `moonshotai-cn` | API key | `MOONSHOT_API_KEY` | `kimi-k2.6` | China endpoint variant. |
| `huggingface` | API key | `HF_TOKEN` | `moonshotai/Kimi-K2.6` | |
| `fireworks` | API key | `FIREWORKS_API_KEY` | `accounts/fireworks/models/kimi-k2p6` | |
| `opencode` | API key | `OPENCODE_API_KEY` | `kimi-k2.6` | OpenCode Zen. |
| `opencode-go` | API key | `OPENCODE_API_KEY` | `kimi-k2.6` | OpenCode Go. |
| `kimi-coding` | API key | `KIMI_API_KEY` | `kimi-for-coding` | |
| `cloudflare-workers-ai` | API key + account | `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` | `@cf/moonshotai/kimi-k2.6` | Auto-sets `x-session-affinity` for prefix-cache discounts. |
| `cloudflare-ai-gateway` | API key + account + gateway | `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_GATEWAY_ID` | `workers-ai/@cf/moonshotai/kimi-k2.6` | Routes to OpenAI / Anthropic / Workers AI through one gateway. Auth modes: Workers-AI native, unified billing, stored BYOK, inline BYOK (`docs/providers.md:152-178`). |
| `xiaomi` | API key | `XIAOMI_API_KEY` | `mimo-v2.5-pro` | **Added v0.72.0.** Xiaomi MiMo Token Plan (Anthropic-compatible endpoint). `/login` display name `"Xiaomi MiMo Token Plan"` (`provider-display-names.ts:27`). User-facing doc: `docs/providers.md:72-91`. |

Default-model map source: `packages/coding-agent/src/core/model-resolver.ts:14-42` (`defaultModelPerProvider`).

A few extras visible in env-api-keys.ts but **not in the `KnownProvider` union** because they're test/auxiliary:

- `ollama` — no API key required by default; treated as a custom-provider via `models.json`. See `docs/models.md`.
- LM Studio, vLLM, any other OpenAI-compatible local server — add via `models.json` or extension.

## Removed providers

- `google-gemini-cli` — removed in **0.71.0**.
- `google-antigravity` — removed in **0.71.0**.

(Confirm against `packages/ai/CHANGELOG.md` and `packages/coding-agent/CHANGELOG.md` if exact PR / commit needed.)

## Model selection — `--model` and `--models`

### `--model <pattern>` — single-target, glob-aware

Resolved by `resolveCliModel` (`packages/coding-agent/src/core/model-resolver.ts:332-…`) which delegates to `resolveModelScope` for glob patterns (`:250-308`). Behavior:

- **Exact match**: `--model claude-sonnet-4-5` or `--model anthropic/claude-sonnet-4-5`. Match goes through `findExactModelReferenceMatch` (`:68-…`).
- **Provider-scoped**: `--model anthropic/claude-sonnet-4-5` filters to that provider only.
- **Glob**: any pattern containing `*` / `?` / `[…]` triggers `minimatch`-based matching (`:259-275`):
  - Case-insensitive.
  - Pattern is matched against both the bare model `id` AND the `provider/id` form (`:274`).
  - Example: `--model "claude-*-sonnet-*"` resolves any matching Anthropic Sonnet variant.
- **Thinking-level suffix**: append `:high` (or any `ThinkingLevel` from `packages/ai/src/types.ts`) to lock thinking. `model-resolver.ts:266` strips the suffix before glob-matching, then re-applies it.

### `--models <pattern,...>` — Ctrl+P cycle list

Comma-separated list of patterns. Same glob semantics per pattern. Resolved by `resolveModelScope` at `model-resolver.ts:250-308` returning `ScopedModel[]` (`:44-47`). Stored on the session for cycling via `cycle_model` (RPC) or Ctrl+P (TUI).

### `--api-key`

Single value, applies to whatever provider is in scope. Stored as runtime override at top priority (`auth-storage.ts:457-460`).

### `--provider`

Forces the provider; combined with `--model` to override the default. The provider must be in `KnownProvider` OR have a `models.json` entry OR be registered by an extension (`pi.registerProvider`).

## Interactive flows

- `/login` — provider picker, OAuth or API-key input. Writes to `auth.json` with `0600` perms.
- `/logout` — clears the chosen provider's `auth.json` entry.
- `/model` — interactive model picker (filtered by what `auth.json` + env have credentials for).
- Ctrl+P — cycles through `--models` list (or all configured models if `--models` not set).

## `enabledModels` settings filter

`~/.pi/agent/settings.json` and `<cwd>/.pi/settings.json` can carry an `enabledModels` array that further filters what `/model` and Ctrl+P show. Merged at the settings layer; shape in `core/settings-manager.ts`. See **pi-architecture** for the settings.json schema.

## Cross-references

- Auth resolution and OAuth-vs-API-key billing: `reference/auth-resolution.md`.
- Custom providers (Ollama, LM Studio, vLLM, BYOK gateways via `models.json` or `pi.registerProvider`): `reference/custom-providers.md` (TBW). Until then: `packages/coding-agent/docs/custom-provider.md` (640 lines), `docs/models.md`.
- The OAuth identity preamble that fires for `anthropic` OAuth tokens (and consumes a cache breakpoint) is documented in **pi-prompt-assembly** `reference/cache-breakpoints.md`.
