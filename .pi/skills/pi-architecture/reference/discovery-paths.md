# Discovery Paths

Every auto-discovery path pi uses, in precedence order, grouped by resource type. Cites verified against pi-mono `HEAD` on the date this file was written. If a line drifts, grep for the function name (e.g. `loadProjectContextFiles`, `discoverSystemPromptFile`, `discoverAndLoadExtensions`) — they are unique enough to relocate quickly.

## The two roots and the env override

- **User / global root**: `~/.pi/agent/`. Computed by `getAgentDir()` at `packages/coding-agent/src/config.ts:402-409`. Overridable via the `PI_CODING_AGENT_DIR` environment variable (constant `ENV_AGENT_DIR` at `config.ts:380`).
- **Project root**: `<cwd>/<CONFIG_DIR_NAME>/` — i.e. `<cwd>/.pi/`. `CONFIG_DIR_NAME` is defined at `config.ts:376`, default `".pi"`, overridable per-fork via `pkg.piConfig.configDir`.
- **Sessions root**: `~/.pi/agent/sessions/` via `getSessionsDir()` (`config.ts:446-448`); overridable via `PI_CODING_AGENT_SESSION_DIR` (`ENV_SESSION_DIR` at `config.ts:381`).

**Precedence is not uniform across resource types.** The table below makes that explicit; the "Order" column is the canonical one.

## Context files (AGENTS.md / CLAUDE.md)

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global context | `~/.pi/agent/AGENTS.md` (or `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD`) | 1st | `loadProjectContextFiles` at `resource-loader.ts:76-115`, via `loadContextFileFromDir` at `resource-loader.ts:58-74` | Loaded once, before the ancestor walk |
| Ancestor walk | Walks from `cwd` up to `/`, picking the first existing candidate **per directory** | 2nd, root-most first | `resource-loader.ts:91-110` (`while`-loop, `unshift`) | Order in the assembled list is **root-most ancestor first**, then closer dirs, ending at `cwd` |
| Filename candidates | `["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]` (first match wins per dir) | — | `resource-loader.ts:59` | Both case variants are checked; both `AGENTS` and `CLAUDE` filenames are equally valid |
| Dedup | By absolute path; if global match equals an ancestor match it is not re-added | — | `resource-loader.ts:84-89, 95-99` | `seenPaths` set |
| Disable | `--no-context-files` / `-nc` short-circuits to empty array | — | `cli/args.ts:147-148`; gated at `resource-loader.ts:455-456` | Argument flag still loads CLI-supplied paths via other means |

## System prompt (SYSTEM.md)

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Project | `<cwd>/.pi/SYSTEM.md` | 1st (wins) | `discoverSystemPromptFile` at `resource-loader.ts:844-856` | Returned immediately if it exists |
| Global | `~/.pi/agent/SYSTEM.md` | 2nd (fallback) | `resource-loader.ts:850-853` | Only used if project file is absent |
| CLI override | `--system-prompt <text-or-file>` | overrides both | `resource-loader.ts:462` (`this.systemPromptSource ?? this.discoverSystemPromptFile()`) | If the arg names an existing file it is read; otherwise treated as literal text (`resolvePromptInput`, `resource-loader.ts:15-27`) |

**Project-wins** — opposite of skills.

## Append system prompt (APPEND_SYSTEM.md)

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Project | `<cwd>/.pi/APPEND_SYSTEM.md` | 1st (wins) | `discoverAppendSystemPromptFile` at `resource-loader.ts:858-870` | Single file, project-first |
| Global | `~/.pi/agent/APPEND_SYSTEM.md` | 2nd (fallback) | `resource-loader.ts:864-867` | Only used if project file is absent |
| CLI override | `--append-system-prompt` (repeatable) | replaces auto-discovered | `resource-loader.ts:467-469` | When set, **only** CLI sources are used; auto-discovered file is dropped |

## Skills

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| User skills | `~/.pi/agent/skills/` (recursive scan for `SKILL.md`) | 1st | `loadSkills` at `skills.ts:447-449` (only when `includeDefaults` true) | **User-first** — opposite of extensions and SYSTEM.md |
| Project skills | `<cwd>/.pi/skills/` | 2nd | `skills.ts:448-449` | First-wins on name collision; collision is recorded as a `ResourceDiagnostic` (`skills.ts:428-440`) |
| CLI skill paths | `--skill <path>` (file or directory, repeatable) | 3rd | `skills.ts:472-498` | Always loaded regardless of `includeDefaults` / `--no-skills` |
| `--no-skills` / `-ns` | Disables defaults; CLI paths still load | — | `cli/args.ts:141-142`; gated at `resource-loader.ts:419-421` | `noSkills` only suppresses the auto-discovered defaults |
| `includeDefaults` | Internal API parameter, not a CLI flag | — | `skills.ts:385, 447` | Passed by `DefaultResourceLoader` based on the negation of `noSkills` |
| Validation | name must match parent dir, regex `/^[a-z0-9-]+$/`, length ≤ 64; description required, length ≤ 1024 | — | `skills.ts:97-117` (name), `skills.ts:122-130` (description) | Length violations are `warnings` and the skill **still loads** (`skills.ts:308-313`); only a missing/empty description blocks loading |

## Prompt templates

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global prompts | `~/.pi/agent/prompts/` | 1st | `loadPromptTemplates` at `prompt-templates.ts:248` (when `includeDefaults` true) | **Global-first**, opposite of skills |
| Project prompts | `<cwd>/.pi/prompts/` | 2nd | `prompt-templates.ts:249` | |
| CLI prompt paths | `--prompt <path>` | 3rd | `prompt-templates.ts:254-273` | |
| Disable | `--no-prompts` (`noPromptTemplates`) | — | `resource-loader.ts:431-433` | Same pattern as `--no-skills`: defaults suppressed, CLI paths honoured |

## Themes

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global themes | `~/.pi/agent/themes/` | — | `getCustomThemesDir()` at `config.ts:411-413` | Resource scan unifies via `settings-manager.ts` package contributions |
| `--no-themes` | Disables default theme discovery | — | `resource-loader.ts:443-445` | Same pattern as skills/prompts |

## Extensions

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Project extensions | `<cwd>/.pi/extensions/` | **1st** | `discoverAndLoadExtensions` at `extensions/loader.ts:558-606`; project added at `loader.ts:579-581` | **Project-first** — opposite of skills |
| Global extensions | `~/.pi/agent/extensions/` | 2nd | `loader.ts:583-584` | |
| Configured paths | Explicit paths from settings/CLI | 3rd | `loader.ts:587-603` | Resolved per `cwd`; can be a file, an `index.ts`/`index.js` directory, or a directory with `package.json` having a `pi` field |
| Discovery rules within a directory | Direct `*.ts` / `*.js` files; subdirs with `index.ts`/`index.js`; subdirs with `package.json` declaring `pi` | — | `discoverExtensionsInDir` at `loader.ts:524-555`; rules documented at `loader.ts:516-521` | One level only; deeper structures need a `package.json` manifest |
| Dedupe | By resolved absolute path | — | `loader.ts:565-572` (`seen` set) | First occurrence wins |

## Settings (settings.json)

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global settings | `~/.pi/agent/settings.json` | merged | `getSettingsPath()` at `config.ts:426-428`; loaded via `settings-manager.ts` | Source of `packages`, `defaultModel`, `defaultProvider`, `enabledModels`, `theme`, `compaction`, etc. — see `reference/settings-json-schema.md` |
| Project settings | `<cwd>/.pi/settings.json` | merged on top of global | `settings-manager.ts` (look for `projectSettings`) | Merge semantics resource-type-specific; for `packages`, both arrays contribute (project first for collision resolution — `package-manager.ts:855-862`) |

## Sessions

| Resource | Path pattern | Discovery code | Notes |
|---|---|---|---|
| Sessions dir | `~/.pi/agent/sessions/<encoded-cwd>/<session-id>.jsonl` | `getSessionsDir()` at `config.ts:446-448` | Override via `PI_CODING_AGENT_SESSION_DIR` (`config.ts:381`). Format / load semantics live in **pi-sessions** territory, not here |

## Other paths under `~/.pi/agent/`

All defined as helpers in `config.ts:398-453`:

| Path | Helper | Source |
|---|---|---|
| `~/.pi/agent/auth.json` | `getAuthPath()` | `config.ts:421-423` |
| `~/.pi/agent/models.json` | `getModelsPath()` | `config.ts:416-418` |
| `~/.pi/agent/themes/` | `getCustomThemesDir()` | `config.ts:411-413` |
| `~/.pi/agent/tools/` | `getToolsDir()` | `config.ts:431-433` |
| `~/.pi/agent/bin/` (managed `fd`, `rg`) | `getBinDir()` | `config.ts:436-438` |
| `~/.pi/agent/prompts/` | `getPromptsDir()` | `config.ts:441` |
| `~/.pi/agent/<app>-debug.log` | `getDebugLogPath()` | `config.ts:451-453` |

## Cross-references

- The **resolved bundle** assembled per-turn (skills, prompts, themes, extensions, agentsFiles, system prompt, append-system) is built in `DefaultResourceLoader` (`resource-loader.ts:153-490+`). That class owns the precedence wiring above and is the single point where CLI flags meet auto-discovery.
- `package-manager.ts` adds a fourth source on top of user/project: contributions from npm `packages` listed in either `settings.json`. For collisions, **project packages win over global packages** (`package-manager.ts:855-862`). The merge is implemented in `package-manager.ts:1622-1670` (look for `dedupe` / `packages` array logic).
- Diagnostics for resource discovery (collisions, missing paths, validation warnings) flow through `ResourceDiagnostic` defined in `core/diagnostics.ts` and surface in pi's TUI / status output.
