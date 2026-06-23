# System Prompt Assembly Order

Section-by-section breakdown of what `buildSystemPrompt` produces, branch by branch. All cites against `packages/coding-agent/src/core/system-prompt.ts` at the current pin (`v0.79.10`, `8e190066`).

## Entry point

`buildSystemPrompt(options: BuildSystemPromptOptions)` at `system-prompt.ts:28-172`.

Inputs:
- `customPrompt?: string` — if set, the function takes the **customPrompt branch** (`:53-80`). Otherwise the **default-prompt branch** (`:82-171`) builds pi's stock prompt from scratch.
- `selectedTools?: string[]` — defaults internally to `["read", "bash", "edit", "write"]` at `:90`. Tool list determines (a) the `Available tools:` rendering, (b) which guidelines fire, and (c) whether the skills section is included.
- `toolSnippets?: Record<string, string>` — one-line descriptions keyed by tool name. A tool is only listed in `Available tools:` when a snippet is supplied (`:91-93`).
- `promptGuidelines?: string[]` — extra bullets appended to the auto-generated guidelines.
- `appendSystemPrompt?: string` — pre-resolved text from `--append-system-prompt` and/or `APPEND_SYSTEM.md`.
- `cwd: string` — working directory; appears as the trailing `Current working directory:` line.
- `contextFiles?: Array<{ path; content }>` — pre-loaded by `loadProjectContextFiles` (lives in **pi-architecture** territory; here we just consume them).
- `skills?: Skill[]` — pre-loaded skill metadata. Bodies are **not** in scope; only `name`, `description`, `filePath` get rendered (see `formatSkillsForPrompt` below).

Common preamble (both branches): the current date (`YYYY-MM-DD`) is computed at `:42-46`, `appendSection` at `:48`, `promptCwd` (backslashes normalized to forward) at `:40`.

## Branch 1 — `customPrompt` (lines 53-80)

Order in the assembled string:

1. **Custom prompt body** — verbatim `customPrompt` (`:54`).
2. **APPEND_SYSTEM section** — `\n\n` + `appendSystemPrompt` (`:56-58`). Skipped when empty.
3. **`<project_context>` block** — emitted only if `contextFiles.length > 0` (`:60-67`). The block opens with `\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n`. Each file becomes `<project_instructions path="<absolute-path>">\n<content>\n</project_instructions>\n\n`. The block closes with `</project_context>\n`. **Pre-0.75.0** this section used a `# Project Context` Markdown heading with `## <abs-path>` per file; PRs #4541 (`7577d3b8`) and #4709 (`aad8cf66`) switched both branches to XML tags so models do not ingest prompt content past the boundary.
4. **Skills section** — `formatSkillsForPrompt(skills)` appended only when both conditions hold (`:70-73`):
   - `customPromptHasRead = !selectedTools || selectedTools.includes("read")` (`:71`). If `selectedTools` is undefined the gate is open; explicit tool lists must include `"read"`.
   - `skills.length > 0`.
5. **Trailing metadata** (`:76-77`):
   - `\nCurrent date: <date>`
   - `\nCurrent working directory: <cwd>` (backslashes normalized to forward at `:40`).

The customPrompt branch contains **no** "You are an expert coding assistant…" preamble, **no** auto-generated `Available tools:` table, **no** auto-generated `Guidelines:` block, and **no** `Pi documentation` block. Everything pi normally inserts above APPEND_SYSTEM is the caller's responsibility.

## Branch 2 — default prompt (lines 82-171)

Order in the assembled string (built into a single `prompt` variable starting at `:130`):

1. **Hard-coded preamble** (`:130-147`): `"You are an expert coding assistant operating inside pi…"`.
2. **`Available tools:`** list (`:91-93`, rendered via `${toolsList}` at `:133`). Built from `selectedTools` filtered to those with a `toolSnippets[name]` entry; falls back to `(none)` when empty (`:90-93`).
3. **Guidelines** (`:95-128, :137-138`). Auto-derived bullets:
   - File-exploration guideline: bash-only without grep/find/ls suggests `"Use bash for file operations like ls, rg, find"` (`:112-114`).
   - Caller-supplied `promptGuidelines` (`:116-121`), deduped via `guidelinesSet` (`:96-103`).
   - Always-on tail: `"Be concise in your responses"` and `"Show file paths clearly when working with files"` (`:124-125`).
4. **Pi documentation block** (`:140-147`). Hard-coded list of `docs/*.md` paths (extensions, themes, skills, prompt-templates, tui, keybindings, sdk, custom-provider, models, packages) plus the absolute paths from `getReadmePath() / getDocsPath() / getExamplesPath()` (`:84-86`).
5. **APPEND_SYSTEM section** (`:149-151`). Same `\n\n` + `appendSystemPrompt` pattern as the customPrompt branch.
6. **`<project_context>` block** (`:153-161`). Identical XML wrapping to customPrompt branch step 3 (same pre-0.75.0 migration note applies).
7. **Skills section** (`:163-166`). Gate is **only** `hasRead` here — `hasRead = tools.includes("read")` at `:110` — so the implicit-`undefined` shortcut from the customPrompt branch does **not** apply. If the caller passes `selectedTools: []` or any list lacking `"read"`, no skills.
8. **Trailing metadata** (`:168-170`). Same as customPrompt branch.

## The skills section is only metadata

`formatSkillsForPrompt(skills)` at `packages/coding-agent/src/core/skills.ts:335-361` emits, per skill:

```xml
<skill>
  <name>...</name>
  <description>...</description>
  <location>/abs/path/to/SKILL.md</location>
</skill>
```

Wrapped in `<available_skills>…</available_skills>` plus a three-line preamble instructing the model to `read` the location when a description matches (`skills.ts:343-345`). Skills with `disableModelInvocation: true` are filtered out at `skills.ts:336` (so they remain `/skill:name`-invocable but never appear in the prompt).

**The body of `SKILL.md` is never injected into the system prompt.** It is loaded later, on demand, when the model issues a `read` tool call against `<location>`. That is why the `read`-tool gate at `system-prompt.ts:71` (customPrompt, `customPromptHasRead`) and `:164` (default, `hasRead`) actually disables skills entirely — without `read`, the model cannot follow up on a skill listing.

## What this means for cache layout

The system prompt becomes a single string passed downstream as `context.systemPrompt`. The Anthropic provider (`packages/ai/src/providers/anthropic.ts`) wraps it in a single text block with a single `cache_control` breakpoint at `providers/anthropic.ts:950` (non-OAuth) or `:941` (OAuth user-system block, after the constant identity preamble at `:934`). Order matters: anything inserted earlier is part of the cached prefix; anything inserted later still falls inside the same cache block because the entire system prompt is one block. See `reference/cache-breakpoints.md` for the cascade rules.

## Cross-references

- The pre-loading of `contextFiles` (AGENTS.md / CLAUDE.md ancestor walk) and `skills` lives in **pi-architecture** (`reference/discovery-paths.md`). This skill only documents how those pre-loaded values get rendered into the final string.
- **Trust gating on project SYSTEM.md / APPEND_SYSTEM.md / AGENTS.md.** Project `<cwd>/.pi/SYSTEM.md` and `APPEND_SYSTEM.md` are loaded only when `isProjectTrusted()` is true (`resource-loader.ts:964-967, :978-981`). The global `~/.pi/agent/SYSTEM.md` and `APPEND_SYSTEM.md` floor is ungated (`:969-971, :983-985`) and survives headless RPC in untrusted cwds. `AGENTS.md` / `CLAUDE.md` context files are loaded regardless of trust (`docs/security.md`). Full trust resolution chain lives in **pi-architecture**.
- Extension hooks that can replace the system prompt (`before_agent_start` returning `systemPrompt`) are **pi-extensions** territory.
- `--system-prompt` and `--append-system-prompt` resolve via `resolvePromptInput` at `packages/coding-agent/src/core/resource-loader.ts:49-64` — file-if-exists, else literal text.
