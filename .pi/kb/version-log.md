# version-log.md — pi-mono-expert

One entry per `self-update` run. Each records: previous pin, new pin, the diff scope, behavior changes that matter for this expert's territory, and which kb files were updated or flagged.

Citations: `<sha>` for commit; `<file>:<line>` against the **new pin** (unless otherwise stated).

---

## 2026-08-12 — pulled to `53fa77cc` (v0.84.1)

> Runtime npm global upgraded `0.82.1 → 0.84.1` and **verified live before the pin bump** — six gates, all passed (see below). `main` fast-forwarded to `v0.84.1`; `expert/main` rebased clean (`.pi/`-only, 23 commits, 0 non-`.pi`/`.claude` files). Trigger: routine forward eval; the pin was **not** stale (it matched the runtime exactly). Run as a two-party eval with the `chat-eng` apex-app session, which owns the largest consumer of pi's wire — that consult changed the outcome and is why the entry below records a **refutation** section.

**Previous pin:** `b4f29368` (2026-07-25; covers 0.80.10 → 0.82.1)
**Target:** tag `v0.84.1` = `53fa77cc`. New releases in range: `0.83.0`, `0.84.0`, `0.84.1`.
**Diff scope:** `v0.82.1..v0.84.1` = 434 commits, 659 files, ~56.7k insertions / ~15.0k deletions. New packages: `protocol`, `client`, `telemetry`, `session-backends` (renamed from `storage`). **Most of the volume is irrelevant to us by construction — we run pi in RPC mode only, never the TUI** (59 TUI files, fullscreen mode, Mermaid/LaTeX, scrollbars: all noise for our purposes).

### Behavior changes that matter (territory)

**THE consumer-facing change: `message_update` is delta-only (high) — BREAKING for wire consumers**
- v0.84.0 removed the cumulative `message` field and `assistantMessageEvent.partial` from every `message_update` (upstream #7290, "quadratic output growth"). Stripper is the NEW `packages/coding-agent/src/modes/json-event.ts`; applied in RPC at `packages/coding-agent/src/modes/rpc/rpc-mode.ts:356` and in print mode at `packages/coding-agent/src/modes/print-mode.ts:110`. Docs rewritten at `packages/coding-agent/docs/rpc.md` § "message_update (Streaming)".
- **`rpc-types.ts` had an EMPTY diff across this range** while the payload changed underneath it. Any future audit that reads only the types file will miss a change of this class — this is the finding gate 6 encodes.
- Clients must assemble text from deltas between `message_start` and `message_end`; `message_end.message` remains authoritative. `text_start`/`thinking_start`/`toolcall_start` now carry **only** `contentIndex` — they are not a viable carrier for anything.

**Anthropic OAuth/billing stealth — unchanged (high)**
- `packages/ai/src/api/anthropic-messages.ts` +19/−8, none of it billing-related. `sk-ant-oat` detect `:844`; `anthropic-beta: claude-code-20250219,oauth-2025-04-20` `:902`; Claude Code identity block `:980`. Verified live: gate 2 returned `cacheWrite=60394`.

**Project-trust gating — unchanged (high)**
- `project-trust.ts` absent from the diff entirely. Gates at `packages/coding-agent/src/core/resource-loader.ts:1024`, `:1038`. `resource-loader.ts` is +81/−? but the change is context-file discovery, not trust: `AGENTS.override.md` is now the FIRST per-directory candidate (`:71`) and linked-worktree shadowing was added (`:91-116`).

**Session JSONL on disk — unchanged (high)**
- `packages/coding-agent/src/core/session-manager.ts` is **+3/−1** (a symlink-directory fix at `:1675`) and coding-agent does **not** adopt pi-agent-core's new v4 `SessionRepo` (grep for `JsonlSessionRepo|SessionRepo` in `packages/coding-agent/src` returns nothing at this pin). The agent-package breaking note "Removed the legacy JSONL and in-memory repository APIs" is **harness-internal** and does not touch the files under `~/.pi/agent/sessions/`. Resume-by-file, fork lineage, and PAI's transcript deriver are all unaffected.

**Model catalog — all four ids we use survived (high)**
- `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, `claude-opus-4-8` all present in `pi-ai@0.84.1` → `package/dist/providers/data/anthropic.json` (unpacked via `npm pack`; the tree cannot answer this since 0.81.x). Built-in `defaultModelPerProvider.anthropic` is **still** `claude-opus-4-8` (`packages/coding-agent/src/core/model-resolver.ts:23`, confirmed in the installed dist at `:13`). **No consumer model flip was required in this range** — the first upgrade where half 1b was a no-op.

**Extension API — additive (high)**
- `packages/coding-agent/src/core/extensions/types.ts` +36/−3. The three removed lines are two comments plus one signature: `refreshToken(credentials)` → `refreshToken(credentials, signal)`, which lands only on config-form OAuth providers. Everything apex-app's extensions use is untouched. Confirmed empirically: chat-eng bumped apex-app's devDep 0.82.1 → 0.84.1 and `bun run typecheck` exited 0 on both configs.

**Smaller RPC-surface changes (medium)**
- `rpc-mode.ts:466`, `:486` — `set_model` / `get_available_models` now use `modelRuntime.getAvailableSnapshot()` (sync) instead of `await getAvailable()`. Shape unchanged; a cold session may return a smaller catalog until the refresh lands. Degraded, not broken; no measurement that it bites in practice.
- `rpc-mode.ts:557-577` — the `bash` command now fires an extension `user_bash` event first and can be answered without executing.
- `AI_AGENT=pi` added to CLI and RPC child-process environments (#7493).

### The downstream trap: a data-loss FIX upstream that reads as a regression

- v0.84.0 also fixed pi-ai to preserve content carried on the initial `content_block_start` (#7358 → `packages/ai/src/api/anthropic-messages.ts:588-603`; `text: event.content_block.text ?? ""` replacing `""`, same for `thinking`/`signature`). Before the fix that text was dropped **everywhere**, final message included; after it, the text is in the final message but **never appears as a delta** — `text_start` carries no content.
- **Frequency, from the originating issue #7283 (high):** the reporter states real Anthropic messages "almost always start with an empty string" and that the seeded case comes from **Anthropic-*compatible* gateways** (LiteLLM-class). So the trigger is our `ollama-cloud` drought fallback (`ANTHROPIC_BASE_URL` swap onto the same parser) and `cloudflare-ai-gateway` — **not** `api.anthropic.com`.
- **Net:** 0.84.1 is strictly *better* on final-message fidelity. The only artifact is a delta-buffer divergence in clients that never consult the final message on that path.

### Refutation from the consumer side (chat-eng, apex-app) — recorded because the expert was wrong

The expert's first-pass consumer analysis was partly wrong and the corrections are worth keeping:
1. **Severity over-called.** apex-app's `turn_end` overwrites the delta buffer unconditionally from the canonical message, so a seeded head is a *mid-stream flicker*, not permanent loss. Permanent loss exists only on the `agent_end` termination path, which flushes the raw buffer with no message preference.
2. **The suggested fix was wrong for the consumer's state shape.** `currentAssistantText` is a flat string, not a per-`contentIndex` map, so replace-on-`text_end` would drop earlier blocks in a `text → toolcall → text` message. The correct shape is a **splice** at an offset recorded at `text_start`.
3. **The devDependency call was inverted.** A consumer pinned to the old package keeps a green typecheck gate while the runtime drifts — *the gate cannot see the version it does not have*. Bumping the consumer devDep **before** the `npm -g` converts a live-upgrade breakage into a compile error delivered while nothing has moved yet. Adopted into gate 6.
4. **A typecheck gate is not a fixture gate.** On the consumer side, dropping the dead fields from the hand-rolled types surfaced **1 of 4** stale fixture sites — the other three sit outside any typecheck config and would have kept passing while asserting a wire that no longer exists. Grep fixtures by hand.

### Verification — six gates, all passed BEFORE the pin bump

| # | Gate | Result |
|---|---|---|
| 1 | RPC timing / terminal-event contract | **PASS** — `consult-pi-mono.ts` 4.11s, clean `agent_end`, exit 0 |
| 2 | Billing floor (OAuth subscription cache path) | **PASS** — `cacheWrite=60394` |
| 3 | Model resolve from the installed dist | **PASS** — `anthropic: "claude-opus-4-8"` in `dist/**/model-resolver.js:13` |
| 4 | Trust gating in the installed dist | **PASS** — `isProjectTrusted()` present |
| 5 | Dispatch proof (session record, not self-report) | **PASS** — `"model":"claude-opus-5"` in the session JSONL |
| 6 | **Wire shape (NEW this run)** | **PASS** — 4 `message_update` events, delta types `text_start`/`text_delta`/`text_end`, zero `message`/`partial`; positive control fired 2/2 first |

Gate 6 is implemented as `~/apex/efforts/pi-code/scripts/gate-wire-shape.ts` — a real `pi --mode rpc` subprocess, raw stdout JSONL, assertions run against a synthetic legacy line **first** so a green run is not a check that never ran. It lives on the **producer** side deliberately (chat-eng's ask): a wire gate catches a shape change for every consumer, not just apex-app.

### Trust review (mandatory gate, run BEFORE the rebase)

`git diff v0.82.1..v0.84.1 -- .pi/` = **one file, three lines**: `.pi/extensions/prompt-url-widget.ts` imports `hyperlink` from `@earendil-works/pi-tui` and wraps two display strings in it (`:5`, `:178`, `:181`). Read in full; benign. The extension set is still the four baseline files (`prompt-url-widget.ts`, `redraws.ts`, `tps.ts`, `import-repro.ts`) plus `.pi/prompts/sa.md`, which upstream added earlier. No new executable surface.

### kb files updated in this run

- `sources.md` — pin bumped `b4f29368` → `53fa77cc`; **gate 6 (wire shape) added** to Post-upgrade verification along with the "read the *Fixed* section for downstream shape impact" corollary.
- `version-log.md` — this entry.

### Still stale / flagged

- **Full cite re-anchor NOT done in this run.** Measured: **38 of 53** fully-qualified cited files in `.pi/skills` + `.pi/kb` changed across `v0.82.1..v0.84.1`. Per the standing method note, that is a **two-pass gap-scan** (drift pass by content match, then a targeted error pass) and it is deliberately scoped as separate follow-on work rather than expanded into this upgrade.
- **Two cited files are already dead and survived the last gap-scan:** `packages/ai/src/anthropic.ts` and `packages/ai/src/utils/oauth/anthropic.ts`. Both were casualties of the 0.80.x provider re-architecture. Consistent with the standing finding that content-matching fixes *drift*, not *errors*.

---

## 2026-07-25 — pulled to `b4f29368` (v0.82.1)

> Runtime npm global upgraded `0.80.9 → 0.82.1` and **verified live before the pin bump** (all four gates in `sources.md` passed: consult RPC 4.46s clean exit, `cacheWrite=53158` OAuth subscription cache path, model resolve, trust gating). `main` fast-forwarded to `v0.82.1`; `expert/main` rebased clean (`.pi/`-only, 13 commits). Trigger: Anthropic released **Claude Opus 5** and we needed to know whether pi had it.

**Previous pin:** `2d16f929` (2026-07-16; covers 0.80.1 → 0.80.9)
**Target:** tag `v0.82.1` = `b4f29368`. New releases in range: `0.80.10`, `0.81.0`, `0.81.1`, `0.82.0`, `0.82.1`.
**Diff scope:** `v0.80.9..v0.82.1` = 372 files, ~18.3k insertions / ~21.1k deletions.

### Behavior changes that matter (territory) — verdict: SAFE

**Anthropic OAuth/billing stealth — did NOT move again (high)**
- Path stable at `packages/ai/src/api/anthropic-messages.ts` (+37/-8). `sk-ant-oat` detect `:838-839`; `anthropic-beta: claude-code-20250219,oauth-2025-04-20` `:894` (was `:884`). Two-block system intact: identity `:971` / `cache_control` `:972`, OAuth user system `:979`, non-OAuth `:988`. Last-tool breakpoint `:1311`, last-user `:1247-1268`.

**Model catalog LEFT THE GIT TREE (high) — new substrate rule**
- `providers/*.models.ts` are now thin wrappers over `./data/<provider>.json`, and `packages/ai/src/providers/data/` is **gitignored** (built from models.dev, shipped only in the npm tarball). Model-availability questions are **unanswerable from the pinned tree** — unpack `npm pack @earendil-works/pi-ai@<v>` → `package/dist/providers/data/anthropic.json`.

**Claude Opus 5 (medium-high)**
- `claude-opus-5` first ships in the built-in catalog at **v0.82.1** (generator `921c3543`; Bedrock `af3b934f`). Entry: 1M context, 128k output, `forceAdaptiveThinking`, `supportsTemperature:false`, `thinkingLevelMap {xhigh,max}`, cost 5/25/0.5/6.25.
- Note: the runtime `models-store.json` **remote** catalog had already fetched an identical opus-5 entry under 0.80.9 — effective availability preceded the shipped catalog. Built-in default `defaultModelPerProvider.anthropic` remains `claude-opus-4-8` (`model-resolver.ts:17`); upstream did not change it.

**Trust gating / RPC — intact (high)**
- `resource-loader.ts` +4 (directory exclusion, #7106); `isProjectTrusted()` gates present in installed `resource-loader.js:756,767`. `agent_end`/`willRetry` terminal contract verified live by the consult smoke.

### kb files refreshed in this run

- `sources.md` — pin bumped, catalog-left-the-tree rule recorded, confidence-rule line re-anchored.
- **Full cite re-anchor** (`gap-scan`, same run): 753 cites audited, 748 re-anchored across 33 skill files.
- Corrections where the *mechanism* changed — all from `9993c969` "replace model registry with model runtime", which landed in **v0.80.8**, i.e. these were **already dead at the previous pin and the v0.80.9 gap-scan missed them**:
  - `AuthStorage.getApiKey` **removed** → `ModelRuntime.getAuth` (`model-runtime.ts:374-376`) → `composeApiKeyAuth` (`provider-composer.ts:293`). `auth-storage.ts` is credential storage only.
  - `ProviderConfigInput` → `provider-composer.ts:44-68`. `ProviderModelConfig` gone → inline element type `:53-67`.
  - per-model `baseUrl` → `provider-composer.ts:136` (models.json) / `:218` (registerProvider).
  - `register-builtins.ts` **removed** → `providers/all.ts`, and the lazy rule **inverted** (all.ts statically imports; laziness is now the provider module's `../api/<x>.lazy.ts`).
  - `provider-display-names.ts` **removed** → display name is the provider definition's `name` field.

### Carried-over flags — CLEARED 2026-07-26

Worked the backlog the v0.80.9 entry deferred. Outcome per item:

| Flag | Verdict |
|---|---|
| `pi-rpc` missing `willRetry` | **Already closed** — `protocol.md:123` documents `agent_end{messages, willRetry}` with semantics; `agent_settled` documented at `protocol.md:124` / `json-mode.md:56,62`. Verified against `agent-session.ts:142-146`. No change needed. |
| `pi-providers` missing Together AI | **Was much worse than flagged.** The `KnownProvider` table claimed **28** providers; the union (`types.ts:34-72`) has **38**. Ten missing: `together`, `nvidia`, `ant-ling`, `radius`, `zai-coding-cn`, `qwen-token-plan{,-cn}`, `xiaomi-token-plan-{ams,cn,sgp}`. All ten added with auth flavor / env var / default model. Inline union list and count corrected; `envMap` cite re-anchored to `env-api-keys.ts:79-114`. |
| `pi-providers` missing `compat.forceAdaptiveThinking` | **Added** — new subsection in `custom-providers.md` (`types.ts:625`, default false, generator-applied for adaptive families; matters for Anthropic-compatible gateways). Also documented neighbours `allowEmptySignature` `:627`, `supportsStrictTools` `:629`. |
| `pi-providers` `/login` interactive selection undocumented | **Added** — four-branch table in `auth-resolution.md` from `handleLoginCommand` (`interactive-mode.ts:4891-4913`). Bare `/login` opens the auth-type selector; it never required a provider argument. |
| `pi-providers` `models.json` not noted as JSONC | **Already closed** — covered in `custom-providers.md`. |
| `pi-extensions/loading.md` jiti cites | **Was wrong, now fixed** — `loadExtensionModule` cited at `loader.ts:349-361`, which is `setActiveTools`. True location `:403-421`, `jiti.import` `:419`, `createJiti` config `:411-417`, call site `:464`. |
| `pi-sessions/branching-resume.md` fork session-id | **Was wrong, now fixed** — `forkFrom` cited at `:1316-1352`, actually `session-manager.ts:1579-1625`. Signature gained `options?: NewSessionOptions`; the id is `options.id` (validated `:1603-1604`) **or** `createSessionId()` (`:1606`) — the caller-supplied-id path is the "alignment fix" the flag referred to. |

**Method finding (important):** the two "was wrong" items were *already wrong before* the v0.82.1 re-anchor and survived it. Content-matching maps where the old line **went** — if a cite was wrong to begin with, it stays wrong at a new number. Content-matching fixes *drift*, not *errors*. Detecting errors requires checking that the anchor still says what the prose claims, which only a targeted read can do. Budget for that separately from bulk re-anchoring.

### Still stale / flagged

- ~~**`pi-providers/reference/auth-resolution.md` five-step table**~~ — **CLEARED**: re-derived 2026-07-26 against `resolveProviderAuth` (`packages/ai/src/auth/resolve.ts:46-77`); found two behavioral errors (models.json outranks env; stored credential short-circuits). See the `67ee4ab0` commit.
- *(historical, superseded)* `pi-providers/reference/auth-resolution.md` five-step table — marked ⚠️ STALE / pending re-derivation (low confidence). Its 12 dead `auth-storage.ts:4xx/5xx` cites are knowingly retained under the flag as the record of what needs deriving against the composer chain. **This is the top follow-up.**
- Carried over from the v0.80.9 entry and NOT addressed here: `pi-rpc` `willRetry` enumeration; `pi-providers` missing Together AI / `compat.forceAdaptiveThinking` / JSONC note; `pi-extensions/loading.md` jiti cites.

### Method note (applies to every future gap-scan)

The first re-anchor pass mapped cites by arithmetic over `git diff -U0` hunk offsets. **That is wrong** across pure-insertion hunks — caught via `extensions/types.ts:673` (`BeforeProviderHeadersEvent`) mapping to `:677` when it actually sits at `:680`. Re-done by matching the old line's exact text in the new file; **297 of 451 arithmetic results needed correcting**. Content matching is the method. Now recorded in `sources.md`.

---

## 2026-07-16 — pulled to `2d16f929` (v0.80.9)

> Pinned 2026-07-16: runtime npm global upgraded `0.79.10 → 0.80.9` and **verified live** (consult RPC smoke 5.77s clean exit, agent_end terminal, OAuth subscription call + cache_control active). `origin/main` fast-forwarded `8e190066 → v0.80.9` and pushed; `expert/main` rebased onto `v0.80.9` (`.pi/`-only, 9 commits, clean → `c2f14f58`). Citations below are `file:line` against the `v0.80.9` tree (`2d16f929`). Full audit: `x/memory/outputs/2026-07/16/1417 - pi 0.79.10 to 0.80.9 upgrade verdict.md`. Executed under workitem `314abbf8`.

**Previous pin:** `8e190066` (2026-06-22; covers releases 0.79.0 → 0.79.10)
**Target:** tag `v0.80.9` = `2d16f92973230a7e095aa984f150ba8702784f50`. New releases in range: `0.80.1` → `0.80.9` (0.80.0/0.80.4 unpublished on npm).
**Diff scope:** `v0.79.10..v0.80.9` = 537 files, ~53.6k insertions / ~29.5k deletions. Dominant theme: **AI-package provider re-architecture** (one-file-per-provider split under `packages/ai/src/providers/*` + streaming/API logic moved to `packages/ai/src/api/*`).

### Behavior changes that matter (territory) — audit verdict: SAFE

**Anthropic OAuth/billing stealth — mechanism byte-identical, FILE MOVED (high)**
- `packages/ai/src/providers/anthropic.ts` is now an 18-line provider shell; all streaming/OAuth logic → **`packages/ai/src/api/anthropic-messages.ts`**. **All prior `providers/anthropic.ts:NNN` cites are dead.**
- OAuth detect `apiKey.includes("sk-ant-oat")` (`anthropic-messages.ts:828-829`). Two-block system: identity `"You are Claude Code, Anthropic's official CLI for Claude."` (`:961`) + custom systemPrompt (`:968`), both `cache_control`'d (`:962`/`:969`); non-OAuth single-block (`:975`); construction `:957-981`. Headers `anthropic-beta: claude-code-20250219,oauth-2025-04-20` + `user-agent: claude-cli/${ver}` (`:884-885`). interactive warning `startsWith("sk-ant-oat")` (`interactive-mode.ts:210`), interactive-only. **No billing-affecting change.**

**Project-trust gating — UNCHANGED (high)**
- `project-trust.ts` empty diff; `resource-loader.ts` diff cosmetic (dirname refactor, InlineExtension typing, resetTimings). Gate stands (+2 line drift): project `.pi/SYSTEM.md` gated `isProjectTrusted() && existsSync` (`resource-loader.ts:966-967`), global ungated (`:971-972`); `APPEND_SYSTEM.md` `:980-981` gated / `:985-986` ungated. Headless untrusted `if (!hasUI) return false` (`project-trust.ts:86-87`); no-trust short-circuit `:50`.

**Model registry — UNCHANGED (high)**
- `defaultModelPerProvider.anthropic = "claude-opus-4-8"` (`model-resolver.ts:17`; confirmed in compiled installed `model-resolver.js`). Only internal `modelRegistry.find` → `modelRuntime.getModel` (0.80.x downloadable model catalogs).

**RPC / CLI — additive only, one event-surface change (high)**
- All harness flags present (`args.ts`): `--mode/provider/model/api-key/system-prompt/append-system-prompt/name(-n)/session/session-id/extension(-e)/approve(-a)`. Additive: `--thinking` gained `max`; new `--session-dir`/`--models`. Unknown `--flags` absorbed into `unknownFlags` map (`args.ts:188-199`), NOT hard-rejected (only unknown single-dash `-x` errors `:203`).
- RPC protocol additive: new `get_entries`/`get_tree` (`rpc-types.ts:63-64,187-199`).
- **NEW `agent_settled` event** (`agent-session.ts:143`), emitted after `agent_end` once loop drains (`:560-564`, `:1059`); **`waitForIdle()` repointed** `agent_end`→`agent_settled` (`rpc-client.ts:445`/`:456`). `agent_end`+`willRetry` contract intact (`:601`/`:647`/`:1966`) — our consult/pi-task resolve-on-`agent_end`-before-`start()` fix UNAFFECTED (verified live). Flagged by peer `pi-code-slate-a9d0`.

### kb files to refresh (gap-scan follow-up — NOT yet done)

- **HIGH:** `pi-prompt-assembly`, `pi-providers` — re-anchor all `providers/anthropic.ts` cites → `api/anthropic-messages.ts` (path break + line moves). The OAuth two-block / cache-breakpoint / identity-header cites all shifted.
- **MED:** `pi-rpc` — add `agent_settled` event + `waitForIdle()` repoint; note `promptAndWait` return type widened `AgentEvent[]`→`AgentSessionEvent[]`.
- **LOW:** `pi-architecture`/`pi-sessions` — verify `resource-loader.ts` line drift (+2) on trust-gate cites.
- Downstream: `efforts/pi-code/kb/pi-anthropic-subscription-billing.md` — Area-1 cites now point at the old `providers/anthropic.ts` path.
- Non-territory finding: `consult-pi-mono.ts:81` hardcodes `?? "claude-opus-4-7"` fallback (stale vs opus-4-8 standard) — owned by consult session.

### Files modified in this run

- `.pi/kb/sources.md` — pin bumped `8e190066 → 2d16f929`; added 0.80.x AI-restructure + agent_settled note.
- `.pi/kb/version-log.md` — this entry.

---

## 2026-06-22 — pulled to `8e190066` (v0.79.10)

> Pinned 2026-06-22: `origin/main` fast-forwarded to `v0.79.10`, `expert/main` rebased onto it (`.pi/`-only, 6 commits, clean), `Current pin:` bumped in `sources.md`. Runtime npm global independently upgraded `0.78.1 → 0.79.10` the same day and verified live (floor + pi-task + consult-pi-mono all first-party on 0.79.10). Citations below are `file:line` against the `v0.79.10` tree (`8e190066`). Targeted gap-scan (areas 1-5 only); see `efforts/pi-code/kb/pi-0.79.10-gap-scan.md` for the full report.

**Previous pin:** `592c34c0` (2026-06-07; covers releases 0.76.0 → 0.78.1)
**Target:** tag `v0.79.10` = `8e1900666f3cb83c281297d8f787fae6ee2bd0e6`. New releases in range: `0.79.0` → `0.79.10`.
**Diff scope:** `592c34c0..v0.79.10` = 292 files, ~13.5k insertions / ~3.7k deletions (`git diff --stat -- packages/`). Dominant theme: AI-package refactor (`packages/ai/src/anthropic.ts` → `packages/ai/src/providers/anthropic.ts`) + new project-trust gating.

### Behavior changes that matter (territory)

**Project-trust gating — NEW in 0.79.x, load-bearing for APEX (high)**
- `discoverSystemPromptFile()`: project `<cwd>/.pi/SYSTEM.md` is now trust-gated (`resource-loader.ts:964-967`, `if (isProjectTrusted() && existsSync(projectPath))`); global `~/.pi/agent/SYSTEM.md` stays UNGATED bare `existsSync` (`:969-971`). Same split for `APPEND_SYSTEM.md` (`:978-981` gated / `:983-985` ungated).
- Headless (RPC/print) has no UI → `resolveProjectTrusted` returns `false` at `project-trust.ts:86-87` (`if (!options.projectTrustContext.hasUI) return false`) → project file dropped → would fall to pi's flagged default block-2.
- `--approve`/`-a` → `projectTrustOverride=true` (`args.ts:180-181`), honored first in `resolveProjectTrusted` (`project-trust.ts:47-49`). Resolution order: override → resource-presence short-circuit (`hasTrustRequiringProjectResources`, `trust-manager.ts:28-36`) → `project_trust` extension handler → persisted → `defaultProjectTrust` → interactive prompt.
- **Surprise:** a cwd with NO trust-requiring resources under `.pi/` short-circuits to trusted (`project-trust.ts:50-52`); only `settings.json`/`extensions`/`skills`/`prompts`/`themes`/`SYSTEM.md`/`APPEND_SYSTEM.md` trigger the prompt.
- Downstream handling: global `~/.pi/agent/SYSTEM.md` billing floor (universal) + version-aware `--approve` in `consult-pi-mono` (expert identity). See `efforts/pi-code/kb/pi-anthropic-subscription-billing.md`.

**Providers / OAuth stealth — mechanism intact, file relocated + lines moved (high)**
- `packages/ai/src/anthropic.ts` → **`packages/ai/src/providers/anthropic.ts`**. All prior `anthropic.ts:NNN` cites need path + line update.
- `isOAuthToken` → `providers/anthropic.ts:798-800`; Claude-Code identity headers → `:867-889`; OAuth two-block system construction → `:928-944` (block1 identity `:930-935` + `cache_control`; block2 custom `:937-943` + `cache_control`).
- Cache breakpoints shifted ~+43-52 lines: system `:950`, OAuth caches `:934/:941`, last-tool `:1220`, last-user `:1170-1186`.
- `git log v0.78.1..v0.79.10 -- packages/ai/` confirms **no billing-affecting OAuth/routing change** beyond the refactor.

**Per-turn system-prompt rebuild — intact, line drift (medium)**
- `before_agent_start` emit + reset-to-base now at `agent-session.ts:1110-1135` (reset at `:1135`; old note `:1099`, +36). Per-turn re-injection still required and cache-safe (stable prefix). Reload path (`resource-loader.ts:340-489`) semantics unchanged; no new caching layer.

**Model registry — unchanged from v0.78.1 (high)**
- `defaultModelPerProvider.anthropic = "claude-opus-4-8"` (`model-resolver.ts:17`); first-class entry in `models.generated.ts`. No consumer default flip needed.

### kb files updated / flagged

- `.pi/kb/sources.md` — pin bumped `592c34c0 → 8e190066`; added 0.79.x trust-gating note.
- **Downstream:** `efforts/pi-code/kb/pi-anthropic-subscription-billing.md` — corrected `project-trust.ts:130-132` → `:86-87`; Area-1 trust cites (`resource-loader.ts:965/969`, `args.ts:181`) verified still accurate.
- **Skill-edit pass APPLIED 2026-06-22** (same-day follow-up consult; all new/changed cites re-verified against the pinned source; host independently spot-checked ~10 cites — all exact). Sections refreshed/added across: `pi-prompt-assembly` (HIGH — `anthropic.ts`→`providers/anthropic.ts` path break + 5 stale cache cites + add trust-gating note), `pi-providers` (HIGH — `interactive-mode.ts` warning `:166→:190`, emission `→:4165`, `auth-storage.ts:466→:473`, path-break note), `pi-architecture` (MED — `config.ts` ~+115 pre-existing rot → `:491/:495/:515-521`; `trust-manager` note), `pi-sessions` (MED — `session-manager.ts:438-462` re-anchor), `pi-rpc`/`pi-extensions` (LOW — `willRetry` event, jiti loader cites).

---

## 2026-06-07 — pulled to `592c34c0` (v0.78.1)

> Pinned 2026-06-07: `origin/main` fast-forwarded to `v0.78.1`, `expert/main` rebased onto it (`.pi/`-only, clean), `Current pin:` bumped in `sources.md`. The runtime npm global `@earendil-works/pi-coding-agent` was independently upgraded to `0.78.1` the same day. Citations below are `file:line` against the `v0.78.1` tree (`592c34c0`), which now equals the pin.

**Previous pin:** `fc51a40d` (2026-05-23; covers releases 0.73.0 → 0.75.5)
**Proposed target:** tag `v0.78.1` = `592c34c05643d115d6eed08a6f615999651cfaa3` (2026-06-04). New releases in range: `0.76.0`, `0.77.0`, `0.78.0`, `0.78.1`.
**Diff scope:** `fc51a40d..v0.78.1` = 146 commits (verified `git rev-list --count`; high). `upstream/main` (`130ae577`) is 20 commits past the tag (166 total since pin; high) — the extra 20 are post-0.78.1 and out of scope for this evaluation.
**Runtime framing (high):** The RUNTIME pi is the npm global `@earendil-works/pi-coding-agent` (installed `0.75.5`, npm `latest`=`0.78.1`; confirmed via `npm view ... dist-tags` and installed `package.json`), NOT built from this monorepo. Upgrading the runtime is `npm i -g @earendil-works/pi-coding-agent@0.78.1`, not a monorepo rebuild. The nested `@earendil-works/pi-ai` (where stealth-billing `isOAuthToken` lives) is shrinkwrapped to the coding-agent release (installed pi-ai `0.75.5` ships inside coding-agent `0.75.5`), so the npm upgrade pulls the matching pi-ai automatically (high).

### Behavior changes that matter (territory)

**RPC layer — additive only; client API surface preserved (high)**
- `RpcClientOptions` unchanged: `cliPath`/`cwd`/`env`/`provider`/`model`/`args` all present (`rpc-client.ts:26-39`). `start()`/`prompt(message,images?)`/`onEvent(listener)` intact (`rpc-client.ts:72,196,170`).
- New defensive process-exit handling: `RpcClient` now rejects pending requests and tracks `exitError` on child `exit`/`error`/stdin-`error` (`rpc-client.ts:503-510,524-545`; PR `#4764`). Net effect: previously-hung promises now reject cleanly. No protocol shape change.
- `bash` RPC command gained optional `excludeFromContext?: boolean` (`rpc-types.ts:52`; `0.76.0`, `#5039`). Backward compatible — existing `bash` calls unaffected.

**CLI spawn args — all additive; nothing removed or renamed (high)**
- `--mode`, `--provider`, `--model`, `--system-prompt`/`--append-system-prompt`, `--extension`/`-e`, `--session`, `--thinking` all still parsed unchanged (`args.ts:84-130`).
- New flags: `--name`/`-n` (`args.ts:97-103`, `0.78.0`), `--session-id` (`args.ts:107-108`, `0.76.0`), `--exclude-tools`/`-xt` (`args.ts:124-129`, `0.77.0`).

**Subscription / stealth-billing path — mechanism intact (high), key resolution relocated (medium)**
- OAuth-token detection unchanged: `isOAuthToken(apiKey) => apiKey.includes("sk-ant-oat")` (`anthropic.ts:779-780`); interactive check `startsWith("sk-ant-oat")` (`interactive-mode.ts:191`).
- Extra-usage warning is an interactive-mode-only constant (`ANTHROPIC_SUBSCRIPTION_AUTH_WARNING`, `interactive-mode.ts:187-188`), shown via `maybeWarnAboutAnthropicSubscriptionAuth` (`:4105`). Not emitted in RPC/print mode — does not touch apex-app or synapse RPC consumers (high).
- `system-prompt.ts` only removed one file-exploration guideline line (`#5132`); customPrompt-vs-default branches and XML `<project_context>` wrapping (since 0.75.0) unchanged. The custom-`--system-prompt` trap-avoidance mechanism is intact (medium — verified no structural change to assembly branches).
- **Refactor:** `streamAnthropic`/`streamSimpleAnthropic` no longer call `getEnvApiKey` internally; they now require `options.apiKey` and throw `No API key for provider` if absent (`anthropic.ts:482-485,741`). Key resolution moved up to the coding-agent layer (auth-storage/sdk), which still resolves `--api-key`/`auth.json`/env. Net behavior for our consumers unchanged (medium — relocation, not removal).
- New compat flags `supportsTemperature` (default `true`) and `allowEmptySignature` (default `false`) (`anthropic.ts:179-180`); temperature now suppressed when `supportsTemperature===false` (`anthropic.ts:935`). opus-4-8 ships `supportsTemperature:false` (high; `0.78.1` `#5251`).
- Credential config values now parse `$ENV_VAR` / `${ENV_VAR}` interpolation, `$!`/`$$` escaping, and treat plain strings as literals (`resolve-config-value.ts:11-90`; `0.77.0` `#5095`). Plain API-key literals are safe **unless** they contain an unescaped `$` (high).

**Model registry — opus-4-8 first-class; default model bumped (high)**
- `claude-opus-4-8` is a first-class `anthropic`-provider entry (`models.generated.ts:1923-1941`): `provider:"anthropic"`, `baseUrl:https://api.anthropic.com`, `contextWindow:1000000`, `maxTokens:128000`, `cost {input:5,output:25,cacheRead:0.5,cacheWrite:6.25}`, `compat{forceAdaptiveThinking:true,supportsTemperature:false}`, `reasoning:true`, `thinkingLevelMap{xhigh:xhigh}`, `input:[text,image]`.
- **Default anthropic model changed `claude-opus-4-7` → `claude-opus-4-8`** in `defaultModelPerProvider` (`model-resolver.ts:16`; `0.77.0`). Invocations that omit `--model` on the anthropic provider now resolve to opus-4-8 automatically (high).

**Resource loader / prompt assembly / sessions / extensions (high)**
- Resource loader, skills loader, project-context discovery: **unchanged** (empty diff `fc51a40d..v0.78.1` for `resource-loader.ts`/`skills.ts`/`project-context.ts`). `.pi/` scaffold loading, cwd ancestor-walk, `SYSTEM.md`/`APPEND_SYSTEM.md` discovery unaffected.
- Sessions: JSONL entry types and on-disk format unchanged; `loadEntriesFromFile` refactored to line-by-line read for large files (`session-manager.ts`, `0.78.1` `#5231`). `getDefaultSessionDir` still exported and location-stable (`session-manager.ts`). Added `--session-id`/`assertValidSessionId` (`0.76.0`) and startup `--name` (`0.78.0`). Existing sessions remain readable (high).
- Extensions: `ExtensionContext` gained a **required** `mode: "tui"|"rpc"|"json"|"print"` field, and `hasUI` semantics changed — now `true` in TUI **and RPC** modes (previously false in RPC) (`extensions/types.ts:298,303-305`). New `ctx.getSystemPromptOptions()` for command contexts (`:338`) and `InputEvent.streamingBehavior` (`:766`). `getAllTools()` now exposes `promptGuidelines` (`:1223`).

### Breaking changes checklist

- [x] **Node minimum `>=22.19.0`** (`packages/coding-agent/package.json` engines at `v0.78.1`). Local node is `v22.22.0` — satisfied (high). `legacy-node20` dist-tag pinned at `0.74.2` is irrelevant on node 22 (high).
- [x] **`ExtensionContext.mode` now required + `hasUI` true in RPC** (`extensions/types.ts:303-305`). Affects extension authors who construct contexts manually or gate UI on `hasUI`. Extensions that only *receive* `ctx` get the new field additively; ones that branch on `hasUI` to suppress dialogs in RPC will now attempt dialogs (high).
- [x] **anthropic provider throws if `options.apiKey` absent** (`anthropic.ts:482-485,741`). Internal to the pi-ai SDK; the coding-agent resolves keys upstream, so CLI/RPC consumers unaffected (medium).
- [x] **Default anthropic model is now `claude-opus-4-8`** (was `claude-opus-4-7`) (`model-resolver.ts:16`). Unspecified-model anthropic invocations change model (and per-token cost) (high).
- [ ] No RPC command removed/renamed; no CLI flag removed/renamed; no session-format break; no resource-loader change (high).

### New features (territory-relevant)

- `--session-id <id>` exact project-local session create/resume (`0.76.0`, `args.ts:107`).
- `--name`/`-n` startup session display name (`0.78.0`, `args.ts:97`).
- `--exclude-tools`/`-xt` tool denylist (`0.77.0`, `args.ts:124`).
- `bash` RPC `excludeFromContext` (`0.76.0`, `rpc-types.ts:52`).
- `retry.provider.maxRetries` setting; SDK retries default to 0 (`0.76.0`, `anthropic.ts:519`).
- `ctx.mode` + `ctx.getSystemPromptOptions()` extension context (`0.78.1`, `extensions/types.ts:303,338`).
- New built-in providers: Ant Ling, NVIDIA NIM, ZAI Coding CN; MiniMax-M3 (`env-api-keys.ts:102,104,115`; `model-resolver.ts:17,21,32`).

### Fork-patch / rebase risk (high)

- `expert/main` carries **only `.pi/` additions** beyond `upstream/main` (3892 insertions, 0 deletions; `git diff --stat upstream/main...expert/main` shows exclusively `.pi/SYSTEM.md`, `.pi/kb/*`, `.pi/skills/pi-*`). It edits **zero** upstream source files. The shared upstream `.pi/` files (`.pi/extensions/*`, `.pi/prompts/*`, `.pi/skills/add-llm-provider.md`) are present in both trees but untouched by expert commits → no overlap. A rebase of `expert/main` onto `v0.78.1` will be **clean** (high).
- `origin/main` is **not ahead** of `upstream/main` (`git log upstream/main..origin/main` empty) — the fork is a pristine mirror + the expert scaffold. A runtime npm upgrade bypasses nothing on `origin/main` (high).
- The runtime `[pai-context]` / `[pi-delivery]` log lines are **not present in pi-mono source** (`git grep` at `v0.78.1` empty). They originate from apex infra (the global `~/.pi/agent/extensions/pai-context.ts` extension) — unaffected by a pi-mono runtime upgrade, except that any global extension using `ExtensionAPI` inherits the `ctx.mode`/`hasUI` change above (high).

### Files modified in this run

- `.pi/kb/version-log.md` — this entry, finalized on pin to `592c34c0`.
- `.pi/kb/sources.md` — `Current pin:` bumped `fc51a40d` → `592c34c0`; Update procedure rewritten to the two-halves (runtime + fork) form; added a runtime/fork-relationship note.
- `/home/debian/apex/efforts/pi-code/kb/pi-upgrade-0.75-to-0.78-assessment.md` — standalone upgrade-evaluation report (new).

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
