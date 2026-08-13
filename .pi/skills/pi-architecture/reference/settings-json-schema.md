# settings.json Schema

Full schema for `~/.pi/agent/settings.json` (user/global) and `<cwd>/.pi/settings.json` (project). Source-of-truth interface: `Settings` at `packages/coding-agent/src/core/settings-manager.ts:89-137`. All cites against pi-mono at the current pin (`v0.84.1`, `53fa77cc`).

## Top-level fields

| Field | Type | Default | Source line | Notes |
|---|---|---|---|---|
| `lastChangelogVersion` | `string?` | — | `:83` | Track which changelog version the user has seen. |
| `defaultProvider` | `string?` | — | `:84` | Provider id from `KnownProvider` (see **pi-providers**). |
| `defaultModel` | `string?` | — | `:85` | Model id, e.g. `claude-sonnet-4-5`. |
| `defaultThinkingLevel` | `"off"\|"minimal"\|"low"\|"medium"\|"high"\|"xhigh"?` | — | `:86` | |
| `transport` | `"sse"\|"http"?` | `"sse"` | `:87` | SDK request transport. |
| `steeringMode` | `"all"\|"one-at-a-time"?` | — | `:88` | How queued steer messages are delivered. |
| `followUpMode` | `"all"\|"one-at-a-time"?` | — | `:89` | How queued follow-up messages are delivered. |
| `theme` | `string?` | — | `:90` | Theme name. |
| `compaction` | `CompactionSettings?` | see below | `:91` | Auto-compaction tuning. |
| `branchSummary` | `BranchSummarySettings?` | see below | `:92` | Branch-summary tuning. |
| `retry` | `RetrySettings?` | see below | `:93` | Auto-retry on transient errors. |
| `hideThinkingBlock` | `boolean?` | — | `:94` | Hide the thinking section in TUI. |
| `shellPath` | `string?` | — | `:95` | Custom shell (Cygwin etc.). |
| `quietStartup` | `boolean?` | — | `:96` | Suppress startup banner. |
| `shellCommandPrefix` | `string?` | — | `:97` | Prefix for every bash command (e.g. `shopt -s expand_aliases`). |
| `npmCommand` | `string[]?` | — | `:98` | argv-style npm command (e.g. `["mise","exec","node@20","--","npm"]`). |
| `collapseChangelog` | `boolean?` | — | `:99` | Show condensed changelog after self-update. |
| `enableInstallTelemetry` | `boolean?` | `true` | `:100` | Anonymous version-ping after self-update. |
| `packages` | `PackageSource[]?` | — | `:101` | npm/git package sources. See `reference/packages-system.md`. |
| `extensions` | `string[]?` | — | `:102` | Local extension file/dir paths. |
| `skills` | `string[]?` | — | `:103` | Local skill file/dir paths. |
| `prompts` | `string[]?` | — | `:104` | Local prompt-template file/dir paths. |
| `themes` | `string[]?` | — | `:105` | Local theme file/dir paths. |
| `enableSkillCommands` | `boolean?` | `true` | `:106` | Register skills as `/skill:name` commands. |
| `terminal` | `TerminalSettings?` | see below | `:107` | |
| `images` | `ImageSettings?` | see below | `:108` | |
| `enabledModels` | `string[]?` | — | `:109` | Model patterns for Ctrl+P cycling (same syntax as `--models`). |
| `doubleEscapeAction` | `"fork"\|"tree"\|"none"?` | `"tree"` | `:110` | |
| `treeFilterMode` | `"default"\|"no-tools"\|"user-only"\|"labeled-only"\|"all"?` | `"default"` | `:111` | Default `/tree` filter. |
| `thinkingBudgets` | `ThinkingBudgetsSettings?` | — | `:112` | Per-level token budgets. |
| `editorPaddingX` | `number?` | `0` | `:113` | |
| `autocompleteMaxVisible` | `number?` | `5` | `:114` | |
| `showHardwareCursor` | `boolean?` | — | `:115` | |
| `markdown` | `MarkdownSettings?` | see below | `:116` | |
| `warnings` | `WarningSettings?` | see below | `:117` | |
| `sessionDir` | `string?` | — | `:118` | Custom session storage dir (same as `--session-dir`). |

There is **no** top-level `enabledSkills` / `enabledPrompts` / `enabledThemes` field — only `enabledModels` for Ctrl+P cycling. Per-package filtering of contributed resources happens through the `PackageSource` object form (see below).

## Nested types

### CompactionSettings (`:9-13`)

```ts
{ enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number }
```

Defaults via getters in `SettingsManager`: `enabled` defaults to `true` (`:674`), `reserveTokens` to `16384` (`:687`), `keepRecentTokens` to `20000` (`:691`).

### BranchSummarySettings (`:15-18`)

```ts
{ reserveTokens?: number; skipPrompt?: boolean }  // default reserveTokens 16384
```

### RetrySettings (`:27-32`)

```ts
{
  enabled?: boolean;          // default: true
  maxRetries?: number;        // default: 3
  baseDelayMs?: number;       // default: 2000 (exponential: 2s, 4s, 8s)
  provider?: ProviderRetrySettings; // SDK-level overrides
}
```

`ProviderRetrySettings` (`:20-24`): `timeoutMs?`, `maxRetries?`, `maxRetryDelayMs?` (default 60000).

### TerminalSettings (`:34-41`)

```ts
{
  showImages?: boolean;             // default: true
  imageWidthCells?: number;         // default: 60
  clearOnShrink?: boolean;          // default: false
  showTerminalProgress?: boolean;   // default: false (OSC 9;4)
}
```

### ImageSettings (`:43-46`)

```ts
{ autoResize?: boolean; blockImages?: boolean }  // autoResize default true
```

### ThinkingBudgetsSettings (`:48-53`)

```ts
{ minimal?: number; low?: number; medium?: number; high?: number }
```

### MarkdownSettings (`:55-59`)

```ts
{ codeBlockIndent?: string }  // default "  "
```

### WarningSettings (`:56-58`)

```ts
{ anthropicExtraUsage?: boolean }  // default true — gates the sk-ant-oat warning, see pi-providers
```

### PackageSource (`:71-79`)

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
4. **`undefined` overrides are skipped** (`:134-161`), so project-side `{ defaultProvider: undefined }` does NOT clear a global default.

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
