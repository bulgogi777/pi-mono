# Discovery Paths

Every auto-discovery path pi uses, in precedence order, grouped by resource type. All cites content-matched and symbol-verified against the current pin (`v0.84.1`, `53fa77cc`) on 2026-08-13. If a line drifts, grep for the function name (`loadProjectContextFiles`, `discoverSystemPromptFile`, `discoverAndLoadExtensions`, `loadSkills`, `loadPromptTemplates`) — they are unique enough to relocate quickly.

## The two roots and the env override

- **User / global root**: `~/.pi/agent/`. Computed by `getAgentDir()` at `packages/coding-agent/src/config.ts:515-521`. Overridable via the `PI_CODING_AGENT_DIR` environment variable (constant `ENV_AGENT_DIR` at `config.ts:495`).
- **Project root**: `<cwd>/<CONFIG_DIR_NAME>/` — i.e. `<cwd>/.pi/`. `CONFIG_DIR_NAME` is defined at `config.ts:491`, default `".pi"`, overridable per-fork via `pkg.piConfig.configDir` (and exported from the public API at `packages/coding-agent/src/index.ts:7` since 0.79.7 — extension authors should import it instead of hardcoding `.pi`).
- **Sessions root**: `~/.pi/agent/sessions/<encoded-cwd>/` via `getSessionsDir()` (`config.ts:559-561`). Per-session file location and format live in **pi-sessions** territory.

**Precedence is not uniform across resource types.** The table below makes that explicit; the "Order" column is the canonical one.

## Project trust gating (0.79.x)

**New in 0.79.0** — a layer above all per-resource precedence below. Pi gates loading of project-local `.pi/` resources behind a trust decision before per-resource discovery runs.

**What's gated** (`packages/coding-agent/src/core/trust-manager.ts:29-37`, list `TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES`):

```
"settings.json", "extensions", "skills", "prompts", "themes",
"SYSTEM.md", "APPEND_SYSTEM.md"
```

If none of these exist under `<cwd>/.pi/`, `hasTrustRequiringProjectResources(cwd)` returns `false` and trust short-circuits to `true` — a bare `.pi/` directory does not trigger a trust prompt (`project-trust.ts:50-52`). Project `.agents/skills` in cwd or any ancestor also count as trust-requiring resources.

**What's never gated** (always loads regardless of trust):
- `AGENTS.md` / `CLAUDE.md` context files (loaded by `loadProjectContextFiles`).
- User/global extensions (`~/.pi/agent/extensions/`).
- CLI `-e` / `--extension` extensions.
- Global `~/.pi/agent/SYSTEM.md` and `~/.pi/agent/APPEND_SYSTEM.md` — the **ungated floor** (verified at `resource-loader.ts:1028-1029, :985-986`).

**Resolution order** (`packages/coding-agent/src/core/project-trust.ts:46-96`):

1. `trustOverride` — set by `--approve` / `-a` or `--no-approve` / `-na` (`args.ts:196-199`). Wins everything.
2. `hasTrustRequiringProjectResources(cwd)` — no gated resource exists → auto-trust.
3. `project_trust` extension handler — only user/global and CLI `-e` extensions participate; project-local extensions aren't loaded yet (`project-trust.ts:54-70`). First yes/no decision wins; `"undecided"` defers.
4. Persisted decision from `~/.pi/agent/trust.json` — closest saved decision on cwd or any parent path wins (`project-trust.ts:72-75`).
5. `defaultProjectTrust` global setting — `"ask"` (default) / `"always"` / `"never"` (`project-trust.ts:77-84`).
6. Interactive prompt if `ctx.hasUI` (`project-trust.ts:90-95`). Otherwise returns `false` (`project-trust.ts:86-88`).

**Headless RPC semantics:** `--mode rpc`, `--mode json`, and `-p` all set `hasUI=false`. Without `--approve` and without a saved trust decision in `trust.json`, step 6 returns `false` — all project-local gated resources drop, only the global floor loads. The pragmatic patterns for downstream consumers (synapse, apex-app, pi-task, headless dispatch) are:
- Pass `--approve` per spawn.
- Set `defaultProjectTrust: "always"` globally for the user that runs the consumer.
- Install a user/global extension with a `project_trust` handler that returns `{ trusted: "yes", remember: false }` for known-safe path prefixes (e.g. `~/apex/...`) and `{ trusted: "undecided" }` otherwise.

**`/trust` slash command** (0.79.0): saves a trust decision for the current cwd and immediate parent into `trust.json` (`docs/usage.md`). Current session is not reloaded; restart pi for the change to take effect.

## Context files (AGENTS.md / CLAUDE.md)

**Not trust-gated.** Loaded regardless of project trust (unless `--no-context-files`).

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global context | `~/.pi/agent/AGENTS.md` (or `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD`) | 1st | `loadProjectContextFiles` at `resource-loader.ts:118-159`, via `loadContextFileFromDir` at `:69-85` | Loaded once, before the ancestor walk |
| Ancestor walk | Walks from `cwd` up to `/`, picking the first existing candidate **per directory** | 2nd, root-most first | `resource-loader.ts:134-155` (`while`-loop, `unshift`) | Order in the assembled list is **root-most ancestor first**, then closer dirs, ending at `cwd` |
| Filename candidates | `["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]` (first match wins per dir) | — | `resource-loader.ts:70` | Both case variants are checked; both `AGENTS` and `CLAUDE` filenames are equally valid |
| Dedup | By absolute path; if global match equals an ancestor match it is not re-added | — | `resource-loader.ts:126-130, :103-106` (`seenPaths` set) | |
| Disable | `--no-context-files` / `-nc` short-circuits to empty array | — | `cli/args.ts:171-172`; gated at `resource-loader.ts:515` (`this.noContextFiles ? [] : loadProjectContextFiles(...)`) | Argument flag only suppresses auto-discovered files; the field is `noContextFiles` (`resource-loader.ts:174`) |

## System prompt (SYSTEM.md)

**Project file is trust-gated. Global file is the ungated floor.**

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Project | `<cwd>/.pi/SYSTEM.md` | 1st (wins when trusted) | `discoverSystemPromptFile` at `resource-loader.ts:1022-1034`; project gate at `:1024-1025` | **Trust-gated** — `this.settingsManager.isProjectTrusted() && existsSync(projectPath)` |
| Global | `~/.pi/agent/SYSTEM.md` | 2nd (fallback / always available) | `resource-loader.ts:1028-1029` | Bare `existsSync` — **ungated**. The headless-RPC / untrusted-cwd floor |
| CLI override | `--system-prompt <text-or-file>` | overrides both | `resource-loader.ts:525` (`this.systemPromptSource ?? this.discoverSystemPromptFile()`) | If the arg names an existing file it is read; otherwise treated as literal text (`resolvePromptInput` at `:53-68`) |

**Project-wins when trusted.** Opposite of skills/prompts.

## Append system prompt (APPEND_SYSTEM.md)

Same trust pattern as SYSTEM.md.

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Project | `<cwd>/.pi/APPEND_SYSTEM.md` | 1st (wins when trusted) | `discoverAppendSystemPromptFile` at `resource-loader.ts:1036-1048`; project gate at `:1038-1039` | **Trust-gated** |
| Global | `~/.pi/agent/APPEND_SYSTEM.md` | 2nd (fallback / always available) | `resource-loader.ts:1042-1043` | **Ungated** |
| CLI override | `--append-system-prompt` (repeatable) | replaces auto-discovered | `resource-loader.ts:531-535` (`this.appendSystemPromptSource ?? [discoveredAppendSystemPromptFile]`) | When set, **only** CLI sources are used; auto-discovered file is dropped |

## Skills

**Project skills (`<cwd>/.pi/skills/`) are trust-gated. User skills are not.**

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| User skills | `~/.pi/agent/skills/` (recursive scan for `SKILL.md`) | 1st | `loadSkills` at `skills.ts:387`; user-dir scan at `:431` | **User-first** — opposite of extensions and SYSTEM.md |
| Project skills | `<cwd>/.pi/skills/` | 2nd | `skills.ts:432` | First-wins on name collision; collision recorded as `ResourceDiagnostic` at `skills.ts:412-422` |
| CLI skill paths | `--skill <path>` (file or directory, repeatable) | 3rd | `skills.ts:454+` (explicit-paths loop) | Always loaded regardless of `includeDefaults` / `--no-skills` |
| `--no-skills` / `-ns` | Disables defaults; CLI paths still load | — | `args.ts:165-166`; gated at `resource-loader.ts:467` (`const skillPaths = this.noSkills ? cli-only : cli + defaults`) | `noSkills` only suppresses auto-discovered defaults |
| `includeDefaults` | Internal API parameter, not a CLI flag | — | `skills.ts:388, :430` | Passed by `DefaultResourceLoader` based on the negation of `noSkills` |
| Validation | name regex `/^[a-z0-9-]+$/`, length ≤ `MAX_NAME_LENGTH` (=64 at `skills.ts:11`); description required, length ≤ `MAX_DESCRIPTION_LENGTH` (=1024 at `:14`) | — | `validateName` at `skills.ts:92-112`; `validateDescription` at `:117-127` | Length violations are warnings and the skill **still loads**; only a missing/empty description blocks loading |

## Prompt templates

**Project prompts (`<cwd>/.pi/prompts/`) are trust-gated.**

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global prompts | `~/.pi/agent/prompts/` | 1st | `loadPromptTemplates` at `prompt-templates.ts:194`; global-dir resolution at `:201`; load at `:234` | **Global-first**, opposite of skills |
| Project prompts | `<cwd>/.pi/prompts/` | 2nd | `prompt-templates.ts:203` (project-dir resolution); loaded at `:235` | Both loaded only when `includeDefaults` (`:233`) |
| CLI prompt paths | `--prompt-template <path>` | 3rd | `prompt-templates.ts:241+` (explicit-paths loop) | |
| Disable | `--no-prompts` (`noPromptTemplates`) | — | `resource-loader.ts:482-484` (`const promptPaths = this.noPromptTemplates ? cli-only : cli + defaults`) | Same pattern as `--no-skills` |
| Default values for `$N` | `${1:-default}` since 0.79.1 | — | `docs/prompt-templates.md` | Pi-style positional with default expansion |

## Themes

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global themes | `~/.pi/agent/themes/` | — | `getCustomThemesDir()` at `config.ts:524-526`; consumed at `resource-loader.ts:874` | Resource scan unifies via package contributions |
| Project themes | `<cwd>/.pi/themes/` | — | `resource-loader.ts:874` (same call) | |
| `--no-themes` | Disables default theme discovery | — | `resource-loader.ts:501-503` (`const themePaths = this.noThemes ? cli-only : cli + defaults`) | Same pattern as skills/prompts |
| Automatic light/dark | `/settings` can choose separate light and dark themes and follow terminal color-scheme changes (0.79.7); first-run terminal background detection (0.79.4) | — | `docs/themes.md` | |

## Extensions

**Project extensions are trust-gated.**

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Project extensions | `<cwd>/.pi/extensions/` | **1st** | `discoverAndLoadExtensions` at `extensions/loader.ts:689-737`; project dir added at `:666-668` | **Project-first** — opposite of skills (but trust-gated, so headless-untrusted RPC sees only the next rows) |
| Global extensions | `~/.pi/agent/extensions/` | 2nd | `loader.ts:683-685` | |
| Configured paths | Explicit paths from `settings.extensions` / `--extension`/`-e` CLI | 3rd | `loader.ts:687-701` | Resolved per `cwd`; can be a file, a directory with `index.ts`/`index.js`, or a directory with `package.json` having a `pi` field (`resolveExtensionEntries`) |
| Discovery rules within a directory | Direct `*.ts` / `*.js` files; subdirs with `index.ts`/`index.js`; subdirs with `package.json` declaring `pi` | — | `discoverExtensionsInDir` at `loader.ts:621-653` | One level only; deeper structures need a `package.json` manifest |
| Dedupe | By resolved absolute path | — | `loader.ts:667-676` (`seen` set) | First occurrence wins |
| `--no-extensions` / `-ne` | Skips all auto-discovery; CLI `-e` paths still load | — | `cli/args.ts` (`noExtensions` field; same pattern as `--no-skills`) | |

## Settings (settings.json)

| Resource | Path pattern | Order | Discovery code | Notes |
|---|---|---|---|---|
| Global settings | `~/.pi/agent/settings.json` | merged | `getSettingsPath()` at `config.ts:539-541`; loaded via `settings-manager.ts` | Source of `packages`, `defaultModel`, `defaultProvider`, `enabledModels`, `theme`, `compaction`, `defaultProjectTrust` (0.79.0), `httpProxy` (0.79.5), etc. — full schema at `settings-manager.ts:86-128`; see `reference/settings-json-schema.md` |
| Project settings | `<cwd>/.pi/settings.json` | merged on top of global (when trusted) | `settings-manager.ts` (`projectSettings` field; merge via `deepMergeSettings` at `:132`) | **Trust-gated.** For `packages`, both arrays contribute (project first for collision resolution) |

## Sessions

| Resource | Path pattern | Discovery code | Notes |
|---|---|---|---|
| Sessions dir | `~/.pi/agent/sessions/<encoded-cwd>/<session-id>.jsonl` | `getSessionsDir()` at `config.ts:559-561` | Format / load semantics live in **pi-sessions** territory, not here. Override via `settings.sessionDir` (`settings-manager.ts:125`) |

## Other paths under `~/.pi/agent/`

All defined as helpers in `config.ts` (verified at this pin):

| Path | Helper | Source |
|---|---|---|
| `~/.pi/agent/auth.json` | `getAuthPath()` | `config.ts:534-536` |
| `~/.pi/agent/models.json` | `getModelsPath()` | `config.ts:529-531` |
| `~/.pi/agent/themes/` | `getCustomThemesDir()` | `config.ts:524-526` |
| `~/.pi/agent/tools/` | `getToolsDir()` | `config.ts:544-546` |
| `~/.pi/agent/bin/` (managed `fd`, `rg`) | `getBinDir()` | `config.ts:549-551` |
| `~/.pi/agent/prompts/` | `getPromptsDir()` | `config.ts:554-556` |
| `~/.pi/agent/sessions/` | `getSessionsDir()` | `config.ts:559-561` |
| `~/.pi/agent/<app>-debug.log` | `getDebugLogPath()` | `config.ts:564-566` |
| `~/.pi/agent/trust.json` (0.79.0) | not exposed via a helper; written/read by `trust-manager.ts` | path resolved inside `trust-manager.ts` |

## Cross-references

- The **resolved bundle** assembled per-turn (skills, prompts, themes, extensions, agentsFiles, system prompt, append-system) is built in `DefaultResourceLoader` (`resource-loader.ts:387-546` reload flow). That class owns the precedence wiring above and is the single point where CLI flags meet auto-discovery.
- Trust resolution and the `project_trust` extension event live in `core/project-trust.ts:46-96` and the example at `examples/extensions/project-trust.ts`. See **pi-extensions** for the extension API surface for `project_trust`.
- `package-manager.ts` adds a fourth source on top of user/project: contributions from npm `packages` listed in either `settings.json`. For collisions, project packages win over global packages. The merge is implemented in `package-manager.ts` (look for the `dedupe` / `packages` array logic; line numbers drift frequently — grep for `RESOURCE_TYPES`).
- Diagnostics for resource discovery (collisions, missing paths, validation warnings) flow through `ResourceDiagnostic` and surface in pi's TUI / status output.
