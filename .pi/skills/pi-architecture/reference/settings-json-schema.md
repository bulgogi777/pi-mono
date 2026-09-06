# settings.json Schema

Full schema for `~/.pi/agent/settings.json` (user/global) and `<cwd>/.pi/settings.json` (project). Source-of-truth interface: `Settings` at `packages/coding-agent/src/core/settings-manager.ts:89-137`. All cites against pi-mono at the current pin (`v0.85.1`, `d981de12`).

## Top-level fields

| Field | Type | Default | Source line | Notes |
|---|---|---|---|---|
| `lastChangelogVersion` | `string?` | — | `:88` | Track which changelog version the user has seen. |
| `defaultProvider` | `string?` | — | `:89` | Provider id from `KnownProvider` (see **pi-providers**). |
| `defaultModel` | `string?` | — | `:90` | Model id, e.g. `claude-sonnet-4-5`. |
| `defaultThinkingLevel` | `"off"\|"minimal"\|"low"\|"medium"\|"high"\|"xhigh"?` | — | `:91` | |
| `transport` | `"sse"\|"http"?` | `"sse"` | `:92` | SDK request transport. |
| `steeringMode` | `"all"\|"one-at-a-time"?` | — | `:93` | How queued steer messages are delivered. |
| `followUpMode` | `"all"\|"one-at-a-time"?` | — | `:94` | How queued follow-up messages are delivered. |
| `theme` | `string?` | — | `:95` | Theme name. |
| `compaction` | `CompactionSettings?` | see below | `:96` | Auto-compaction tuning. |
| `branchSummary` | `BranchSummarySettings?` | see below | `:97` | Branch-summary tuning. |
| `retry` | `RetrySettings?` | see below | `:98` | Auto-retry on transient errors. |
| `hideThinkingBlock` | `boolean?` | — | `:100` | Hide the thinking section in TUI. |
| `shellPath` | `string?` | — | `:101` | Custom shell (Cygwin etc.). |
| `quietStartup` | `boolean?` | — | `:102` | Suppress startup banner. |
| `shellCommandPrefix` | `string?` | — | `:103` | Prefix for every bash command (e.g. `shopt -s expand_aliases`). |
| `npmCommand` | `string[]?` | — | `:104` | argv-style npm command (e.g. `["mise","exec","node@20","--","npm"]`). |
| `collapseChangelog` | `boolean?` | — | `:105` | Show condensed changelog after self-update. |
| `enableInstallTelemetry` | `boolean?` | `true` | `:106` | Anonymous version-ping after self-update. |
| `packages` | `PackageSource[]?` | — | `:107` | npm/git package sources. See `reference/packages-system.md`. |
| `extensions` | `string[]?` | — | `:102` | Local extension file/dir paths. |
| `skills` | `string[]?` | — | `:109` | Local skill file/dir paths. |
| `prompts` | `string[]?` | — | `:110` | Local prompt-template file/dir paths. |
| `themes` | `string[]?` | — | `:111` | Local theme file/dir paths. |
| `enableSkillCommands` | `boolean?` | `true` | `:112` | Register skills as `/skill:name` commands. |
| `terminal` | `TerminalSettings?` | see below | `:113` | |
| `images` | `ImageSettings?` | see below | `:114` | |
| `enabledModels` | `string[]?` | — | `:115` | Model patterns for Ctrl+P cycling (same syntax as `--models`). |
| `doubleEscapeAction` | `"fork"\|"tree"\|"none"?` | `"tree"` | `:116` | |
| `treeFilterMode` | `"default"\|"no-tools"\|"user-only"\|"labeled-only"\|"all"?` | `"default"` | `:117` | Default `/tree` filter. |
| `thinkingBudgets` | `ThinkingBudgetsSettings?` | — | `:118` | Per-level token budgets. |
| `editorPaddingX` | `number?` | `0` | `:119` | |
| `autocompleteMaxVisible` | `number?` | `5` | `:120` | |
| `showHardwareCursor` | `boolean?` | — | `:121` | |
| `markdown` | `MarkdownSettings?` | see below | `:122` | |
| `warnings` | `WarningSettings?` | see below | `:123` | |
| `sessionDir` | `string?` | — | `:124` | Custom session storage dir (same as `--session-dir`). |

There is **no** top-level `enabledSkills` / `enabledPrompts` / `enabledThemes` field — only `enabledModels` for Ctrl+P cycling. Per-package filtering of contributed resources happens through the `PackageSource` object form (see below).

## Nested types

### CompactionSettings (`:9-14`)

```ts
{ enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number }
```

Defaults via getters in `SettingsManager`: `enabled` defaults to `true` (`:711`), `reserveTokens` to `16384` (`:724`), `keepRecentTokens` to `20000` (`:728`).

### BranchSummarySettings (`:16-19`)

```ts
{ reserveTokens?: number; skipPrompt?: boolean }  // default reserveTokens 16384
```

### RetrySettings (`:28-33`)

```ts
{
  enabled?: boolean;          // default: true
  maxRetries?: number;        // default: 3
  baseDelayMs?: number;       // default: 2000 (exponential: 2s, 4s, 8s)
  provider?: ProviderRetrySettings; // SDK-level overrides
}
```

`ProviderRetrySettings` (`:21-25`): `timeoutMs?`, `maxRetries?`, `maxRetryDelayMs?` (default 60000).

### TerminalSettings (`:35-43`)

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

### ThinkingBudgetsSettings (`:53-58`)

```ts
{ minimal?: number; low?: number; medium?: number; high?: number }
```

### MarkdownSettings (`:60-64`)

```ts
{ codeBlockIndent?: string }  // default "  "
```

### WarningSettings (`:61-63`)

```ts
{ anthropicExtraUsage?: boolean }  // default true — gates the sk-ant-oat warning, see pi-providers
```

### PackageSource (`:76-84`)

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

Implemented by `deepMergeSettings(base, overrides)` at `settings-manager.ts:123-154`:

1. **Project (`<cwd>/.pi/settings.json`) overrides global (`~/.pi/agent/settings.json`).** The merge walks every key of `overrides` and applies overrides over base.
2. **Nested objects merge recursively.** If both base and override have an object at the same key (e.g. `compaction`, `terminal`, `markdown`), they are spread-merged (`:142-147`). So setting only `compaction.keepRecentTokens` in project leaves the global `compaction.enabled` and `compaction.reserveTokens` intact.
3. **Primitives and arrays: project value replaces global value entirely.** No array concatenation. If both files set `packages: [...]`, the project array wins outright. Same for `extensions`, `skills`, `prompts`, `themes`, `enabledModels`.
4. **`undefined` overrides are skipped** (`:141-170`), so project-side `{ defaultProvider: undefined }` does NOT clear a global default.

Path resolution: paths in project arrays are resolved relative to `<cwd>`; paths in global arrays are resolved relative to the global agent dir (or absolute). Tilde-expansion is supported.

## Settings file locations

- **Global**: `~/.pi/agent/settings.json` — `getSettingsPath()` at `packages/coding-agent/src/config.ts:439-441`.
- **Project**: `<cwd>/.pi/settings.json` — joined from `CONFIG_DIR_NAME` (`.pi`).
- **File mode**: written `0600` for parity with `auth.json`.
- **Override env**: `PI_CODING_AGENT_DIR` redirects the global path entirely (`config.ts:380`).

## Cross-references

- The `packages` array semantics, `pi install`, and the npm `pi` field manifest: `reference/packages-system.md`.
- Discovery paths for `extensions/`, `skills/`, `prompts/`, `themes/` directories regardless of settings.json: `reference/discovery-paths.md`.
- `--no-skills`, `--no-context-files`, etc., and how they interact with these arrays: `reference/cli-flags.md`.
- The `enabledModels` field's pattern syntax: **pi-providers** `reference/built-in-providers.md`.
- `sessionDir` / `compaction` / `branchSummary` semantics on the consumer side: **pi-sessions**.
