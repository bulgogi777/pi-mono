---
name: pi-architecture
description: >-
  Pi-mono resource discovery — how pi finds files. USE WHEN asked about
  precedence between ~/.pi/agent/ and <cwd>/.pi/, AGENTS.md
  / CLAUDE.md ancestor walk (loadProjectContextFiles), SYSTEM.md /
  APPEND_SYSTEM.md (discoverSystemPromptFile, discoverAppendSystemPromptFile),
  skill discovery (loadSkills, includeDefaults, collisions), prompt templates
  (loadPromptTemplates), extension discovery (.pi/extensions,
  discoverAndLoadExtensions), the packages system (settings.json packages,
  pi install, npm contributions), settings.json schema, CONFIG_DIR_NAME,
  getAgentDir, ENV_AGENT_DIR, or --no-skills / --no-context-files /
  --no-prompts. Also USE WHEN debugging why pi doesn't see an AGENTS.md /
  skill / prompt / extension, which file wins project-vs-global, or resource
  collisions. Do NOT use for hook events / ExtensionAPI (pi-extensions),
  system prompt assembly (pi-prompt-assembly), session JSONL / compaction
  (pi-sessions), provider / auth / models (pi-providers), pi RPC protocol
  (pi-rpc), or anything outside pi-mono.
---

# pi-architecture

Repo structure and resource-discovery reference for pi-mono. Each `reference/*.md` is a focused deep-dive with file:line cites — read the matching one rather than reconstructing from memory.

## Reference index

- `reference/discovery-paths.md` — every auto-discovery path pi uses, in precedence order, grouped by resource type (context files, system prompt, append-system, skills, prompts, themes, extensions, settings). With file:line cites.
- `reference/settings-json-schema.md` — full `Settings` schema for `~/.pi/agent/settings.json` and `<cwd>/.pi/settings.json` with field-by-field cites against `settings-manager.ts:86-128`, defaults, and the project-vs-global `deepMergeSettings` rules (function at `:132`).
- `reference/packages-system.md` — `pi install` / `remove` / `update` / `list`, the `packages: PackageSource[]` array, the npm/git/local source forms, the `pi` field manifest in `package.json`, and `DefaultPackageManager` resolution flow with file:line cites.
- `reference/cli-flags.md` — resource-related CLI flags (`--system-prompt`, `--append-system-prompt`, `--no-context-files`/`-nc`, `--skill`, `--no-skills`/`-ns`, `--prompt-template`, `--no-prompt-templates`/`-np`, `--theme`, `--no-themes`, `--extension`/`-e`, `--no-extensions`/`-ne`) and what each gates inside `DefaultResourceLoader`. Cross-links to pi-sessions and pi-providers for their flag surfaces.

## Quick start when asked

- "Where does pi look for AGENTS.md / CLAUDE.md / SYSTEM.md / APPEND_SYSTEM.md / skills / prompts / extensions?" → `reference/discovery-paths.md`.
- "Which wins, project or global, for X?" → `reference/discovery-paths.md` (precedence column). Heads-up: it's **not uniform** — skills load user-first, extensions load project-first, SYSTEM.md is project-first (when trusted), prompt templates are global-first.
- "Where is settings.json / how do I read it?" → `getSettingsPath()` at `packages/coding-agent/src/config.ts:539-541`; loader is `packages/coding-agent/src/core/settings-manager.ts`.
- "How does `pi install` / the packages array work?" → grep `packages/coding-agent/src/core/package-manager.ts` (look for `installPackage`, `packages`, `RESOURCE_TYPES`).
- "What does `--no-skills` actually disable?" → `packages/coding-agent/src/core/resource-loader.ts:467` (`const skillPaths = this.noSkills ? ... : ...`). Disables auto-discovered defaults but still honours CLI-supplied `--skill <path>` entries. Same pattern for `noPrompts` and `noContextFiles` (the latter gates `loadProjectContextFiles` at `:512`). CLI flag wiring at `args.ts:165-172` (`--no-skills`/`-ns`, `--no-context-files`/`-nc`).
- "What is `CONFIG_DIR_NAME`?" → `packages/coding-agent/src/config.ts:491` — defaults to `.pi`, overridable via `pkg.piConfig.configDir` for rebranded distributions. **Stop hardcoding `.pi` in extensions** — import `CONFIG_DIR_NAME` from `@earendil-works/pi-coding-agent` instead (exported since 0.79.7; see `index.ts:7`). This also makes downstream code safe across forks that ship under a different config dir.
- "Where is `~/.pi/agent/`? Can I move it?" → `getAgentDir()` at `config.ts:515-521`. Override with the `PI_CODING_AGENT_DIR` env var (`ENV_AGENT_DIR`, `config.ts:495`).
- "Is `.pi/SYSTEM.md` / `.pi/extensions` / `.pi/skills` loaded by default?" → No — since 0.79.0 they're **project-trust-gated**. See the new `reference/discovery-paths.md` "Project trust gating (0.79.x)" section. Headless RPC (no UI) without `--approve` and no saved trust returns `false`, dropping all project-local resources. The global `~/.pi/agent/` floor is **ungated**.
- "Where do I add a `--approve` override or set the default for non-interactive runs?" → `--approve` / `-a` (and `--no-approve` / `-na`) at `args.ts:196-199`; `defaultProjectTrust` in `~/.pi/agent/settings.json` (`"ask"` (default) / `"always"` / `"never"`).

## Citation discipline

Always cite `path:line` from pi-mono source. Reference files hold the canonical citations — copy from there rather than reconstructing from memory.
