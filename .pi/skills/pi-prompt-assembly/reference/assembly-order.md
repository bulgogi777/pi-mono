# System Prompt Assembly Order

Section-by-section breakdown of what `buildSystemPrompt` produces, branch by branch. All cites against `packages/coding-agent/src/core/system-prompt.ts` at the current pin (`v0.84.1`, `53fa77cc`). Note: in 0.80.x the `Current date:` line was **removed** from the system prompt (commit `f4e9ca74`, fixes #6621), shifting all line numbers in this file down by ~10.

## Entry point

`buildSystemPrompt(options: BuildSystemPromptOptions)` at `system-prompt.ts:28-162`.

Inputs:
- `customPrompt?: string` — if set, the function takes the **customPrompt branch** (`:46-72`). Otherwise the **default-prompt branch** (`:74-161`) builds pi's stock prompt from scratch.
- `selectedTools?: string[]` — defaults internally to `["read", "bash", "edit", "write"]` at `:81`. Tool list determines (a) the `Available tools:` rendering, (b) which guidelines fire, and (c) whether the skills section is included.
- `toolSnippets?: Record<string, string>` — one-line descriptions keyed by tool name. A tool is only listed in `Available tools:` when a snippet is supplied (`:82-84`).
- `promptGuidelines?: string[]` — extra bullets appended to the auto-generated guidelines.
- `appendSystemPrompt?: string` — pre-resolved text from `--append-system-prompt` and/or `APPEND_SYSTEM.md`.
- `cwd: string` — working directory; appears as the trailing `Current working directory:` line.
- `contextFiles?: Array<{ path; content }>` — pre-loaded by `loadProjectContextFiles` (lives in **pi-architecture** territory; here we just consume them).
- `skills?: Skill[]` — pre-loaded skill metadata. Bodies are **not** in scope; only `name`, `description`, `filePath` get rendered (see `formatSkillsForPrompt` below).

Common preamble (both branches): `appendSection` at `:41`, `promptCwd` (backslashes normalized to forward) at `:39`. (There is no longer a `Current date:` line — it was removed in 0.80.x.)

## Branch 1 — `customPrompt` (lines 46-72)

Order in the assembled string:

1. **Custom prompt body** — verbatim `customPrompt` (`:47`).
2. **APPEND_SYSTEM section** — `\n\n` + `appendSystemPrompt` (`:49-51`). Skipped when empty.
3. **`<project_context>` block** — emitted only if `contextFiles.length > 0` (`:54-61`). The block opens with `\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n`. Each file becomes `<project_instructions path="<absolute-path>">\n<content>\n</project_instructions>\n\n`. The block closes with `</project_context>\n`. **Pre-0.75.0** this section used a `# Project Context` Markdown heading with `## <abs-path>` per file; PRs #4541 (`7577d3b8`) and #4709 (`aad8cf66`) switched both branches to XML tags so models do not ingest prompt content past the boundary.
4. **Skills section** — `formatSkillsForPrompt(skills)` appended only when both conditions hold (`:64-65`):
   - `customPromptHasRead = !selectedTools || selectedTools.includes("read")` (`:64`). If `selectedTools` is undefined the gate is open; explicit tool lists must include `"read"`.
   - `skills.length > 0`.
5. **Trailing metadata** (`:69`):
   - `\nCurrent working directory: <cwd>` (backslashes normalized to forward at `:39`). The `Current date:` line that used to precede this was removed in 0.80.x.

The customPrompt branch contains **no** "You are an expert coding assistant…" preamble, **no** auto-generated `Available tools:` table, **no** auto-generated `Guidelines:` block, and **no** `Pi documentation` block. Everything pi normally inserts above APPEND_SYSTEM is the caller's responsibility.

## Branch 2 — default prompt (lines 74-161)

Order in the assembled string (built into a single `prompt` variable starting at `:121`):

1. **Hard-coded preamble** (`:121-138`): `"You are an expert coding assistant operating inside pi…"`.
2. **`Available tools:`** list (rendered via `${toolsList}` at `:124`). Built from `selectedTools` filtered to those with a `toolSnippets[name]` entry; falls back to `(none)` when empty (`:82-84`).
3. **Guidelines** (built `:87-119`, rendered via `${guidelines}` at `:128-129`). Auto-derived bullets:
   - File-exploration guideline: bash-only without grep/find/ls suggests `"Use bash for file operations like ls, rg, find"` (`:104-106`).
   - Caller-supplied `promptGuidelines` (`:108-113`), deduped via `guidelinesSet` (`:88-95`).
   - Always-on tail: `"Be concise in your responses"` and `"Show file paths clearly when working with files"` (`:116-117`).
4. **Pi documentation block** (`:131-138`). Hard-coded list of `docs/*.md` paths (extensions, themes, skills, prompt-templates, tui, keybindings, sdk, custom-provider, models, packages) plus the absolute paths from `getReadmePath() / getDocsPath() / getExamplesPath()` (`:75-77`).
5. **APPEND_SYSTEM section** (`:140-142`). Same `\n\n` + `appendSystemPrompt` pattern as the customPrompt branch.
6. **`<project_context>` block** (`:145-152`). Identical XML wrapping to customPrompt branch step 3 (same pre-0.75.0 migration note applies).
7. **Skills section** (`:154-156`). Gate is **only** `hasRead` here — `hasRead = tools.includes("read")` at `:101` — so the implicit-`undefined` shortcut from the customPrompt branch does **not** apply. If the caller passes `selectedTools: []` or any list lacking `"read"`, no skills.
8. **Trailing metadata** (`:159`). Same as customPrompt branch (`Current working directory:` only; no date line).

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

**The body of `SKILL.md` is never injected into the system prompt.** It is loaded later, on demand, when the model issues a `read` tool call against `<location>`. That is why the `read`-tool gate at `system-prompt.ts:65` (customPrompt, `customPromptHasRead`) and `:155` (default, `hasRead`) actually disables skills entirely — without `read`, the model cannot follow up on a skill listing.

## What this means for cache layout

The system prompt becomes a single string passed downstream as `context.systemPrompt`. The Anthropic provider (`packages/ai/src/api/anthropic-messages.ts`) wraps it in a single text block with a single `cache_control` breakpoint at `api/anthropic-messages.ts:988` (non-OAuth) or `:978` (OAuth user-system block, after the constant identity preamble at `:971`). Order matters: anything inserted earlier is part of the cached prefix; anything inserted later still falls inside the same cache block because the entire system prompt is one block. See `reference/cache-breakpoints.md` for the cascade rules.

## Cross-references

- The pre-loading of `contextFiles` (AGENTS.md / CLAUDE.md ancestor walk) and `skills` lives in **pi-architecture** (`reference/discovery-paths.md`). This skill only documents how those pre-loaded values get rendered into the final string.
- **Trust gating on project SYSTEM.md / APPEND_SYSTEM.md / AGENTS.md.** Project `<cwd>/.pi/SYSTEM.md` and `APPEND_SYSTEM.md` are loaded only when `isProjectTrusted()` is true (`resource-loader.ts:1023-1024, :980-981`). The global `~/.pi/agent/SYSTEM.md` and `APPEND_SYSTEM.md` floor is ungated (`:1024-1025, :985-986`) and survives headless RPC in untrusted cwds. `AGENTS.md` / `CLAUDE.md` context files are loaded regardless of trust (`docs/security.md`). Full trust resolution chain lives in **pi-architecture**.
- Extension hooks that can replace the system prompt (`before_agent_start` returning `systemPrompt`) are **pi-extensions** territory.
- `--system-prompt` and `--append-system-prompt` resolve via `resolvePromptInput` at `packages/coding-agent/src/core/resource-loader.ts:53-68` — file-if-exists, else literal text.
