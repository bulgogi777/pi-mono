---
name: add-llm-provider
description: Checklist for adding a new LLM provider to packages/ai. Covers core types, provider implementation, lazy registration, model generation, the full test matrix, coding-agent wiring, and docs.
---

# Adding a New LLM Provider (packages/ai)

A new provider touches multiple files. Work through these steps in order.

## 1. Core Types (`packages/ai/src/types.ts`)

- Add API identifier to `Api` type union (e.g. `"bedrock-converse-stream"`).
- Create options interface extending `StreamOptions`.
- Add mapping to `ApiOptionsMap`.
- Add provider name to `KnownProvider` type union.

## 2. Provider Implementation (`packages/ai/src/providers/`)

Create a provider file exporting:

- `stream<Provider>()` returning `AssistantMessageEventStream`.
- `streamSimple<Provider>()` for `SimpleStreamOptions` mapping.
- Provider-specific options interface.
- Message/tool conversion functions.
- Response parsing that emits standardized events (`text`, `tool_call`, `thinking`, `usage`, `stop`).

## 3. Provider Exports and Lazy Registration

- Add a package subpath export in `packages/ai/package.json` pointing at `./dist/providers/<provider>.js`.
- Add `export type` re-exports in `packages/ai/src/index.ts` for provider option types that should remain available from the root entry.
- Register the provider in `packages/ai/src/providers/all.ts` — add the `import { <x>Provider } from "./<x>.ts"` and return it from `builtinProviders()`; `builtinModels()` (`all.ts:131-137`) loops those into the collection. **`register-builtins.ts` no longer exists**, and the "do not statically import" rule has inverted: `all.ts` *does* statically import every provider module. Laziness moved down a layer — the provider module imports its heavy API implementation from the `.lazy.ts` wrapper instead (e.g. `providers/anthropic.ts:1` → `../api/anthropic-messages.lazy.ts`). Keep the heavy streaming impl behind that wrapper.
- Add credential detection in `packages/ai/src/env-api-keys.ts`.

## 4. Model Generation (`packages/ai/scripts/generate-models.ts`)

- Add logic to fetch/parse models from the provider source.
- Map to the standardized `Model` interface.

## 5. Tests (`packages/ai/test/`)

- Always add the provider to `stream.test.ts` with at least one representative model, even if it reuses an existing API impl such as `openai-completions`.
- Add the provider to the broader matrix where applicable: `tokens.test.ts`, `abort.test.ts`, `empty.test.ts`, `context-overflow.test.ts`, `unicode-surrogate.test.ts`, `tool-call-without-result.test.ts`, `image-tool-result.test.ts`, `total-tokens.test.ts`, `cross-provider-handoff.test.ts`.
- For `cross-provider-handoff.test.ts`, add at least one provider/model pair. If the provider exposes multiple model families (e.g. GPT and Claude), add at least one pair per family.
- For non-standard auth, create a utility (e.g. `bedrock-utils.ts`) with credential detection.

## 6. Coding Agent (`packages/coding-agent/`)

- `src/core/model-resolver.ts`: add default model ID to `defaultModelPerProvider`.
- ~~`src/core/provider-display-names.ts`~~ — **file removed** by `9993c969` (v0.80.8). The `/login` display name now comes from the provider definition's own `name` field in `packages/ai/src/providers/<provider>.ts` (e.g. `xiaomi.ts:9`), surfaced via `ModelRegistry.getProviderName()` (`model-registry.ts:99-101`). Set `name` when you create the provider; nothing separate to register.
- `src/cli/args.ts`: add env var documentation.
- `README.md`: add provider setup instructions.
- `docs/providers.md`: add setup instructions, env var, and `auth.json` key.

## 7. Documentation

- `packages/ai/README.md`: add to providers table, document options/auth, add env vars.
- `packages/ai/CHANGELOG.md`: add entry under `## [Unreleased]`.
