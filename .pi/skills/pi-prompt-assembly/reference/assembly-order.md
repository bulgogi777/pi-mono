# System Prompt Assembly Order

Section-by-section breakdown of what `buildSystemPrompt` produces, branch by branch. All cites against `packages/coding-agent/src/core/system-prompt.ts` at pi-mono `HEAD` on the date this file was written.

## Entry point

`buildSystemPrompt(options: BuildSystemPromptOptions)` at `system-prompt.ts:28-167`.

Inputs:
- `customPrompt?: string` — if set, the function takes the **customPrompt branch** (`:53-77`). Otherwise the **default-prompt branch** (`:80-167`) builds pi's stock prompt from scratch.
- `selectedTools?: string[]` — defaults internally to `["read", "bash", "edit", "write"]` at `:88`. Tool list determines (a) the `Available tools:` rendering, (b) which guidelines fire, and (c) whether the skills section is included.
- `toolSnippets?: Record<string, string>` — one-line descriptions keyed by tool name. A tool is only listed in `Available tools:` when a snippet is supplied (`:90-91`).
- `promptGuidelines?: string[]` — extra bullets appended to the auto-generated guidelines.
- `appendSystemPrompt?: string` — pre-resolved text from `--append-system-prompt` and/or `APPEND_SYSTEM.md`.
- `cwd: string` — working directory; appears as the trailing `Current working directory:` line.
- `contextFiles?: Array<{ path; content }>` — pre-loaded by `loadProjectContextFiles` (lives in **pi-architecture** territory; here we just consume them).
- `skills?: Skill[]` — pre-loaded skill metadata. Bodies are **not** in scope; only `name`, `description`, `filePath` get rendered (see `formatSkillsForPrompt` below).

Common preamble (both branches): the current date (`YYYY-MM-DD`) and `appendSection` (the appendSystemPrompt with a leading `\n\n`) are computed at `:41-48`.

## Branch 1 — `customPrompt` (lines 53-77)

Order in the assembled string:

1. **Custom prompt body** — verbatim `customPrompt` (`:54`).
2. **APPEND_SYSTEM section** — `\n\n` + `appendSystemPrompt` (`:56-58`). Skipped when empty.
3. **`# Project Context` block** — emitted only if `contextFiles.length > 0` (`:61-67`). Each file becomes `## <absolute-path>\n\n<content>\n\n`. Heading text is `Project-specific instructions and guidelines:` (`:62`).
4. **Skills section** — `formatSkillsForPrompt(skills)` appended only when both conditions hold (`:70-73`):
   - `customPromptHasRead = !selectedTools || selectedTools.includes("read")` (`:70`). I.e. if `selectedTools` is undefined the gate is open; explicit tool lists must include `"read"`.
   - `skills.length > 0`.
5. **Trailing metadata** (`:76-77`):
   - `\nCurrent date: <date>`
   - `\nCurrent working directory: <cwd>` (backslashes normalized to forward at `:40`).

The customPrompt branch contains **no** "You are an expert coding assistant…" preamble, **no** auto-generated `Available tools:` table, **no** auto-generated `Guidelines:` block, and **no** `Pi documentation` block. Everything pi normally inserts above APPEND_SYSTEM is the caller's responsibility.

## Branch 2 — default prompt (lines 80-167)

Order in the assembled string (built into a single `prompt` variable starting at `:131`):

1. **Hard-coded preamble** (`:131-145`): `"You are an expert coding assistant operating inside pi…"`.
2. **`Available tools:`** list (`:91, :136`). Built from `selectedTools` filtered to those with a `toolSnippets[name]` entry; falls back to `(none)` when empty (`:90-92`).
3. **Guidelines** (`:94-128, :140`). Auto-derived bullets:
   - File-exploration guidelines: bash-only vs bash+grep/find/ls (`:108-113`).
   - Caller-supplied `promptGuidelines` (`:115-120`), deduped via `guidelinesSet` (`:96-103`).
   - Always-on tail: `"Be concise in your responses"` and `"Show file paths clearly when working with files"` (`:123-124`).
4. **Pi documentation block** (`:142-145`). Hard-coded list of `docs/*.md` paths (extensions, themes, skills, prompt-templates, tui, keybindings, sdk, custom-provider, models, packages) plus the absolute paths from `getReadmePath() / getDocsPath() / getExamplesPath()` (`:81-84`).
5. **APPEND_SYSTEM section** (`:147-149`). Same `\n\n` + `appendSystemPrompt` pattern as the customPrompt branch.
6. **`# Project Context` block** (`:152-158`). Identical to customPrompt branch step 3.
7. **Skills section** (`:161-163`). Gate is **only** `hasRead` here — `hasRead = tools.includes("read")` at `:106` — so the implicit-`undefined` shortcut from the customPrompt branch does **not** apply. If the caller passes `selectedTools: []` or any list lacking `"read"`, no skills.
8. **Trailing metadata** (`:166-167`). Same as customPrompt branch.

## The skills section is only metadata

`formatSkillsForPrompt(skills)` at `packages/coding-agent/src/core/skills.ts:340-366` emits, per skill:

```xml
<skill>
  <name>...</name>
  <description>...</description>
  <location>/abs/path/to/SKILL.md</location>
</skill>
```

Wrapped in `<available_skills>…</available_skills>` plus a three-line preamble instructing the model to `read` the location when a description matches (`skills.ts:347-352`). Skills with `disableModelInvocation: true` are filtered out at `skills.ts:341` (so they remain `/skill:name`-invocable but never appear in the prompt).

**The body of `SKILL.md` is never injected into the system prompt.** It is loaded later, on demand, when the model issues a `read` tool call against `<location>`. That is why the `read`-tool gate at `system-prompt.ts:71` (customPrompt) and `:163` (default) actually disables skills entirely — without `read`, the model cannot follow up on a skill listing.

## What this means for cache layout

The system prompt becomes a single string passed downstream as `context.systemPrompt`. The Anthropic provider (`packages/ai/src/providers/anthropic.ts`) wraps it in a single text block with a single `cache_control` breakpoint at `anthropic.ts:907` (non-OAuth) or `:898` (OAuth). Order matters: anything inserted earlier is part of the cached prefix; anything inserted later still falls inside the same cache block because the entire system prompt is one block. See `reference/cache-breakpoints.md` for the cascade rules.

## Cross-references

- The pre-loading of `contextFiles` (AGENTS.md / CLAUDE.md ancestor walk) and `skills` lives in **pi-architecture** (`reference/discovery-paths.md`). This skill only documents how those pre-loaded values get rendered into the final string.
- Extension hooks that can replace the system prompt (`before_agent_start` returning `systemPrompt`) are **pi-extensions** territory.
- `--system-prompt` and `--append-system-prompt` resolve via `resolvePromptInput` at `packages/coding-agent/src/core/resource-loader.ts:15-27` — file-if-exists, else literal text.
