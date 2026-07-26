# Prompt Templates

How `/template-name` slash commands expand user input before the agent loop sees it. Source-of-truth: `packages/coding-agent/src/core/prompt-templates.ts` (296 lines). All cites against pi-mono `HEAD`.

## What a prompt template is

A prompt template is a markdown file with optional YAML frontmatter, stored under one of:

- **Global**: `~/.pi/agent/prompts/`
- **Project**: `<cwd>/.pi/prompts/`
- **CLI-supplied**: `--prompt-template <path>` (file or directory, repeatable)

The basename (minus `.md`) becomes the template name. So `~/.pi/agent/prompts/refactor.md` becomes `/refactor`.

`PromptTemplate` shape at `prompt-templates.ts:11-19`:

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

`loadPromptTemplates(options)` at `prompt-templates.ts:208-281`. Order:

1. **Global first** — `<agentDir>/prompts/` (`prompt-templates.ts:249`).
2. **Project second** — `<cwd>/.pi/prompts/` (`prompt-templates.ts:250`).
3. **CLI paths last** — explicit `promptPaths` from `--prompt-template` (`prompt-templates.ts:255-274`).

Both directory and file paths are accepted in CLI args. Directories are walked one level for `*.md`. Note the precedence is **global-first** — opposite of skills (which are user-first) and SYSTEM.md (project-first). See **pi-architecture** `reference/discovery-paths.md` for the full per-resource precedence matrix.

`includeDefaults: false` (or `--no-prompt-templates` / `-np`) skips the auto-discovered defaults; CLI-supplied paths still load.

## Expansion — `expandPromptTemplate`

`expandPromptTemplate(text, templates)` at `prompt-templates.ts:269-285`:

1. Short-circuit if input does not start with `/` (`:283`).
2. Split on the first space: `templateName = text.slice(1, spaceIndex)` (`:286-287`).
3. `args = parseCommandArgs(argsString)` (`:291`) — bash-style argument parsing with double-quote and single-quote support (`prompt-templates.ts:24-54`).
4. `return substituteArgs(template.content, args)` (`:292`).
5. If no template matches, return the original `text` unchanged (`:295`).

This means **template lookup is silent** — `/foo` with no matching template just stays as `/foo`. Skill commands (`/skill:name`) take a different path; the order in `agent-session.ts` is "skill expand → template expand" (see below).

## Argument substitution — `substituteArgs`

`substituteArgs(content, args)` at `prompt-templates.ts:69-104`. Five replacement patterns, applied in this order:

1. **`$1`, `$2`, ...** — positional args, 1-indexed (`:73-76`).
2. **`${@:start:length}`** — bash-style slicing, 1-indexed start (`:81-91`). `${@:2}` = "from arg 2 onwards joined by spaces". `${@:2:3}` = "3 args starting from arg 2 joined".
3. **`$ARGUMENTS`** — all args joined with spaces (`:97`).
4. **`$@`** — all args joined with spaces (`:100`).

Single-pass replacement, no recursive expansion: argument values containing `$1` / `$@` / `$ARGUMENTS` patterns are NOT re-substituted (note at `:64-66`).

`parseCommandArgs(argsString)` (`:24-54`) supports double and single quotes. Whitespace splits args; quoted strings are kept atomic.

## Where in the input pipeline expansion happens

In `AgentSession.prompt()` (`packages/coding-agent/src/core/agent-session.ts:~990`), the order is:

```ts
expandedText = currentText;
if (expandPromptTemplates) {
  expandedText = this._expandSkillCommand(expandedText);  // /skill:name → expanded skill
  expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);  // /template → expanded template
}
```

(Cite: `agent-session.ts:1013-1015`, also at `:1184` and `:1204` for steer/follow-up paths.)

So:

1. `expandedText` starts as the raw user input.
2. **Skill commands expand first.** `/skill:foo bar baz` becomes the expanded skill text.
3. **Prompt templates expand second.** If after skill expansion the result still starts with `/`, prompt template lookup runs.
4. The expanded text is then handed to the agent loop, which assembles the system prompt (see `reference/assembly-order.md`) and sends to the LLM.

The expansion happens **before** the `input` extension hook fires (`agent-session.ts:985` is `emitInput`, which runs **after** template expansion — so input handlers see the expanded text).

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
- **Template name collision**: if global and project both define `/refactor.md`, the **last loaded wins** because the find at `:289` returns the first match in array order (and project comes second per the load order at `:248-249`). So **project beats global** on collision.
- **Skill commands win over templates.** A skill named `foo` with a `/skill:foo` invocation is matched by `_expandSkillCommand` before `expandPromptTemplate` runs. There is no shadowing of skills by templates.

## Cross-references

- Where templates fit in the system-prompt-assembly story (they don't — they expand the **user message**, not the system prompt): `reference/assembly-order.md`.
- Discovery-path precedence vs other resource types: **pi-architecture** `reference/discovery-paths.md`.
- The `--prompt-template` and `--no-prompt-templates` CLI flags: **pi-architecture** `reference/cli-flags.md`.
- The `input` hook event that fires after expansion: **pi-extensions** `reference/hook-events.md`.
