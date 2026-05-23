# Known Issues

Bugs and behavioral surprises in pi's system-prompt assembly path. All cites against pi-mono `HEAD`. Issues are listed with: symptom, root cause, workaround, and source pointers. When known, version markers track when an issue was first observed.

## Empty turns through `RpcClient` on the default-prompt branch (observed 0.71.1)

### Symptom

A host program embeds pi via `RpcClient` (subprocess), sends a `prompt` command, and receives `agent_start` → `agent_end` with no `message_*` events in between. The agent appears to do nothing, or returns empty assistant content. Reproducible **only** when:

- `--system-prompt` is **not** passed.
- `<cwd>/.pi/SYSTEM.md` and `~/.pi/agent/SYSTEM.md` are **not** present.

So pi takes the **default-prompt branch** (`packages/coding-agent/src/core/system-prompt.ts:80-167`) rather than the customPrompt branch (`:53-77`).

Once any of these holds, the issue goes away:

- Pass `--system-prompt "..."` (or `--system-prompt /path/to/file.md`).
- Place a `SYSTEM.md` at `<cwd>/.pi/SYSTEM.md` or `~/.pi/agent/SYSTEM.md`.
- Run pi interactively (`--mode rpc` is a precondition for the symptom).

### Where the two branches diverge

`buildSystemPrompt` chooses between two complete code paths:

- **customPrompt branch** (`system-prompt.ts:53-77`): `customPrompt` body verbatim → APPEND_SYSTEM → `# Project Context` (AGENTS.md) → skills (gated on `read` tool, `:71`) → date → cwd. No auto-generated preamble, no auto-tools list, no auto-guidelines.
- **default-prompt branch** (`system-prompt.ts:80-167`): hard-coded `"You are an expert coding assistant…"` preamble (`:131-145`) → `Available tools:` table (filtered by `toolSnippets`, `:90-92`) → auto-derived `Guidelines:` block (`:108-128`) → Pi documentation block with absolute paths (`:142-145`) → APPEND_SYSTEM (`:147-149`) → `# Project Context` (`:152-158`) → skills gate (`:163`) → date/cwd (`:166-167`).

The default branch is much longer. Section ordering is identical from APPEND_SYSTEM onward; the difference is the preamble + tools + guidelines + docs that prepends.

### Why it manifests through `RpcClient` specifically

The default branch's tools list (`Available tools:` at `:90-92`) only fills in for tools where `toolSnippets[name]` is set. In an RPC-host setup, the host typically provides no `toolSnippets` because tools are negotiated programmatically. The result is `(none)` for the tools list (`:91`). Combined with the auto-derived guidelines that reference `read`/`bash`/`grep`/`find`/`ls` (`:108-128`), the resulting system prompt can give the model conflicting signals — "you have these tools" but the tool list is empty.

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

See `discoverSystemPromptFile` at `resource-loader.ts:844-856` for the discovery order.

### Status

Open as of 0.71.1. The default-prompt branch should arguably degrade more gracefully when `toolSnippets` is empty in an RPC host — at minimum, skipping the `Available tools:` block entirely rather than rendering `(none)`. No upstream fix landed yet.

## customPrompt branch silently drops the auto-discovered `# Project Context` preamble line

### Symptom

The `# Project Context` block in the customPrompt branch (`system-prompt.ts:60-67`) doesn't include the `"Project-specific instructions and guidelines:\n\n"` preamble that the default branch emits. Wait — actually both branches emit it (`:62` and `:154`). This is **not** an issue; documenting the structure here for parity.

(Skipping to next real issue.)

## Skills section is silently dropped when `selectedTools` is `[]`

### Symptom

A caller passes `selectedTools: []` (no tools at all), and the skills section vanishes from the system prompt — no `<available_skills>` block, no skill metadata in the prompt at all.

### Cause

In the **default-prompt branch**, the skills gate is `hasRead = tools.includes("read")` at `system-prompt.ts:106`, evaluated against the `selectedTools || ["read", "bash", "edit", "write"]` default at `:88`. With explicit `selectedTools: []`, `tools` is `[]`, `hasRead` is `false`, and the skills section at `:163` is skipped.

In the **customPrompt branch**, the gate is `customPromptHasRead = !selectedTools || selectedTools.includes("read")` at `:70`. The `!selectedTools` short-circuit means `undefined` lets skills through, but explicit `[]` still blocks them.

### Why this matters

The `<available_skills>` block is the model's only signal that skills exist (the body of each `SKILL.md` is loaded later via the `read` tool). Without a `read` tool and without the listing, skill invocation cannot work — even via `/skill:name`.

### Workaround

Always include `"read"` in `selectedTools` if you want skills to surface. If `read` is genuinely unavailable, skills cannot work in this configuration; consider alternatives (preset slash commands, prompt templates).

## Date rollover invalidates the system-prompt cache

### Symptom

First request after midnight local time produces a full `cacheWrite` for the system prompt, even though nothing about the user-facing config changed.

### Cause

`buildSystemPrompt` appends `\nCurrent date: YYYY-MM-DD` as the very last system-prompt line (`system-prompt.ts:76` for customPrompt branch, `:166` for default). When `YYYY-MM-DD` rolls over, the system-prompt text changes, and Anthropic cache breakpoint #1b (`anthropic.ts:907`) or #2 (`:898` in OAuth mode) invalidates.

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
