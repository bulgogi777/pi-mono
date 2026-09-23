# System Prompt Assembly Order

What pi's system prompt is made of, in what order, and where it goes. All cites are against `packages/coding-agent/src/core/system-prompt.ts` at the current pin (`v0.87.1`, `f07218c4`) unless another file is named.

> **Rewritten 2026-09-22 for 0.87.0.** Before 0.87.0, `buildSystemPrompt` concatenated one string through one of two branches: `customPrompt` (early return) or default. **Both branches are gone.** The prompt is now a set of **named sections**. Pi stores it **in the session transcript** as a system message, and when it changes, pi appends a section patch instead of rewriting the head. For the pre-0.87 layout, read this file at a pre-0.87 commit (e.g. `git show afdbe1759:.pi/skills/pi-prompt-assembly/reference/assembly-order.md`). None of its line numbers or branch descriptions survive.

## Entry points

| Function | Lines | Returns |
|---|---|---|
| `normalizeBuildSystemPromptOptions(input)` | `core/system-prompt.ts:54-70` | A defensive copy with defaults filled. `selectedTools` defaults to `["read", "bash", "edit", "write"]` (`:58`). |
| `buildSystemPromptSections(input)` | `:121-179` | `SystemPromptSections`, a `Record<string, string>` in insertion order. This is the prompt. |
| `buildSystemPromptState(input)` | `:186-192` | `{ content: forced }` with **no sections** if `forceSystemPrompt` is set; otherwise `{ content: "", sections }`. |
| `buildSystemPrompt(input)` | `:195-197` | The rendered string: `getSystemMessageText` over the state (`packages/ai/src/utils/text.ts:15-21`). It matches what the transcript's system message replays. |
| `diffSystemPromptSections(previous, current)` | `:204-216` | A `sections` patch (changed text, or `null` for a removed section), or `undefined` when nothing changed. |

`BuildSystemPromptOptions` (`:9-32`) adds two inputs since 0.86/0.87. `forceSystemPrompt` (`:13`) is an opaque full replacement, set when a `before_agent_start` handler returns `systemPrompt`. `sections` (`:25`) holds caller-supplied named sections.

## Section order

`buildSystemPromptSections` fills an ordered record (`:142-173`), then wraps every section except `preamble` in XML tags named after the section (`:175-178`: `` `<${name}>\n${content}\n</${name}>` ``). `getSystemMessageText` joins the sections with blank lines, in insertion order.

| # | Section | Present when | Content | Lines |
|---|---|---|---|---|
| 1 | `preamble` | always | `customPrompt` verbatim if set (`:143-144`), otherwise pi's stock line: *"You are an expert coding assistant operating inside pi, a coding agent harness…"* (`:146-147`). **Not XML-wrapped.** | `:143-147` |
| 2 | `tools` | no `customPrompt` | `- name: snippet` for each selected tool with a `toolSnippets` entry, else `(none)`, then a line about custom tools | `:148-151` |
| 3 | `rules` | no `customPrompt` | `buildRules(...)` (`:81-118`), deduped through the `seen` set (`:87-92`). File-exploration guidance goes first: with bash and/or PowerShell but no grep/find/ls, "Use bash for file operations like ls, rg, find" (`:100-109`). Then per-tool `toolGuidelines` (new in 0.86/0.87), caller `promptGuidelines`, and the fixed tail "Be concise…" and "Show file paths clearly…" | `:152` |
| 4 | `docs` | no `customPrompt` | Pi documentation pointers: README, `docs/`, `examples/` paths from `getReadmePath` / `getDocsPath` / `getExamplesPath` | `:153-160` |
| 5 | `addendum` | `appendSystemPrompt` non-empty | APPEND_SYSTEM.md and/or `--append-system-prompt` | `:163` |
| 6 | `project_context` | `contextFiles.length > 0` | `renderProjectContext` (`:72-79`): "Project-specific instructions and guidelines:" then one `<project_instructions path="…">` block per AGENTS.md / CLAUDE.md | `:164` |
| 7 | `skills` | a skill-file tool exists **and** `skills.length > 0` | `formatSkillsForPrompt(skills, skillFileReadTool)`, see below | `:165-169` |
| 8 | `cwd` | always | the working directory, backslashes normalized to `/` | `:170` |
| 9+ | custom sections | caller passes `sections` | any name matching `/^[a-z][a-z0-9_-]*$/` (`:52`) except `preamble`. An invalid name **throws** (`:136-140`). Empty content is skipped. | `:171-173` |

**What `--system-prompt` changes, and what it doesn't.** It swaps the preamble (1) and drops the default `tools`, `rules` and `docs` sections (2–4). `addendum`, `project_context`, `skills` and `cwd` (5–8) are appended either way. Pre-0.87 it behaved the same, but through a separate branch. Billing still turns on the preamble: pi's stock line self-identifies as "a coding agent harness", which is what makes Anthropic classify the traffic as a third-party app.

**What a consumer sees:** since 0.87 the rendered prompt contains literal `<addendum>`, `<project_context>`, `<skills>` and `<cwd>` wrappers. Consumers used to receive bare concatenated text. Any test or tool that asserts on system-prompt text must expect the wrappers.

## Skill-file-read-tool gate

`skillFileReadTool = (["read", "bash"] as const).find((tool) => selectedTools.includes(tool))` (`:165`). Skills render only when it resolves (`:166`). The gate is the same as 0.85.0 (upstream #8552), when it widened from `read` only to `read` OR `bash`, but it now lives in one place because there is only one builder. `selectedTools: []`, or any list containing neither tool, drops every skill silently.

## The skills section holds only metadata

`formatSkillsForPrompt(skills, fileReadTool)` at `packages/coding-agent/src/core/skills.ts:355-383` renders `<available_skills>` with `name` / `description` / `location` per skill. Skills with `disableModelInvocation: true` are filtered out at `:356`. The instruction line names the resolved tool (`:365-366`). **A `SKILL.md` body never enters the system prompt**; the model loads it with a tool call when a description matches.

## The prompt lives in the transcript (0.86/0.87)

The step that most changes how cost and caching reason about the prompt:

1. At the start of each run, `AgentSession._preparePromptAndToolLoadout` (`core/agent-session.ts:1407-1421`) builds the current sections and diffs them against the sections the model already has, replayed from the transcript by `getCurrentSystemMessage` (`:1416-1419`).
2. If anything changed, it returns a **system message whose `sections` is only the patch**, and that message is persisted into the session (`:1420`). On a fresh session, the first such message carries every section.
3. At request time the provider receives the transcript, system messages included, and decides what to send. See `reference/cache-breakpoints.md`. Models with `supportsMidConvoSystemMessages` get the patch in place, rendered by `renderSystemMessageUpdate` (`packages/ai/src/utils/text.ts:28-40`) as "Updated system prompt section "name": …". Other models get the transcript collapsed so the current full prompt leads (`packages/ai/src/utils/transcript.ts:108-120`).

**Consequence:** editing AGENTS.md, a skill description, or APPEND_SYSTEM.md mid-session no longer silently replaces the prompt for the rest of the session. It appends a durable, replayable patch that survives resume and branch navigation (0.86.0, #9548).

### The forced-prompt exception

A `before_agent_start` handler that **returns** `systemPrompt` sets `forceSystemPrompt` (`core/extensions/runner.ts`, `emitBeforeAgentStart` `:1312-1364`). A second handler's `event.systemPrompt` is a getter over the same options (`runner.ts:1318`), so it sees the first handler's text and chaining is preserved. A forced prompt is **opaque**: `buildSystemPromptState` returns content with no sections. The transcript still records the structured sections, but `_installAgentForcedPromptProjection` (`core/agent-session.ts:1433-1448`, JSDoc from `:1422`) collapses every system message into **one head holding the forced text** at request time. A forced prompt therefore opts the session out of mid-conversation patching, whatever the model supports. The 0.87-native alternative is to **mutate** `event.systemPromptOptions` (`NormalizedBuildSystemPromptOptions`, mutable sections), which keeps the structure. `event.systemPrompt` is `readonly` since 0.87.0.

## Cross-references

- Loading `contextFiles` (the AGENTS.md / CLAUDE.md ancestor walk) and `skills` belongs to **pi-architecture** (`reference/discovery-paths.md`).
- **Trust gating.** Project `<cwd>/.pi/SYSTEM.md` and `APPEND_SYSTEM.md` load only when `isProjectTrusted()` is true (`core/resource-loader.ts:1028-1029`, `:1042-1043`). The global `~/.pi/agent/SYSTEM.md` / `APPEND_SYSTEM.md` floor is ungated (`:1033`, `:1047`). The full resolution chain belongs to **pi-architecture**.
- `--system-prompt` and `--append-system-prompt` resolve through `resolvePromptInput` (`core/resource-loader.ts:54`): the file if it exists, otherwise literal text.
- The `before_agent_start` result contract belongs to **pi-extensions** (`reference/hook-events.md`).
