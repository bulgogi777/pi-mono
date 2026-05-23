# Provider/Model CLI Flags

CLI flags for selecting providers, models, and credentials. All cites against pi-mono `HEAD`. Parser: `parseArgs` at `packages/coding-agent/src/cli/args.ts`. Resolver: `resolveCliModel` at `packages/coding-agent/src/core/model-resolver.ts:332-…`.

This file covers **provider/model flags only**. For session flags (`--continue`, `--resume`, `--fork`, `--session*`, `--no-session`) see **pi-sessions** `reference/cli-flags.md`. For resource flags (`--skill`, `--prompt-template`, `--system-prompt`, `--no-context-files`, etc.) see **pi-architecture** `reference/cli-flags.md`.

## Quick reference

| Flag | Short | Args | Lines | Effect |
|---|---|---|---|---|
| `--provider <id>` | — | required | `args.ts:83-84` | Force provider id (e.g. `anthropic`, `openai`, `openrouter`). Must be a `KnownProvider` (`packages/ai/src/types.ts:18-44`), in `models.json`, or registered by an extension. |
| `--model <pattern>` | — | required | `args.ts:85-86` | Model id, `provider/id`, or glob/fuzzy pattern. Optional `:thinking-level` suffix. |
| `--api-key <value>` | — | required | `args.ts:87-88` | Runtime override for the resolved provider's key. Highest priority (priority 1 in `auth-storage.ts:getApiKey` at `:455-514`). |
| `--models <patterns>` | — | required | `args.ts:102-103` | Comma-separated patterns for the Ctrl+P cycling list and `cycle_model` RPC command. |
| `--list-models [search]` | — | optional | `args.ts:149-156` | List available models with optional fuzzy search; exits without starting a session. |
| `--thinking <level>` | — | required | `args.ts:106-107` | Set thinking level: `off` / `minimal` / `low` / `medium` / `high` / `xhigh`. Clamped to model capabilities. |

## `--model <pattern>` — exact, scoped, glob, fuzzy

Resolved by `resolveCliModel` (`model-resolver.ts:332-…`) which delegates to `resolveModelScope` for glob-style patterns (`:250-308`).

### Match modes

1. **Exact match** — `--model claude-sonnet-4-5`. Goes through `findExactModelReferenceMatch` (`model-resolver.ts:68-…`), which scans the registry for an `id`-or-`provider/id` exact hit.
2. **Provider-scoped** — `--model anthropic/claude-sonnet-4-5`. Filters to the named provider before matching. Required when a model id appears in multiple providers (e.g. `gpt-4o` available via both `openai` and `openrouter`).
3. **Glob** — any pattern containing `*`, `?`, or `[…]` triggers `minimatch`-based matching at `model-resolver.ts:259-275`:
   - **Case-insensitive** (`:274` passes `nocase: true`).
   - Pattern matched against **both** the bare `id` and the `provider/id` form (`:274`).
   - Example: `--model "claude-*-sonnet-*"` matches any Anthropic Sonnet variant.
   - Example: `--model "anthropic/*"` matches every Anthropic model.
4. **Fuzzy** — pi falls back to fuzzy matching when no exact or glob match found. Useful for typos.

### Thinking-level suffix

Append `:<level>` to lock thinking level: `--model claude-opus-4-5:high`. The resolver strips the suffix before glob-matching (`model-resolver.ts:266`), then re-applies it. Levels: `minimal | low | medium | high | xhigh` (the `off` level is implicit when the field is omitted entirely).

### Provider-scoped in glob

`--model "anthropic/*-haiku-*"` works — minimatch pattern includes the provider scope, and the matcher tries both `id` and `provider/id` forms.

## `--models <patterns>` — Ctrl+P cycle list

Comma-separated list of patterns. Same glob and fuzzy semantics as `--model` per pattern. Resolved by `resolveModelScope` at `model-resolver.ts:250-308`, returning `ScopedModel[]` (`:44-47`):

```ts
{ model: Model<Api>; thinkingLevel?: ThinkingLevel }
```

The list is stored on the session and used by:

- **TUI**: Ctrl+P cycles through the list.
- **RPC**: `cycle_model` command (`packages/coding-agent/src/modes/rpc/rpc-types.ts:33`).
- **Settings file**: persisted so subsequent runs preserve the cycling list.

Examples:

- `--models "anthropic/claude-sonnet-4-5,openai/gpt-4o"` — two specific models.
- `--models "anthropic/*,openrouter/anthropic/*"` — all Anthropic-family models from two providers.
- `--models "*sonnet*"` — any model with "sonnet" in the id, across all providers.

The same syntax works in `~/.pi/agent/settings.json`'s `enabledModels` field — see **pi-architecture** `reference/settings-json-schema.md`.

## `--api-key <value>` — runtime override

Sets the runtime override at the highest priority in the resolution chain (`auth-storage.ts:457-460`). Overrides `auth.json` and env vars for the chosen provider.

Process-lifetime only — not persisted. To store a key, use `/login` interactively or edit `auth.json` directly (see `reference/auth-resolution.md` for the file format).

## `--provider <id>` — force provider

When supplied alongside `--model`, scopes resolution to the named provider. Useful when the same model id exists in multiple providers (`gpt-4o` in `openai` and `openrouter`, `claude-*` in `anthropic` and `amazon-bedrock`).

When supplied **without** `--model`, pi uses `defaultModelPerProvider[provider]` (`model-resolver.ts:14-42`) as the model.

The provider id must resolve. Recognized sources:

- The `KnownProvider` union (`packages/ai/src/types.ts:18-44`) — 27 built-ins.
- A `models.json` entry adding a custom provider (e.g. `ollama`, `lm-studio`).
- An extension's `pi.registerProvider(name, ...)` call.

If the id matches none, pi exits with an error.

## `--list-models [search]` — discovery

`--list-models` alone lists every model the registry knows about. With a search string, filters via fuzzy match: `--list-models sonnet` shows every model with "sonnet" in id or display name.

Exits without starting a session. Useful for scripting (`pi --list-models gpt-5 | head -3`) or for finding the right `provider/id` for `--model`.

## Interaction with auth resolution

Once provider and model are selected, pi calls `AuthStorage.getApiKey(providerId)` to fetch a credential. Order (`auth-storage.ts:455-514`):

1. Runtime override from `--api-key` (`:457-460`)
2. `auth.json` `api_key` entry (`:464-466`)
3. `auth.json` `oauth` entry (`:468-505`, with auto-refresh)
4. Env var (`:507-509`, mapped via `env-api-keys.ts:101-130`)
5. `models.json` custom resolver (`:511-514`)

If all five fail, pi reports "no API key configured for provider X" and refuses to start (or skips that provider during `--list-models` enumeration).

Special case: `anthropic` provider checks `ANTHROPIC_OAUTH_TOKEN` **before** `ANTHROPIC_API_KEY` (`env-api-keys.ts:97-100`). See `reference/auth-resolution.md` for the OAuth-vs-API-key billing implications.

## Common gotchas

- **`--model` glob is case-insensitive.** `--model "CLAUDE-*"` matches lowercase ids. Pi normalizes both sides during minimatch.
- **`--provider` alone uses the default model.** Without `--model`, pi takes `defaultModelPerProvider[provider]` from `model-resolver.ts:14-42`. These IDs are pinned per pi release.
- **`--api-key` doesn't persist.** Set the env var or use `/login` for cross-session persistence.
- **`--models` patterns that match nothing fail loudly.** Pi rejects empty resolution to avoid silent misconfiguration.
- **Anthropic OAuth detection happens during `getApiKey`, not flag parsing.** If you pass `--api-key sk-ant-oat...`, pi WILL detect the OAuth flow at request time (`anthropic.ts:761-763`), use Bearer auth, and emit the Claude Code identity preamble. The flag itself is just a string passthrough.
- **`models.json` custom providers don't auto-discover env vars.** Without a matching entry in `env-api-keys.ts`, step 4 is skipped — set `apiKey` in `models.json` to point at an env var explicitly. See `reference/custom-providers.md`.

## Cross-references

- Auth resolution order, `auth.json` schema, OAuth detection, and the third-party-app extra-usage pool: `reference/auth-resolution.md`.
- Full table of built-in providers (id, default model, env var, auth flavor): `reference/built-in-providers.md`.
- Adding non-built-in providers: `reference/custom-providers.md`.
- Resource flags (`--skill`, `--prompt-template`, etc.): **pi-architecture** `reference/cli-flags.md`.
- Session flags (`--continue`, `--resume`, etc.): **pi-sessions** `reference/cli-flags.md`.
- The `--mode` flag and pi's runtime modes: **pi-rpc** `reference/protocol.md`.
