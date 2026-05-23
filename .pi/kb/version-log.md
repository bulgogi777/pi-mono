# version-log.md — pi-mono-expert

One entry per `self-update` run. Each records: previous pin, new pin, the diff scope, behavior changes that matter for this expert's territory, and which kb files were updated or flagged.

Citations: `<sha>` for commit; `<file>:<line>` against the **new pin** (unless otherwise stated).

---

## 2026-05-23 — pulled to `fc51a40d`

**Previous pin:** `e4163fe9` (2026-05-23, main HEAD at expert scaffold time)
**New pin:** `fc51a40d` (2026-05-23, `Merge pull request #4922 from earendil-works/horrifying-terminal-hack`)
**Diff scope:** 358 upstream commits, 764 files changed (+34,141 / −28,636). Of those, **96 commits touched pi-mono-expert territory paths** (`packages/coding-agent/src/{core,cli,modes}/`, `main.ts`). Releases tagged in range: `0.73.0`, `0.73.1`, `0.74.0`, `0.74.1`, `0.75.0`, `0.75.1`, `0.75.2`, `0.75.3`, `0.75.4`, `0.75.5`.
**Rebase:** clean. Expert commits replayed (`a364521c` → `81c6f7e1`); no `.pi/` conflicts. Upstream additions under `.pi/` (`extensions/*`, `prompts/*`, new `.pi/skills/add-llm-provider.md`) do not collide with the expert tree.

### Behavior changes that matter

**System prompt: XML boundaries replace Markdown headings (`0.75.0`, `0.74.x`)** — confidence: high
- `Updated the default system prompt to also use xml boundaries...` (`7577d3b8`, PR `#4541` by herrnel; reinforced by `aad8cf66` / PR `#4709`).
- Old: customPrompt and default branches emitted a `# Project Context` heading with `## <absolute-path>` per file.
- New: both branches emit `<project_context>\n\nProject-specific instructions and guidelines:\n\n<project_instructions path="...">CONTENT</project_instructions>\n\n</project_context>\n` (`system-prompt.ts:60-68` customPrompt, `:155-163` default).
- **This contradicts current `pi-prompt-assembly` kb** in multiple places — fixed in Step 4 below.

**`agent_end` events now carry `willRetry` (`0.75.4`)** — confidence: high
- `c685b273 fix(coding-agent): mark retrying agent end events`, `32bcdc97 fix(coding-agent): simplify agent session settlement`.
- Typed at `agent-session.ts:128, 143`; emitted at `agent-session.ts:496` via `_willRetryAfterAgentEnd` (`:542`).
- `pi-rpc` skill enumerates the agent-event stream but doesn't yet mention `willRetry`. Flagged for next `gap-scan`.

**`models.json` now accepts JSONC (comments + trailing commas) (`0.73.1`, PR `#4162` by julien-c)** — confidence: high
- `bb25a394 feat(coding-agent): allow comments and trailing commas in models.json`.
- Affects `pi-providers` skill (models.json discussion). Flagged for next `gap-scan`.

**Interactive OAuth login selection (`0.73.1`, PR `#4190` by mitsuhiko)** — confidence: high
- `b5755fd2 feat(oauth): support interactive login selection` + `c841a6c7 Clean up OAuth device-code callbacks` + `c554364c feat(ai): refactor device code login for copilot`.
- `/login` can now present multiple choices per provider. Affects `pi-providers/reference/auth-resolution.md` description of `/login`. Flagged for next `gap-scan`.

**Extension loader: jiti switched from `@mariozechner/jiti` fork to upstream `jiti` 2.7 (`0.73.1`, PR `#4244` by pi0)** — confidence: high
- `50993d74 chore(coding-agent): switch back from fork to upstream jiti 2.7`.
- `pi-extensions/reference/loading.md` should be re-verified (loader file `extensions/loader.ts` had +48/−54 line churn). Flagged for next `gap-scan`.

**Agent session refactor — settlement uses awaited lifecycle, not separate event queue (`0.75.4`)** — confidence: high
- `32bcdc97 fix(coding-agent): simplify agent session settlement`.
- `agent-session.ts` churned +178/−197. Several `pi-rpc` and `pi-sessions` claims that cite `agent-session.ts:114-133` need re-verification. Flagged for next `gap-scan`.

**Together AI added as a built-in provider (`0.74.1`, PR `#3624` by Nutlope)** — confidence: high
- `7adb8e76 feat(ai): add Together AI provider`.
- Adds to the `KnownProvider` union enumerated in `pi-providers/reference/built-in-providers.md`. Flagged for next `gap-scan`.

**`compat.forceAdaptiveThinking` for Anthropic-compatible custom providers (`0.75.5`, PR `#4797` by mbazso)** — confidence: high
- `d801d88a Support adaptive thinking for Anthropic-compatible aliases`.
- Affects `pi-providers/reference/custom-providers.md`. Flagged.

**Forked session id alignment fix (`0.75.4`, PR `#4799` by Perlence)** — confidence: high
- `dce24ac9 fix(coding-agent): keep fork session id aligned`.
- Behavior fix for `SessionManager.forkFrom`. `pi-sessions/reference/branching-resume.md` claims about fork-vs-branch outcomes should be re-verified. Flagged.

**TypeScript source-import-extensions migration (`0.75.4` chore)** — confidence: high, low-impact
- `ae9450dc chore(ts): use source import extensions` + `06c6c324 chore: enforce erasable TypeScript syntax`.
- Imports now end in `.ts` (e.g., `"../../core/output-guard.ts"`), not `.js`. No semantic effect on kb claims (they cite file:line, not import strings). Noted for context.

### Breaking changes

- **Node.js minimum raised to 22.19.0 (`0.75.0`)**. Documented at `packages/coding-agent/CHANGELOG.md` under `[0.75.0] Breaking Changes`. Affects users; not a kb claim either way.

### New features (non-territory or out-of-skill scope)

- Image generation APIs (`@earendil-works/pi-ai`).
- Windows ARM64 release artifacts.
- Bun release binaries with clipboard sidecar.
- Read tool collapsed-output default (`373bd128`).
- `pi update` shows update notes after self-update (`f4f0ac7a`, PR `#4724`).
- Edit tool exposes unified patch (`60a55a23`).
- `interactive-mode.ts` extra-usage warning string moved from `:166` → `:187`. Cite drift only; semantics unchanged. `APPEND_SYSTEM.md` mentions `:166` — corrected via flag rather than edit (the identity-blob text is informational, not a load-bearing kb claim).

### Sources.md notes

- `Current pin:` bumped `e4163fe9` → `fc51a40d` in `sources.md`.
- Upstream remote URL (`https://github.com/earendil-works/pi.git`) still resolves and fetches correctly. The CHANGELOG cross-uses `earendil-works/pi` (issue tracker) and `earendil-works/pi-mono` (PRs). Keeping the existing remote URL.

### Spot-check: high-stakes kb claims verified at new pin

| Claim | Old cite | Verified at new pin? |
|---|---|---|
| `takeOverStdout()` mechanism | `output-guard.ts:9-34` | ✓ unchanged at `fc51a40d` |
| `rpc-mode.ts` startup engage point | `:22, 49, 53-55` | ✓ unchanged at `fc51a40d` |
| LF-only JSONL framing + readline hazard comment | `jsonl.ts:5-12, 14-20` | ✓ unchanged at `fc51a40d` |
| `loadEntriesFromFile` header validation | was `session-manager.ts:438-462` | drifted to `:440-461` (2-line offset); behavior unchanged |
| `interactive-mode.ts` extra-usage warning string | was `:166` (per APPEND_SYSTEM) | drifted to `:187`; string unchanged |
| `system-prompt.ts` customPrompt branch | was `:53-77` | drifted to `:53-81`; **format changed** (XML tags, not Markdown) |
| `system-prompt.ts` default branch | was `:80-167` | drifted to `:83-174`; **format changed** (XML tags, not Markdown) |

### What's now stale / flagged

- `pi-prompt-assembly` skill — multiple stale claims about `# Project Context` Markdown heading and `## <abs-path>` per-file heading. **Fixed in this run** for the most-load-bearing entry points (`SKILL.md` description, `assembly-order.md` steps 3/6, `known-issues.md` lines 26-27 and the "silently drops" section). Smaller cite-line drifts inside `cache-breakpoints.md` and `oauth-identity-preamble.md` left for next `gap-scan`.
- `pi-rpc` — agent-event enumeration missing `willRetry`. Flagged.
- `pi-providers` — missing Together AI; missing `compat.forceAdaptiveThinking`; `/login` description doesn't mention interactive selection; `models.json` parse model not noted as JSONC. Flagged.
- `pi-extensions/reference/loading.md` — jiti switch may have invalidated implementation cites in the loader. Flagged.
- `pi-sessions/reference/branching-resume.md` — fork session-id alignment fix; re-verify outcomes. Flagged.

A `gap-scan` run is the appropriate next maintenance step to systematically refresh the remaining line-number cites and absorb the flagged features.

### Files modified in this run

- `.pi/kb/sources.md` — pin bumped.
- `.pi/kb/version-log.md` — this file (created).
- `.pi/skills/pi-prompt-assembly/SKILL.md` — XML-boundary correction in description and Q-and-A line.
- `.pi/skills/pi-prompt-assembly/reference/assembly-order.md` — steps 3 and 6 rewritten for XML wrapping; line numbers re-pinned to `fc51a40d`.
- `.pi/skills/pi-prompt-assembly/reference/known-issues.md` — lines 26-27 rewritten; obsolete "silently drops" section rewritten as historical note.
- `.pi/skills/pi-prompt-assembly/reference/cache-breakpoints.md` — one mention of `# Project Context` corrected to `<project_context>`.
