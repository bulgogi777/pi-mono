# Prompt Templates

How `/template-name` slash commands expand user input before the agent loop sees it. Source-of-truth: `packages/coding-agent/src/core/prompt-templates.ts` (296 lines). All cites against pi-mono at the current pin (`v0.87.1`, `f07218c4`).

## What a prompt template is

A prompt template is a markdown file with optional YAML frontmatter, stored under one of:

- **Global**: `~/.pi/agent/prompts/`
- **Project**: `<cwd>/.pi/prompts/`
- **CLI-supplied**: `--prompt-template <path>` (file or directory, repeatable)

The basename (minus `.md`) becomes the template name. So `~/.pi/agent/prompts/refactor.md` becomes `/refactor`.

`PromptTemplate` shape at `core/prompt-templates.ts:12-19`:

```ts
{
  name: string;
  description: string;     // from frontmatter
  argumentHint?: string;   // from frontmatter
  content: string;         // body (post-frontmatter)
  sourceInfo: SourceInfo;
  filePath: string;        // absolute path
}
```

## Discovery and loading

`loadPromptTemplates(options)` at `core/prompt-templates.ts:222-298`. Order:

1. **Global first** — `<agentDir>/prompts/` (resolved `core/prompt-templates.ts:235`, loaded `:269`).
2. **Project second** — `<cwd>/.pi/prompts/` (resolved `:236`, loaded `:270`).
3. **CLI paths last** — explicit `promptPaths` from `--prompt-template` (`core/prompt-templates.ts:274-296`). Since 0.87.0, malformed template frontmatter is reported as a resource warning instead of being silently ignored (#9830).

Both directory and file paths are accepted in CLI args. Directories are walked one level for `*.md`. Note the precedence is **global-first** — opposite of skills (which are user-first) and SYSTEM.md (project-first). See **pi-architecture** `reference/discovery-paths.md` for the full per-resource precedence matrix.

`includeDefaults: false` (or `--no-prompt-templates` / `-np`) skips the auto-discovered defaults; CLI-supplied paths still load.

## Expansion — `expandPromptTemplate`

`expandPromptTemplate(text, templates)` at `core/prompt-templates.ts:304-320`:

1. Short-circuit if input does not start with `/` (`:305`).
2. Split name from args with a **regex**, not a space scan: `text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/)` (`:307`); `templateName = match[1]`, `argsString = match[2] ?? ""` (`:310-311`). A non-matching string is returned unchanged (`:308`).
3. `args = parseCommandArgs(argsString)` (`:315`) — bash-style argument parsing with double-quote and single-quote support (`core/prompt-templates.ts:25-56`).
4. `return substituteArgs(template.content, args)` (`:316`).
5. If no template matches, return the original `text` unchanged (`:319`).

> Corrected 2026-08-13 (gap-scan error pass). The previous revision described step 2 as `templateName = text.slice(1, spaceIndex)` and cited lines 283 through 295. Neither held: the regex form was already in place at `v0.82.1` (`core/prompt-templates.ts:307`) and every one of those line numbers was past EOF (the file is 285 lines). The claim survived a drift-only re-anchor because it was an *error*, not drift — confidence on the old text: none; on the text above: **high** (read at `v0.84.1`).

This means **template lookup is silent** — `/foo` with no matching template just stays as `/foo`. Skill commands (`/skill:name`) take a different path; the order in `agent-session.ts` is "skill expand → template expand" (see below).

## Argument substitution — `substituteArgs`

`substituteArgs(content, args)` at `core/prompt-templates.ts:71-103`. Five replacement patterns, applied in this order:

1. **`$1`, `$2`, ...** — positional args, 1-indexed (`:74-77`).
2. **`${@:start:length}`** — bash-style slicing, 1-indexed start (`:82-92`). `${@:2}` = "from arg 2 onwards joined by spaces". `${@:2:3}` = "3 args starting from arg 2 joined".
3. **`$ARGUMENTS`** — all args joined with spaces (`:98`).
4. **`$@`** — all args joined with spaces (`:101`).

Single-pass replacement, no recursive expansion: argument values containing `$1` / `$@` / `$ARGUMENTS` patterns are NOT re-substituted (note at `:65-67`).

`parseCommandArgs(argsString)` (`:25-55`) supports double and single quotes. Whitespace splits args; quoted strings are kept atomic.

## Where in the input pipeline expansion happens

Both input paths run the **`input` extension hook first**, then expand skills, then prompt templates. They differ only in how the hook result is used:

- **`AgentSession.prompt()`** (`packages/coding-agent/src/core/agent-session.ts:1606`): `_runInputHandlers` (`:1634`) produces `processedInput`; then `_expandSkillCommand` and `expandPromptTemplate` run on its text (`:1646-1651`), guarded by the `expandPromptTemplates` flag.
- **Queued input: `steer()` / `followUp()`** (`:1860`, `:1872`, via `_queueUserInput` `:1823`): the same order (`_runInputHandlers` `:1833`, then expansion `:1841-1842`). **Since 0.86.0 (#8718)** this also covers RPC `steer` / `follow_up`, which pass `{ source: "rpc" }` and **used to bypass `input` handlers entirely**.

`_runInputHandlers` is `:1555`; it calls `emitInput` at `:1565`.

So:

1. The `input` hook sees the **raw** user text and may transform it, or return `handled` to consume it.
2. **Skill commands expand next.** `/skill:foo bar baz` becomes the expanded skill text.
3. **Prompt templates expand last.** If the result still starts with `/`, template lookup runs.
4. The expanded text goes to the agent loop.

> **Correction 2026-09-22.** This section previously said expansion happens **before** the `input` hook, so handlers would see expanded text. That was already wrong at `v0.85.1`, where `emitInput` (`agent-session.ts:1186`) ran before `expandPromptTemplate` (`:1206`). It was not introduced by 0.86/0.87. **pi-extensions** `hook-events.md` had it right ("before skill/template expansion").

The `expandPromptTemplates` flag is `true` by default; the SDK exposes it as a per-prompt option for callers that want raw text passthrough.

## Frontmatter

Templates use `parseFrontmatter` from `utils/frontmatter`. Recognized keys:

- `description`: human description; surfaces in the `/` autocomplete.
- `argument-hint` (or `argumentHint`): hint string shown next to the template name.

Body (everything after the `---` block) is the template content; argument substitution runs against this body, not against the frontmatter.

## Examples

### `~/.pi/agent/prompts/refactor.md`

```markdown
---
description: Refactor the named file
argument-hint: <path>
---
Please refactor the file at $1 to improve readability and add type annotations.
Focus on $@.
```

User types `/refactor src/foo.ts naming, error handling`. Pi expands to:

> Please refactor the file at src/foo.ts to improve readability and add type annotations. Focus on src/foo.ts naming, error handling.

(Note `$@` includes the file path — `parseCommandArgs` doesn't reserve `$1`.)

## Common gotchas

- **`$@` and `$ARGUMENTS` include `$1` etc.** All positional args are concatenated. To exclude `$1`, use `${@:2}`.
- **No recursive substitution.** Pasting `$ARGUMENTS` as an argument value leaves the literal string in place.
- **Template lookup failure is silent.** A typo (`/refacotr` instead of `/refactor`) results in the original text passing through unchanged. The agent then sees `/refacotr ...` as a literal user message.
- **Template name collision**: if global and project both define `/refactor.md`, the **last loaded wins** because the find at `:321` returns the first match in array order (and project comes second per the load order at `:274-275`). So **project beats global** on collision.
- **Skill commands win over templates.** A skill named `foo` with a `/skill:foo` invocation is matched by `_expandSkillCommand` before `expandPromptTemplate` runs. There is no shadowing of skills by templates.

## Cross-references

- Where templates fit in the system-prompt-assembly story (they don't — they expand the **user message**, not the system prompt): `reference/assembly-order.md`.
- Discovery-path precedence vs other resource types: **pi-architecture** `reference/discovery-paths.md`.
- The `--prompt-template` and `--no-prompt-templates` CLI flags: **pi-architecture** `reference/cli-flags.md`.
- The `input` hook event that fires after expansion: **pi-extensions** `reference/hook-events.md`.
