# Known Issues

Bugs and behavioral surprises in pi's system-prompt assembly path. All cites against the current pin (`v0.84.1`, `53fa77cc`). Issues are listed with: symptom, root cause, workaround, and source pointers. When known, version markers track when an issue was first observed.

## Empty turns through `RpcClient` on the default-prompt branch (observed 0.71.1)

### Symptom

A host program embeds pi via `RpcClient` (subprocess), sends a `prompt` command, and receives `agent_start` → `agent_end` with no `message_*` events in between. The agent appears to do nothing, or returns empty assistant content. Reproducible **only** when:

- `--system-prompt` is **not** passed.
- `<cwd>/.pi/SYSTEM.md` and `~/.pi/agent/SYSTEM.md` are **not** present.

So pi takes the **default-prompt branch** (`packages/coding-agent/src/core/system-prompt.ts:74-161`) rather than the customPrompt branch (`:46-72`).

Once any of these holds, the issue goes away:

- Pass `--system-prompt "..."` (or `--system-prompt /path/to/file.md`).
- Place a `SYSTEM.md` at `<cwd>/.pi/SYSTEM.md` or `~/.pi/agent/SYSTEM.md`.
- Run pi interactively (`--mode rpc` is a precondition for the symptom).

### Where the two branches diverge

`buildSystemPrompt` chooses between two complete code paths:

- **customPrompt branch** (`core/system-prompt.ts:46-72`): `customPrompt` body verbatim → APPEND_SYSTEM → `<project_context>` XML block wrapping AGENTS.md (`:54-61`; pre-0.75.0 this was a `# Project Context` Markdown heading) → skills (gated on `read` tool, `:65`) → cwd (the `Current date:` line was removed in 0.80.x). No auto-generated preamble, no auto-tools list, no auto-guidelines.
- **default-prompt branch** (`core/system-prompt.ts:74-161`): hard-coded `"You are an expert coding assistant…"` preamble (`:121-138`) → `Available tools:` table (filtered by `toolSnippets`, `:82-84`) → auto-derived `Guidelines:` block (built `:87-119`, rendered `:128-129`) → Pi documentation block with absolute paths (`:131-138`) → APPEND_SYSTEM (`:140-142`) → `<project_context>` XML block (`:145-152`) → skills gate (`:155`) → cwd (`:159`; no date line since 0.80.x).

The default branch is much longer. Section ordering is identical from APPEND_SYSTEM onward; the difference is the preamble + tools + guidelines + docs that prepends.

### Why it manifests through `RpcClient` specifically

The default branch's tools list (`Available tools:` at `:90-93`) only fills in for tools where `toolSnippets[name]` is set. In an RPC-host setup, the host typically provides no `toolSnippets` because tools are negotiated programmatically. The result is `(none)` for the tools list (`:93`). Combined with the auto-derived guidelines that reference `read`/`bash`/`grep`/`find`/`ls` (`:112-125`), the resulting system prompt can give the model conflicting signals — "you have these tools" but the tool list is empty.

The exact mechanism by which this produces empty assistant turns is environment-dependent (model-specific); the pragmatic fix is to force the customPrompt branch.

### Workaround

Pass any non-empty `--system-prompt` value. Even `--system-prompt " "` flips pi into the customPrompt branch (`:53` is `if (customPrompt)` — truthy check on the resolved string). For host code:

```ts
const client = new RpcClient({
  args: ["--system-prompt", "You are a helpful coding assistant."],
  // ...
});
```

Or supply a `SYSTEM.md` at one of the auto-discovery paths:

- `<cwd>/.pi/SYSTEM.md` (project, wins)
- `~/.pi/agent/SYSTEM.md` (global)

See `discoverSystemPromptFile` at `resource-loader.ts:1022-1034` for the discovery order. **Trust-gating caveat (0.79.x):** the project `<cwd>/.pi/SYSTEM.md` path is gated by `isProjectTrusted()` (`:1024`); in headless RPC without `--approve` or a saved trust decision, only the ungated global `~/.pi/agent/SYSTEM.md` (`:1022-1024`) loads. Trust resolution chain lives in **pi-architecture**.

### Status

Open as of 0.71.1. The default-prompt branch should arguably degrade more gracefully when `toolSnippets` is empty in an RPC host — at minimum, skipping the `Available tools:` block entirely rather than rendering `(none)`. No upstream fix landed yet.

## Historical note: project-context block migrated from Markdown headings to XML tags (0.75.0)

Pre-0.75.0, both branches emitted a Markdown `# Project Context` block with `## <absolute-path>` per file. PRs #4541 (`7577d3b8`) and #4709 (`aad8cf66`) changed both branches to wrap context in `<project_context>` / `<project_instructions path="...">` XML tags so models stop ingesting prompt content past the boundary when an AGENTS.md itself contains Markdown headings.

Current shape (both branches, at the current pin `v0.84.1` / `53fa77cc`):

```
\n\n<project_context>\n\n
Project-specific instructions and guidelines:\n\n
<project_instructions path="<absolute-path>">\n<content>\n</project_instructions>\n\n
... (repeats per context file) ...
</project_context>\n
```

CustomPrompt branch: `core/system-prompt.ts:60-67`. Default branch: `core/system-prompt.ts:153-161`. Both emit identical wrapping; the only behavioral difference between branches remains the auto-generated preamble/tools/guidelines/Pi-docs that the default branch prepends.

Kb material that referenced the old `# Project Context` / `## <abs-path>` shape was corrected in the 2026-05-23 `self-update` (see `.pi/kb/version-log.md`).

## Skills section is silently dropped when `selectedTools` is `[]`

### Symptom

A caller passes `selectedTools: []` (no tools at all), and the skills section vanishes from the system prompt — no `<available_skills>` block, no skill metadata in the prompt at all.

### Cause

In the **default-prompt branch**, the skills gate is `hasRead = tools.includes("read")` at `core/system-prompt.ts:110`, evaluated against the `selectedTools || ["read", "bash", "edit", "write"]` default at `:90`. With explicit `selectedTools: []`, `tools` is `[]`, `hasRead` is `false`, and the skills section at `:197` is skipped.

In the **customPrompt branch**, the gate is `customPromptHasRead = !selectedTools || selectedTools.includes("read")` at `:71`. The `!selectedTools` short-circuit means `undefined` lets skills through, but explicit `[]` still blocks them.

### Why this matters

The `<available_skills>` block is the model's only signal that skills exist (the body of each `SKILL.md` is loaded later via the `read` tool). Without a `read` tool and without the listing, skill invocation cannot work — even via `/skill:name`.

### Workaround

Always include `"read"` in `selectedTools` if you want skills to surface. If `read` is genuinely unavailable, skills cannot work in this configuration; consider alternatives (preset slash commands, prompt templates).

## Date rollover invalidates the system-prompt cache — RESOLVED in 0.80.x

### Symptom (historical)

Pre-0.80.x: the first request after midnight local time produced a full `cacheWrite` for the system prompt, even though nothing about the user-facing config changed.

### Cause (historical)

`buildSystemPrompt` used to append `\nCurrent date: YYYY-MM-DD` as the very last system-prompt line before `\nCurrent working directory:`. When `YYYY-MM-DD` rolled over, the system-prompt text changed, and Anthropic cache breakpoint #1b (now `api/anthropic-messages.ts:988`) or #2 (`:978` in OAuth mode) invalidated.

### Status

**Resolved.** The `Current date:` line was removed from the system prompt entirely in 0.80.x (commit `f4e9ca74`, fixes #6621). `buildSystemPrompt` now ends at `\nCurrent working directory:` (`core/system-prompt.ts:69` customPrompt branch, `:159` default) with no date, so this daily cache invalidation no longer occurs. If a host needs the model to know the date, it must inject it itself (e.g. via a per-prompt context block), which keeps it out of the cached system prefix.

### Workaround

No longer needed — the date is no longer in the system prompt. (Pre-0.80.x there was no upstream workaround; hosts re-running pi for many short sessions per day paid the cost once per session-start.)

## Cross-references

- The branches in detail (assembly order, conditions, what each section emits): `reference/assembly-order.md`.
- Cache breakpoint sites and the per-edit invalidation cascade: `reference/cache-breakpoints.md`.
- OAuth identity preamble (separate breakpoint, separate cache lifecycle): `reference/oauth-identity-preamble.md`.
- The `discoverSystemPromptFile` and `discoverAppendSystemPromptFile` discovery rules: **pi-architecture** `reference/discovery-paths.md`.
- `--system-prompt` flag mechanics: **pi-architecture** `reference/cli-flags.md`.
