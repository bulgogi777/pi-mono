# Known Issues

Bugs and behavioral surprises in pi's system-prompt assembly path. All cites against the current pin (`v0.79.10`, `8e190066`). Issues are listed with: symptom, root cause, workaround, and source pointers. When known, version markers track when an issue was first observed.

## Empty turns through `RpcClient` on the default-prompt branch (observed 0.71.1)

### Symptom

A host program embeds pi via `RpcClient` (subprocess), sends a `prompt` command, and receives `agent_start` → `agent_end` with no `message_*` events in between. The agent appears to do nothing, or returns empty assistant content. Reproducible **only** when:

- `--system-prompt` is **not** passed.
- `<cwd>/.pi/SYSTEM.md` and `~/.pi/agent/SYSTEM.md` are **not** present.

So pi takes the **default-prompt branch** (`packages/coding-agent/src/core/system-prompt.ts:82-171`) rather than the customPrompt branch (`:53-80`).

Once any of these holds, the issue goes away:

- Pass `--system-prompt "..."` (or `--system-prompt /path/to/file.md`).
- Place a `SYSTEM.md` at `<cwd>/.pi/SYSTEM.md` or `~/.pi/agent/SYSTEM.md`.
- Run pi interactively (`--mode rpc` is a precondition for the symptom).

### Where the two branches diverge

`buildSystemPrompt` chooses between two complete code paths:

- **customPrompt branch** (`system-prompt.ts:53-80`): `customPrompt` body verbatim → APPEND_SYSTEM → `<project_context>` XML block wrapping AGENTS.md (`:60-67`; pre-0.75.0 this was a `# Project Context` Markdown heading) → skills (gated on `read` tool, `:71`) → date → cwd. No auto-generated preamble, no auto-tools list, no auto-guidelines.
- **default-prompt branch** (`system-prompt.ts:82-171`): hard-coded `"You are an expert coding assistant…"` preamble (`:130-147`) → `Available tools:` table (filtered by `toolSnippets`, `:90-93`) → auto-derived `Guidelines:` block (`:112-125`) → Pi documentation block with absolute paths (`:140-147`) → APPEND_SYSTEM (`:149-151`) → `<project_context>` XML block (`:153-161`) → skills gate (`:164`) → date/cwd (`:168-170`).

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

See `discoverSystemPromptFile` at `resource-loader.ts:963-974` for the discovery order. **Trust-gating caveat (0.79.x):** the project `<cwd>/.pi/SYSTEM.md` path is gated by `isProjectTrusted()` (`:965`); in headless RPC without `--approve` or a saved trust decision, only the ungated global `~/.pi/agent/SYSTEM.md` (`:969-971`) loads. Trust resolution chain lives in **pi-architecture**.

### Status

Open as of 0.71.1. The default-prompt branch should arguably degrade more gracefully when `toolSnippets` is empty in an RPC host — at minimum, skipping the `Available tools:` block entirely rather than rendering `(none)`. No upstream fix landed yet.

## Historical note: project-context block migrated from Markdown headings to XML tags (0.75.0)

Pre-0.75.0, both branches emitted a Markdown `# Project Context` block with `## <absolute-path>` per file. PRs #4541 (`7577d3b8`) and #4709 (`aad8cf66`) changed both branches to wrap context in `<project_context>` / `<project_instructions path="...">` XML tags so models stop ingesting prompt content past the boundary when an AGENTS.md itself contains Markdown headings.

Current shape (both branches, at the current pin `v0.79.10` / `8e190066`):

```
\n\n<project_context>\n\n
Project-specific instructions and guidelines:\n\n
<project_instructions path="<absolute-path>">\n<content>\n</project_instructions>\n\n
... (repeats per context file) ...
</project_context>\n
```

CustomPrompt branch: `system-prompt.ts:60-67`. Default branch: `system-prompt.ts:153-161`. Both emit identical wrapping; the only behavioral difference between branches remains the auto-generated preamble/tools/guidelines/Pi-docs that the default branch prepends.

Kb material that referenced the old `# Project Context` / `## <abs-path>` shape was corrected in the 2026-05-23 `self-update` (see `.pi/kb/version-log.md`).

## Skills section is silently dropped when `selectedTools` is `[]`

### Symptom

A caller passes `selectedTools: []` (no tools at all), and the skills section vanishes from the system prompt — no `<available_skills>` block, no skill metadata in the prompt at all.

### Cause

In the **default-prompt branch**, the skills gate is `hasRead = tools.includes("read")` at `system-prompt.ts:110`, evaluated against the `selectedTools || ["read", "bash", "edit", "write"]` default at `:90`. With explicit `selectedTools: []`, `tools` is `[]`, `hasRead` is `false`, and the skills section at `:164` is skipped.

In the **customPrompt branch**, the gate is `customPromptHasRead = !selectedTools || selectedTools.includes("read")` at `:71`. The `!selectedTools` short-circuit means `undefined` lets skills through, but explicit `[]` still blocks them.

### Why this matters

The `<available_skills>` block is the model's only signal that skills exist (the body of each `SKILL.md` is loaded later via the `read` tool). Without a `read` tool and without the listing, skill invocation cannot work — even via `/skill:name`.

### Workaround

Always include `"read"` in `selectedTools` if you want skills to surface. If `read` is genuinely unavailable, skills cannot work in this configuration; consider alternatives (preset slash commands, prompt templates).

## Date rollover invalidates the system-prompt cache

### Symptom

First request after midnight local time produces a full `cacheWrite` for the system prompt, even though nothing about the user-facing config changed.

### Cause

`buildSystemPrompt` appends `\nCurrent date: YYYY-MM-DD` as the very last system-prompt line before `\nCurrent working directory:` (`system-prompt.ts:77` for customPrompt branch, `:169` for default; at pin `v0.79.10` / `8e190066`). When `YYYY-MM-DD` rolls over, the system-prompt text changes, and Anthropic cache breakpoint #1b (`providers/anthropic.ts:950`) or #2 (`:941` in OAuth mode) invalidates.

### Status

By design — the LLM benefits from knowing the current date. The cache cost is one full system-prompt write per day. Not configurable.

### Workaround

None upstream. Hosts that re-run pi for many short sessions per day pay this cost once per session-start. Long-running interactive sessions amortize it across many turns.

## Cross-references

- The branches in detail (assembly order, conditions, what each section emits): `reference/assembly-order.md`.
- Cache breakpoint sites and the per-edit invalidation cascade: `reference/cache-breakpoints.md`.
- OAuth identity preamble (separate breakpoint, separate cache lifecycle): `reference/oauth-identity-preamble.md`.
- The `discoverSystemPromptFile` and `discoverAppendSystemPromptFile` discovery rules: **pi-architecture** `reference/discovery-paths.md`.
- `--system-prompt` flag mechanics: **pi-architecture** `reference/cli-flags.md`.
