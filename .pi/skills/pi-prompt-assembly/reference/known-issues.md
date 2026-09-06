# Known Issues

Bugs and behavioral surprises in pi's system-prompt assembly path. All cites against the current pin (`v0.85.1`, `d981de12`). Issues are listed with: symptom, root cause, workaround, and source pointers. When known, version markers track when an issue was first observed.

## Empty turns through `RpcClient` on the default-prompt branch (observed 0.71.1)

### Symptom

A host program embeds pi via `RpcClient` (subprocess), sends a `prompt` command, and receives `agent_start` → `agent_end` with no `message_*` events in between. The agent appears to do nothing, or returns empty assistant content. Reproducible **only** when:

- `--system-prompt` is **not** passed.
- `<cwd>/.pi/SYSTEM.md` and `~/.pi/agent/SYSTEM.md` are **not** present.

So pi takes the **default-prompt branch** (`packages/coding-agent/src/core/system-prompt.ts:75-167`) rather than the customPrompt branch (`:48-73`).

Once any of these holds, the issue goes away:

- Pass `--system-prompt "..."` (or `--system-prompt /path/to/file.md`).
- Place a `SYSTEM.md` at `<cwd>/.pi/SYSTEM.md` or `~/.pi/agent/SYSTEM.md`.
- Run pi interactively (`--mode rpc` is a precondition for the symptom).

### Where the two branches diverge

`buildSystemPrompt` chooses between two complete code paths:

- **customPrompt branch** (`core/system-prompt.ts:48-73`): `customPrompt` body verbatim → APPEND_SYSTEM → `<project_context>` XML block wrapping AGENTS.md (`:56-63`; pre-0.75.0 this was a `# Project Context` Markdown heading) → skills (gated on `read` tool, `:65`) → cwd (the `Current date:` line was removed in 0.80.x). No auto-generated preamble, no auto-tools list, no auto-guidelines.
- **default-prompt branch** (`core/system-prompt.ts:75-167`): hard-coded `"You are an expert coding assistant…"` preamble (`:127-144`) → `Available tools:` table (filtered by `toolSnippets`, `:82-84`) → auto-derived `Guidelines:` block (built `:87-125`, rendered `:134-135`) → Pi documentation block with absolute paths (`:137-144`) → APPEND_SYSTEM (`:146-148`) → `<project_context>` XML block (`:151-158`) → skills gate (`:155`) → cwd (`:165`; no date line since 0.80.x).

The default branch is much longer. Section ordering is identical from APPEND_SYSTEM onward; the difference is the preamble + tools + guidelines + docs that prepends.

### Why it manifests through `RpcClient` specifically

The default branch's tools list (`Available tools:` at `:90-93`) only fills in for tools where `toolSnippets[name]` is set. In an RPC-host setup, the host typically provides no `toolSnippets` because tools are negotiated programmatically. The result is `(none)` for the tools list (`:93`). Combined with the auto-derived guidelines that reference `read`/`bash`/`grep`/`find`/`ls` (`:118-131`), the resulting system prompt can give the model conflicting signals — "you have these tools" but the tool list is empty.

The exact mechanism by which this produces empty assistant turns is environment-dependent (model-specific); the pragmatic fix is to force the customPrompt branch.

### Workaround

Pass any non-empty `--system-prompt` value. Even `--system-prompt " "` flips pi into the customPrompt branch (`:55` is `if (customPrompt)` — truthy check on the resolved string). For host code:

```ts
const client = new RpcClient({
  args: ["--system-prompt", "You are a helpful coding assistant."],
  // ...
});
```

Or supply a `SYSTEM.md` at one of the auto-discovery paths:

- `<cwd>/.pi/SYSTEM.md` (project, wins)
- `~/.pi/agent/SYSTEM.md` (global)

See `discoverSystemPromptFile` at `resource-loader.ts:1023-1035` for the discovery order. **Trust-gating caveat (0.79.x):** the project `<cwd>/.pi/SYSTEM.md` path is gated by `isProjectTrusted()` (`:1025`); in headless RPC without `--approve` or a saved trust decision, only the ungated global `~/.pi/agent/SYSTEM.md` (`:1023-1025`) loads. Trust resolution chain lives in **pi-architecture**.

### Status

Open as of 0.71.1. The default-prompt branch should arguably degrade more gracefully when `toolSnippets` is empty in an RPC host — at minimum, skipping the `Available tools:` block entirely rather than rendering `(none)`. No upstream fix landed yet.

## Historical note: project-context block migrated from Markdown headings to XML tags (0.75.0)

Pre-0.75.0, both branches emitted a Markdown `# Project Context` block with `## <absolute-path>` per file. PRs #4541 (`7577d3b8`) and #4709 (`aad8cf66`) changed both branches to wrap context in `<project_context>` / `<project_instructions path="...">` XML tags so models stop ingesting prompt content past the boundary when an AGENTS.md itself contains Markdown headings.

Current shape (both branches, at the current pin `v0.85.1` / `d981de12`):

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

**Since 0.85.0** both branches share ONE gate, computed at `core/system-prompt.ts:46`:

```ts
const tools = selectedTools || ["read", "bash", "edit", "write"];               // :45
const skillFileReadTool = (["read", "bash"] as const).find((t) => tools.includes(t));  // :46
```

Applied at `:66` (customPrompt) and `:161` (default). With explicit `selectedTools: []`, `tools` is `[]`, `skillFileReadTool` is `undefined`, and the skills section is skipped in both branches.

> **Scope narrowed in 0.85.0 (upstream #8552).** Before 0.85.0 the gate was `read`-only — `hasRead = tools.includes("read")` in the default branch, `customPromptHasRead = !selectedTools || selectedTools.includes("read")` in the customPrompt branch. A **`bash`-only tool set therefore lost every skill**, which is the bug #8552 fixed. Two consequences for anything written against the old behavior: (a) `bash`-without-`read` is no longer a repro for this symptom; (b) the customPrompt branch's `!selectedTools` short-circuit is **gone** — `undefined` now lets skills through only because it falls back to the 4-tool default at `:45`, which contains `read`. Same outcome, different mechanism.

### Why this matters

The `<available_skills>` block is the model's only signal that skills exist (the body of each `SKILL.md` is loaded later, on demand). Without *either* reading tool and without the listing, skill invocation cannot work — even via `/skill:name`. That is the whole rationale for the gate: listing a skill the agent has no way to open is dead weight in the prompt.

### Workaround

Always include `"read"` in `selectedTools` if you want skills to surface. If `read` is genuinely unavailable, skills cannot work in this configuration; consider alternatives (preset slash commands, prompt templates).

## Date rollover invalidates the system-prompt cache — RESOLVED in 0.80.x

### Symptom (historical)

Pre-0.80.x: the first request after midnight local time produced a full `cacheWrite` for the system prompt, even though nothing about the user-facing config changed.

### Cause (historical)

`buildSystemPrompt` used to append `\nCurrent date: YYYY-MM-DD` as the very last system-prompt line before `\nCurrent working directory:`. When `YYYY-MM-DD` rolled over, the system-prompt text changed, and Anthropic cache breakpoint #1b (now `api/anthropic-messages.ts:1077`) or #2 (`:1067` in OAuth mode) invalidated.

### Status

**Resolved.** The `Current date:` line was removed from the system prompt entirely in 0.80.x (commit `f4e9ca74`, fixes #6621). `buildSystemPrompt` now ends at `\nCurrent working directory:` (`core/system-prompt.ts:69` customPrompt branch, `:165` default) with no date, so this daily cache invalidation no longer occurs. If a host needs the model to know the date, it must inject it itself (e.g. via a per-prompt context block), which keeps it out of the cached system prefix.

### Workaround

No longer needed — the date is no longer in the system prompt. (Pre-0.80.x there was no upstream workaround; hosts re-running pi for many short sessions per day paid the cost once per session-start.)

## Cross-references

- The branches in detail (assembly order, conditions, what each section emits): `reference/assembly-order.md`.
- Cache breakpoint sites and the per-edit invalidation cascade: `reference/cache-breakpoints.md`.
- OAuth identity preamble (separate breakpoint, separate cache lifecycle): `reference/oauth-identity-preamble.md`.
- The `discoverSystemPromptFile` and `discoverAppendSystemPromptFile` discovery rules: **pi-architecture** `reference/discovery-paths.md`.
- `--system-prompt` flag mechanics: **pi-architecture** `reference/cli-flags.md`.
