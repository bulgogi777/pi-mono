# Known Issues

Bugs and surprises in pi's system-prompt assembly. All cites are against the current pin (`v0.87.1`, `f07218c4`) and `packages/coding-agent/src/core/system-prompt.ts` unless another file is named. Each issue gives the symptom, root cause, workaround and source pointers, plus version markers where known.

> **Re-derived 2026-09-22 for 0.87.0.** The two-branch `buildSystemPrompt` these issues were written against no longer exists. The prompt is now named sections (see `reference/assembly-order.md`). Each issue below is re-expressed in section terms, and its old branch/line references are gone. Two issues are new in 0.87 (the last two sections).

## Empty turns through `RpcClient` when no custom prompt is set (observed 0.71.1)

### Symptom

A host embeds pi through `RpcClient` (a subprocess) and sends a `prompt`. It receives `agent_start` → `agent_end` with no `message_*` events in between, or empty assistant content. The symptom reproduces **only** when both hold:

- `--system-prompt` is **not** passed.
- Neither `<cwd>/.pi/SYSTEM.md` nor `~/.pi/agent/SYSTEM.md` exists.

In that case `customPrompt` is unset, so `buildSystemPromptSections` emits pi’s stock preamble plus the default `tools`, `rules` and `docs` sections (`core/system-prompt.ts:145-160`). With `customPrompt` set, only the preamble is replaced and those three are skipped (`:143-144`).

### Why it shows up through `RpcClient`

The `tools` section lists only tools that have a `toolSnippets` entry and renders `(none)` otherwise (`:148-151`). An RPC host usually supplies no snippets, so the prompt claims no tools while the `rules` section (`buildRules`, `:81-118`) still gives read/bash/grep guidance. The model gets conflicting signals. How that becomes an empty turn depends on the model.

### Workaround

Pass any non-empty `--system-prompt`. The check is a truthy `if (customPrompt)` (`:143`), so even `" "` works. Alternatively, supply a `SYSTEM.md`. `discoverSystemPromptFile` (`core/resource-loader.ts:1027-1039`) prefers project over global, and the project path is **trust-gated** (`:1029`): headless RPC without `--approve` or a saved trust decision loads only the global file (`:1033`).

```ts
const client = new RpcClient({ args: ["--system-prompt", "You are a helpful coding assistant."] });
```

### Status

Open as of 0.71.1; not re-tested at 0.87.1. No upstream fix has landed. The sectioned builder still renders `tools` as `(none)` rather than omitting it.

## Project-context block: from Markdown headings to XML (0.75.0), then to a section (0.87.0)

Before 0.75.0 the block was a Markdown `# Project Context` heading with `## <absolute-path>` per file. PRs #4541 (`7577d3b8`) and #4709 (`aad8cf66`) moved it to XML so a Markdown heading inside an AGENTS.md cannot escape the block. Since 0.87.0 the block is the `project_context` **section** (`:164`). Its body comes from `renderProjectContext` (`:72-79`) and the section wrapper adds the outer tags (`:175-178`):

```
<project_context>
Project-specific instructions and guidelines:

<project_instructions path="<absolute-path>">
<content>
</project_instructions>

… (one per context file, joined by a blank line) …
</project_context>
```

It is emitted only when `contextFiles.length > 0`. With or without `--system-prompt`, the rendering is the same.

## Skills section silently dropped when neither `read` nor `bash` is selected

### Symptom

No `<available_skills>` block and no skill metadata in the prompt, typically when a caller passes `selectedTools: []`.

### Cause

A single gate: `skillFileReadTool = (["read", "bash"] as const).find((tool) => selectedTools.includes(tool))` (`:165`), applied at `:166`. `selectedTools` defaults to `["read", "bash", "edit", "write"]` in `normalizeBuildSystemPromptOptions` (`:58`), so `undefined` lets skills through only because the default contains `read`. An explicit `[]` drops them.

> **History.** Before 0.85.0 (upstream #8552) the gate was `read`-only, so a `bash`-only tool set lost every skill. 0.85.0 widened it to `read` OR `bash`. 0.87.0 left it unchanged but moved it into the single sections builder.

### Why it matters

`<available_skills>` is the model's only signal that skills exist. A `SKILL.md` body is loaded on demand with a tool call. Listing skills the agent cannot open would be dead weight, which is the whole rationale for the gate.

### Workaround

Include `read` (or `bash`) in `selectedTools`. Without either, skills cannot work. Use prompt templates or slash commands instead.

## Date rollover invalidated the system-prompt cache (RESOLVED in 0.80.x)

Before 0.80.x, `\nCurrent date: YYYY-MM-DD` sat just before the cwd line, so the first request after local midnight rewrote the cached system block. The line was removed in 0.80.x (`f4e9ca74`, #6621). The prompt now ends with the `<cwd>` section (`:170`), which contains no date. A host that needs the date must inject it per turn, outside the cached prefix.

## NEW in 0.87: a `before_agent_start` handler that returns `systemPrompt` opts the session out of prompt patching

### Symptom

Pi 0.87 appends mid-session prompt changes as cheap section patches on models that support mid-conversation system messages (`reference/cache-breakpoints.md`). A session whose extension returns `systemPrompt` never gets that: each change rewrites the head and invalidates the whole cached prefix, even on Opus.

### Cause

A returned `systemPrompt` becomes `forceSystemPrompt` (`core/extensions/runner.ts`, `emitBeforeAgentStart` `:1312-1364`). A forced prompt is opaque: `buildSystemPromptState` returns content with no sections (`:186-192`). At request time `_installAgentForcedPromptProjection` (`core/agent-session.ts:1433-1448`) collapses every system message into a single head holding the forced text. The transcript still records the structured sections, so the loss applies only to what is sent.

**On this box:** `~/.pi/agent/extensions/pai-context.ts` returns `systemPrompt` (`${ev.systemPrompt}\n\n${injected}`) in every pi session, and apex-app's `cora-context-inject` does the same in Cora sessions. Every APEX session is on this path. Nothing breaks: chaining still works, because a second handler's `event.systemPrompt` getter renders the options the first handler already forced (`runner.ts:1318`). The cost is that prompt caching depends on the injected text staying byte-identical from turn to turn.

### Workaround

Mutate `event.systemPromptOptions` instead of returning a string. It is `NormalizedBuildSystemPromptOptions`, with mutable `sections`; later handlers see the mutations, and the structure survives. `event.systemPrompt` is `readonly` since 0.87.0, so assigning to it is also a type error.

## NEW in 0.87: exact-text assertions on the system prompt break

The rendered prompt now carries literal `<addendum>`, `<project_context>`, `<skills>` and `<cwd>` wrappers (`:175-178`). Before 0.87 the same content was bare concatenated text. A test or tool that asserts on system-prompt text or a leading substring must expect the wrappers. The `preamble` section is **not** wrapped, so a check limited to the first line (the `--system-prompt` text) still holds.

## Cross-references

- Section order and the transcript-backed prompt: `reference/assembly-order.md`.
- Breakpoint sites and the per-model invalidation cascade: `reference/cache-breakpoints.md`.
- OAuth identity preamble: `reference/oauth-identity-preamble.md`.
- `discoverSystemPromptFile` / `discoverAppendSystemPromptFile`: **pi-architecture** `reference/discovery-paths.md`.
- `before_agent_start` result contract: **pi-extensions** `reference/hook-events.md`.
