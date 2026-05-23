# settings.json Schema

Full schema for `~/.pi/agent/settings.json` (user/global) and `<cwd>/.pi/settings.json` (project). Source-of-truth interface: `Settings` at `packages/coding-agent/src/core/settings-manager.ts:76-114`. All cites against pi-mono `HEAD`.

## Top-level fields

| Field | Type | Default | Source line | Notes |
|---|---|---|---|---|
| `lastChangelogVersion` | `string?` | — | `:77` | Track which changelog version the user has seen. |
| `defaultProvider` | `string?` | — | `:78` | Provider id from `KnownProvider` (see **pi-providers**). |
| `defaultModel` | `string?` | — | `:79` | Model id, e.g. `claude-sonnet-4-5`. |
| `defaultThinkingLevel` | `"off"\|"minimal"\|"low"\|"medium"\|"high"\|"xhigh"?` | — | `:80` | |
| `transport` | `"sse"\|"http"?` | `"sse"` | `:81` | SDK request transport. |
| `steeringMode` | `"all"\|"one-at-a-time"?` | — | `:82` | How queued steer messages are delivered. |
| `followUpMode` | `"all"\|"one-at-a-time"?` | — | `:83` | How queued follow-up messages are delivered. |
| `theme` | `string?` | — | `:84` | Theme name. |
| `compaction` | `CompactionSettings?` | see below | `:85` | Auto-compaction tuning. |
| `branchSummary` | `BranchSummarySettings?` | see below | `:86` | Branch-summary tuning. |
| `retry` | `RetrySettings?` | see below | `:87` | Auto-retry on transient errors. |
| `hideThinkingBlock` | `boolean?` | — | `:88` | Hide the thinking section in TUI. |
| `shellPath` | `string?` | — | `:89` | Custom shell (Cygwin etc.). |
| `quietStartup` | `boolean?` | — | `:90` | Suppress startup banner. |
| `shellCommandPrefix` | `string?` | — | `:91` | Prefix for every bash command (e.g. `shopt -s expand_aliases`). |
| `npmCommand` | `string[]?` | — | `:92` | argv-style npm command (e.g. `["mise","exec","node@20","--","npm"]`). |
| `collapseChangelog` | `boolean?` | — | `:93` | Show condensed changelog after self-update. |
| `enableInstallTelemetry` | `boolean?` | `true` | `:94` | Anonymous version-ping after self-update. |
| `packages` | `PackageSource[]?` | — | `:95` | npm/git package sources. See `reference/packages-system.md`. |
| `extensions` | `string[]?` | — | `:96` | Local extension file/dir paths. |
| `skills` | `string[]?` | — | `:97` | Local skill file/dir paths. |
| `prompts` | `string[]?` | — | `:98` | Local prompt-template file/dir paths. |
| `themes` | `string[]?` | — | `:99` | Local theme file/dir paths. |
| `enableSkillCommands` | `boolean?` | `true` | `:100` | Register skills as `/skill:name` commands. |
| `terminal` | `TerminalSettings?` | see below | `:101` | |
| `images` | `ImageSettings?` | see below | `:102` | |
| `enabledModels` | `string[]?` | — | `:103` | Model patterns for Ctrl+P cycling (same syntax as `--models`). |
| `doubleEscapeAction` | `"fork"\|"tree"\|"none"?` | `"tree"` | `:104` | |
| `treeFilterMode` | `"default"\|"no-tools"\|"user-only"\|"labeled-only"\|"all"?` | `"default"` | `:105` | Default `/tree` filter. |
| `thinkingBudgets` | `ThinkingBudgetsSettings?` | — | `:106` | Per-level token budgets. |
| `editorPaddingX` | `number?` | `0` | `:107` | |
| `autocompleteMaxVisible` | `number?` | `5` | `:108` | |
| `showHardwareCursor` | `boolean?` | — | `:109` | |
| `markdown` | `MarkdownSettings?` | see below | `:110` | |
| `warnings` | `WarningSettings?` | see below | `:111` | |
| `sessionDir` | `string?` | — | `:112` | Custom session storage dir (same as `--session-dir`). |

There is **no** top-level `enabledSkills` / `enabledPrompts` / `enabledThemes` field — only `enabledModels` for Ctrl+P cycling. Per-package filtering of contributed resources happens through the `PackageSource` object form (see below).

## Nested types

### CompactionSettings (`:8-12`)

```ts
{ enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number }
```

Defaults via getters in `SettingsManager`: `enabled` defaults to `true` (`:669`), `reserveTokens` to `16384` (`:682`), `keepRecentTokens` to `20000` (`:686`).

### BranchSummarySettings (`:14-17`)

```ts
{ reserveTokens?: number; skipPrompt?: boolean }  // default reserveTokens 16384
```

### RetrySettings (`:26-31`)

```ts
{
  enabled?: boolean;          // default: true
  maxRetries?: number;        // default: 3
  baseDelayMs?: number;       // default: 2000 (exponential: 2s, 4s, 8s)
  provider?: ProviderRetrySettings; // SDK-level overrides
}
```

`ProviderRetrySettings` (`:19-23`): `timeoutMs?`, `maxRetries?`, `maxRetryDelayMs?` (default 60000).

### TerminalSettings (`:33-38`)

```ts
{
  showImages?: boolean;             // default: true
  imageWidthCells?: number;         // default: 60
  clearOnShrink?: boolean;          // default: false
  showTerminalProgress?: boolean;   // default: false (OSC 9;4)
}
```

### ImageSettings (`:40-43`)

```ts
{ autoResize?: boolean; blockImages?: boolean }  // autoResize default true
```

### ThinkingBudgetsSettings (`:45-50`)

```ts
{ minimal?: number; low?: number; medium?: number; high?: number }
```

### MarkdownSettings (`:52-54`)

```ts
{ codeBlockIndent?: string }  // default "  "
```

### WarningSettings (`:56-58`)

```ts
{ anthropicExtraUsage?: boolean }  // default true — gates the sk-ant-oat warning, see pi-providers
```

### PackageSource (`:65-73`)

```ts
type PackageSource = string | {
  source: string;
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
};
```

String form loads all resources from the package. Object form filters which resource paths to include. See `reference/packages-system.md`.

## Project-vs-global merge

Implemented by `deepMergeSettings(base, overrides)` at `settings-manager.ts:117-145`:

1. **Project (`<cwd>/.pi/settings.json`) overrides global (`~/.pi/agent/settings.json`).** The merge walks every key of `overrides` and applies overrides over base.
2. **Nested objects merge recursively.** If both base and override have an object at the same key (e.g. `compaction`, `terminal`, `markdown`), they are spread-merged (`:135-138`). So setting only `compaction.keepRecentTokens` in project leaves the global `compaction.enabled` and `compaction.reserveTokens` intact.
3. **Primitives and arrays: project value replaces global value entirely.** No array concatenation. If both files set `packages: [...]`, the project array wins outright. Same for `extensions`, `skills`, `prompts`, `themes`, `enabledModels`.
4. **`undefined` overrides are skipped** (`:128-130`), so project-side `{ defaultProvider: undefined }` does NOT clear a global default.

Path resolution: paths in project arrays are resolved relative to `<cwd>`; paths in global arrays are resolved relative to the global agent dir (or absolute). Tilde-expansion is supported.

## Settings file locations

- **Global**: `~/.pi/agent/settings.json` — `getSettingsPath()` at `packages/coding-agent/src/config.ts:426-428`.
- **Project**: `<cwd>/.pi/settings.json` — joined from `CONFIG_DIR_NAME` (`.pi`).
- **File mode**: written `0600` for parity with `auth.json`.
- **Override env**: `PI_CODING_AGENT_DIR` redirects the global path entirely (`config.ts:380`).

## Cross-references

- The `packages` array semantics, `pi install`, and the npm `pi` field manifest: `reference/packages-system.md`.
- Discovery paths for `extensions/`, `skills/`, `prompts/`, `themes/` directories regardless of settings.json: `reference/discovery-paths.md`.
- `--no-skills`, `--no-context-files`, etc., and how they interact with these arrays: `reference/cli-flags.md`.
- The `enabledModels` field's pattern syntax: **pi-providers** `reference/built-in-providers.md`.
- `sessionDir` / `compaction` / `branchSummary` semantics on the consumer side: **pi-sessions**.
