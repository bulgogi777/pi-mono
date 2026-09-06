# Resource-related CLI Flags

CLI flags that gate or augment resource discovery and loading. All cites against pi-mono at the current pin (`v0.85.1`, `d981de12`). Parser: `parseArgs` in `packages/coding-agent/src/cli/args.ts`. Application: `DefaultResourceLoader` in `packages/coding-agent/src/core/resource-loader.ts`.

This file covers **resource flags only** (context files, skills, prompts, system prompt, extensions, themes). For session flags (`--continue`, `--resume`, `--fork`, `--session*`, `--no-session`), see **pi-sessions** `reference/cli-flags.md`. For provider/model flags (`--provider`, `--model`, `--api-key`, `--models`), see **pi-providers** `reference/cli-flags.md`.

## Quick reference

| Flag | Short | Args | Lines | Effect |
|---|---|---|---|---|
| `--system-prompt <text\|file>` | — | required | `args.ts:106-107` | Replaces the default system-prompt body. If the value names an existing file, pi reads it; otherwise treated as literal text (`resolvePromptInput`, `resource-loader.ts:54-69`). |
| `--append-system-prompt <text\|file>` | — | required, repeatable | `args.ts:108-110` | Appends to whatever system prompt was assembled. Repeat to append multiple chunks. When set, **CLI sources replace** any auto-discovered `APPEND_SYSTEM.md` (`resource-loader.ts:519-521`). |
| `--no-context-files` | `-nc` | — | `args.ts:164-165` | Skips the AGENTS.md / CLAUDE.md ancestor walk. Gated at `resource-loader.ts:507-508`. |
| `--skill <path>` | — | required, repeatable | `args.ts:149-151` | Adds a skill file or directory to the load list. Always honored even with `--no-skills`. |
| `--no-skills` | `-ns` | — | `args.ts:158-159` | Disables auto-discovered defaults from `~/.pi/agent/skills/` and `<cwd>/.pi/skills/`. CLI-supplied `--skill` paths still load (`resource-loader.ts:472-474`). |
| `--prompt-template <path>` | — | required, repeatable | `args.ts:152-154` | Adds a prompt-template file or directory. Always honored. |
| `--no-prompt-templates` | `-np` | — | `args.ts:160-161` | Disables auto-discovered prompt-template defaults. CLI-supplied `--prompt-template` paths still load (`resource-loader.ts:483-485`). |
| `--theme <path>` | — | required, repeatable | `args.ts:155-157` | Adds a theme file or directory. Always honored. |
| `--no-themes` | — | — | `args.ts:162-163` | Disables auto-discovered theme defaults (`resource-loader.ts:495-497`). |
| `--extension <path>` / `-e` | `-e` | required, repeatable | `args.ts:144-146` | Adds an extension file or directory. Always honored even with `--no-extensions`. |
| `--no-extensions` | `-ne` | — | `args.ts:147-148` | Disables auto-discovered extension defaults from `~/.pi/agent/extensions/`, `<cwd>/.pi/extensions/`, and the `packages` array. CLI-supplied `-e` paths still load. Gated at `resource-loader.ts:447-449`. |

## What "no-X" actually disables

The pattern is identical for skills, prompt templates, themes, and extensions: `--no-<resource>` disables the **auto-discovered defaults** but does not suppress CLI-supplied paths.

In `DefaultResourceLoader.reload()` (`resource-loader.ts:~340-490`):

```ts
const extensionPaths = this.noExtensions
  ? cliEnabledExtensions
  : this.mergePaths(cliEnabledExtensions, enabledExtensions);
```

`enabledExtensions` is the union of the loose-`extensions/` directories and the resource-paths surfaced by the package manager. `cliEnabledExtensions` is whatever came from `-e` / `--extension`. Same shape applies to skills (`:468-470`), prompt templates (`:480-482`), themes (`:492-494`).

`--no-context-files` is the one exception — there is no CLI flag to add an ad-hoc AGENTS.md, so `--no-context-files` simply zeroes the list (`:504-505`).

## System prompt resolution

`--system-prompt` and `--append-system-prompt` both flow through `resolvePromptInput` (`resource-loader.ts:54-69`):

1. If the value names an existing file path (relative or absolute), read the file and use its contents.
2. Otherwise, treat the literal value as the prompt text.

This means `--system-prompt "Be concise."` and `--system-prompt /path/to/file.md` both work; the dispatch is `existsSync` against the value.

When set, `--system-prompt` shifts pi into the **customPrompt branch** of `buildSystemPrompt` (`packages/coding-agent/src/core/system-prompt.ts:28-168`; the `customPrompt` branch is `:48-73`, returning early at `:72`). Without it, pi assembles the default prompt (`:75-167`). See **pi-prompt-assembly** `reference/assembly-order.md` for the consequences of which branch runs.

`--append-system-prompt` is repeatable; multiple instances are concatenated with newline separators. When the flag is provided **at all**, auto-discovered `<cwd>/.pi/APPEND_SYSTEM.md` and `~/.pi/agent/APPEND_SYSTEM.md` are **not** also appended (`resource-loader.ts:519-521`).

## Argument parsing notes

- All `<path>` flags accept either a file or a directory. Directories are walked one level for matching files (`SKILL.md`, `*.md`, `*.json` for themes, `*.ts`/`*.js` for extensions).
- All `<path>` flags accept tilde expansion (`~/...`) and are resolved against `cwd` for relative paths.
- `--system-prompt` and `--append-system-prompt` always take a value; if the next token starts with `-`, parsing fails with an error.
- Repeatable flags (`--skill`, `--prompt-template`, `--theme`, `--extension`, `--append-system-prompt`) accumulate into arrays (`args.ts:149-157`).

## Common gotchas

- **`--prompt-template`, not `--prompt`.** A bare `--prompt` is **not** a recognized flag. Same for `--no-prompt-templates` (not `--no-prompts`).
- **`--no-skills` doesn't suppress `--skill <path>`.** This is intentional — the CLI flag is a power-user override that always wins.
- **`--no-extensions` does suppress packages.** The `packages` array in `settings.json` flows through the same `enabledExtensions` list that `--no-extensions` zeroes. To selectively disable one extension, edit `settings.json` or use `pi remove <source>`.
- **`--system-prompt` puts pi in a different code branch.** This matters for caching and for the empty-turn issue documented in **pi-prompt-assembly** `reference/known-issues.md`.

## Cross-references

- Discovery paths and precedence per resource type: `reference/discovery-paths.md`.
- `settings.json` arrays (`extensions`, `skills`, `prompts`, `themes`, `packages`) that combine with these flags: `reference/settings-json-schema.md`.
- Session flags (`--continue` / `--resume` / `--fork` / `--session` / `--session-dir` / `--no-session`): **pi-sessions** `reference/cli-flags.md`.
- Provider/model flags (`--provider` / `--model` / `--api-key` / `--models`): **pi-providers** `reference/cli-flags.md`.
- The `--mode` flag (`text` / `json` / `rpc`) and the `--export` flag belong to mode/export concerns — see **pi-rpc** for `--mode rpc` and `--mode json`.
