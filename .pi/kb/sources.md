# sources.md — pi-mono-expert

## substrate type

`repo` — truth is the pinned upstream SHA; cite `file:line` against this pin.

---

## Section: REPO substrate

### Primary source

- **Remote:** `upstream` → `https://github.com/earendil-works/pi.git`
- **Fork:** `origin` → `git@github.com:bulgogi777/pi-mono.git`
- **Branch tracked:** `main`
- **Working branch:** `expert/main` (all `.pi/` changes land here)
- **Current pin:** `b4f29368` (2026-07-25, tag `v0.82.1`; covers releases 0.80.10 → 0.82.1). Matches the installed npm runtime `@earendil-works/pi-coding-agent@0.82.1`. **Model catalog moved out of the git tree** — `packages/ai/src/providers/*.models.ts` are now thin wrappers importing `./data/<provider>.json`, and `packages/ai/src/providers/data/` is **gitignored** (generated at build from models.dev, shipped only in the npm tarball). Consequence for this expert: *"which models does release X know?" cannot be answered from the pinned tree* — unpack the published tarball (`npm pack @earendil-works/pi-ai@<v>` → `package/dist/providers/data/anthropic.json`). Anthropic OAuth/billing path did NOT move again (`packages/ai/src/api/anthropic-messages.ts`, +37/-8; `sk-ant-oat` detect at :839, `claude-code-20250219,oauth-2025-04-20` headers at :894). `resource-loader.ts` +4 (directory exclusion, #7106) — trust gating intact. Built-in `defaultModelPerProvider.anthropic` is STILL `claude-opus-4-8` (`packages/coding-agent/src/core/model-resolver.ts:17`) — consumer surfaces set `claude-opus-5` explicitly; the built-in default was not changed upstream.
  - **Opus 5 (`claude-opus-5`)** first shipped in the built-in catalog at `v0.82.1` (generator commit `921c3543`, + Bedrock `af3b934f`). Note the runtime `models-store.json` remote catalog had already picked it up under 0.80.9 with identical compat (`forceAdaptiveThinking`, `supportsTemperature:false`, `thinkingLevelMap {xhigh,max}`), so effective availability preceded the shipped catalog.
  - **Prior pin:** `2d16f929` (2026-07-16, tag `v0.80.9`; 0.80.1 → 0.80.9). **0.80.x re-architected the AI package** (one-file-per-provider split): the anthropic OAuth/billing stealth path moved `packages/ai/src/providers/anthropic.ts` → **`packages/ai/src/api/anthropic-messages.ts`** — mechanism byte-identical (two-block identity+custom system, `sk-ant-oat` detect, `claude-code-20250219,oauth-2025-04-20` headers) but ALL prior `providers/anthropic.ts:NNN` cites are dead. Also NEW `agent_settled` RPC event (fires after `agent_end`); `waitForIdle()` repointed `agent_end`→`agent_settled`. Project-trust gating and `defaultModelPerProvider.anthropic="claude-opus-4-8"` UNCHANGED. See `efforts/pi-code/kb/pi-anthropic-subscription-billing.md`.
  - **Prior pin:** `8e190066` (2026-06-22, tag `v0.79.10`; 0.79.0 → 0.79.10) — 0.79.x added project-trust gating (headless RPC resolves untrusted → project `.pi/SYSTEM.md` dropped; global `~/.pi/agent/SYSTEM.md` floor + version-aware `--approve` handle it).

### Update procedure

A version eval has **two independent halves — do BOTH** (the runtime is the npm global, NOT a build of this fork):

```bash
# (1a) RUNTIME — upgrade the installed pi. Use npm, NOT `pi update self`:
#      `pi update self` does not recreate the symlink farms bare-specifier resolution needs.
npm i -g @earendil-works/pi-coding-agent@<version>

# (1b) CONSUMER FLIP — see "Consumer surfaces" below. This is the half that breaks things.

# (2) FORK + PIN (this expert) — sync so file:line citations match what's actually running.
#     Pin to the RELEASE TAG that equals the installed runtime, NOT main HEAD
#     (main HEAD runs ahead of the npm release).
git fetch upstream --tags
RUNTIME=$(node -p "require('/home/debian/.local/lib/node_modules/@earendil-works/pi-coding-agent/package.json').version")  # e.g. 0.78.1
git checkout main && git merge --ff-only "v$RUNTIME" && git push origin main
git checkout expert/main && git rebase "v$RUNTIME"            # .pi/-only → clean
git diff <old-pin>.."v$RUNTIME" -- packages/                  # territory review
git diff <old-pin>.."v$RUNTIME" -- .pi/                       # TRUST REVIEW — mandatory, see below
# bump Current pin: above to the v$RUNTIME sha, then: git push origin expert/main --force-with-lease
```

> **Trust review — read the incoming `.pi/` diff BEFORE the merge/rebase, not after.** As of 2026-08-12 this repo is a **trusted cwd** (`~/.pi/agent/trust.json` → `/home/debian/apex/x/code/pi-mono: true`), added so apex-app tabs opened here get the expert identity + territorial skills. Trust is what makes project resources load at all — and it is not selective. Everything upstream ships under `.pi/` becomes live for **any** pi session started here the moment it is in the working tree:
>
> | Path | What trust grants it |
> |---|---|
> | `.pi/extensions/*.ts` | **executes** at session start, in-process, full tool access |
> | `.pi/skills/`, `.pi/prompts/` | reachable/injectable content + slash commands |
> | `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md` | goes into the system prompt |
> | `.pi/settings.json` | changes pi's config for sessions here |
>
> A rebase onto a new tag pulls upstream-authored code directly into that surface, with no review step between `git rebase` and the next session. Today `.pi/extensions/` holds four upstream files (`prompt-url-widget.ts`, `redraws.ts`, `tps.ts`, `import-repro.ts`) — that set is the baseline; **any addition or modification is a stop-and-read, not a formality.** Read every hunk of the `.pi/` diff. If you cannot review it, set the trust.json entry to `false` (nearest entry wins, so a `false` here overrides any broader `true`) and re-enable after review — do NOT pin first and review later.
>
> Note the asymmetry that makes this easy to under-weight: `consult-pi-mono.ts` passes `--approve`, so the expert has **always** run trusted here and this exposure predates the trust.json entry. The entry only extended it to apex-app tabs. Global `~/.pi/agent/{extensions,skills}` are never trust-gated and are unaffected either way.

### Consumer surfaces (half 1b) — the error-prone half

> **Do NOT flip `~/.pi/agent/settings.json`.** Interactive pi stays on `gpt-5.5` / `openai-codex`, and `enabledModels` deliberately lists no Anthropic models. Interactive pi on an Anthropic OAuth token bills the **third-party extra-usage pool**, not the Claude Max subscription — only the programmatic RPC path with a custom `--system-prompt` bills the subscription. Flipping this setting converts free usage into paid usage. (An earlier revision of this runbook listed "`~/.pi` settings" as a flip target. That was wrong; corrected 2026-07-26.)

**Rule 1 — `.env` beats code.** The *effective* model is the env var; the code constant is only the fallback. Editing the scripts alone changes nothing at runtime. Flip the env files first:

| File | Key |
|---|---|
| `~/.claude/.env` | `SYNAPSE_PI_MODEL` (with `SYNAPSE_PI_PROVIDER`) |
| `~/apex/x/code/apex-app/.env` | `APEX_APP_PI_MODEL` (with `APEX_APP_PI_PROVIDER`) |

Both are **gitignored** — no git safety net. Copy them somewhere before editing.

**Rule 2 — inventory with NO `--include` filters.** Two sweeps missed surfaces on 2026-07-25 because the filter list omitted `.env` (where the live values are) and `.tsx` (the UI picker). Grep the whole tree and exclude noise instead:

```bash
grep -rn "<old-model-id>" ~/.claude/scripts ~/.claude/.env ~/apex/x/code/apex-app ~/apex/efforts/*/scripts \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist
```

Verified surface list as of 2026-07-26 (14 files):

- `~/.claude/.env` — **live value**
- `~/.claude/scripts/synapse/` — `reason.ts`, `escalation.ts`, `heartbeat-reason.ts`, `heartbeat-runner.ts`, `morning-briefing-reason.ts`, `research-digest-reason.ts`, `telegram-send.ts`, `context-bundle.ts`, `switch-provider.sh`
- `~/apex/x/code/apex-app/.env` — **live value**
- `~/apex/x/code/apex-app/server/chat-session.ts`, `src/components/chat/ModelSwitcher.tsx` (curated picker list)
- `~/apex/efforts/pi-code/scripts/consult-pi-mono.ts`

Leave alone: version-history kb files, SQL migrations, `.next/` build output, `settings.local.json` permission strings, and drought-mode fallbacks (ollama/qwen).

**Rule 3 — restart the daemons, or the flip is invisible.** Long-running services read `.env` **at boot** and keep the old value in their process env indefinitely (`synapse-context-api` had been up 16 days). A completed-looking flip that changes nothing is the worst failure shape here.

```bash
systemctl --user restart synapse-context-api.service apex-backend.service
# verify the NEW pids actually carry it:
for s in synapse-context-api apex-backend; do
  P=$(systemctl --user show -p MainPID --value $s.service)
  tr '\0' '\n' < /proc/$P/environ | grep -E "SYNAPSE_PI_MODEL|APEX_APP_PI_MODEL"
done
```

`apex-frontend` serves a production build (`bun run start`), so source changes to the picker need `next build` before they appear — but the *default* comes from the backend, so the frontend is not on the critical path.

> **Re-anchor cites by CONTENT MATCH, never by diff arithmetic.** To map `file:line` across a pin bump, take the cited line's exact text from the OLD tree (`git show <oldtag>:<path>`) and find that text in the NEW tree. Mapping via `git diff -U0` hunk offsets *looks* right and is silently wrong across pure-insertion hunks — on the 0.80.9 → 0.82.1 pass, **297 of 451 arithmetic results were off** (caught via `extensions/types.ts:673`, mapped to `:677`, actually `:680`). Content matching is verifiable per cite; arithmetic is not. Where the old line's text no longer exists anywhere, the *mechanism* changed — re-derive the claim or flag it stale, do not re-point the number.

> **Model-availability questions cannot be answered from the pinned tree** (since 0.81.x). `packages/ai/src/providers/*.models.ts` are wrappers over `./data/<provider>.json`, and `providers/data/` is **gitignored** — generated at build from models.dev, shipped only in the npm tarball. To answer "does release X know model Y?": `npm pack @earendil-works/pi-ai@<version>` then read `package/dist/providers/data/anthropic.json`. Reading the git tree will tell you the model doesn't exist when it does.

> **Gap-scan is MANDATORY, not optional, after any large-diff or AI-package upgrade.** Big refactors relocate files and shift every line (e.g. 0.80.x moved the whole anthropic OAuth/billing path `providers/anthropic.ts` → `api/anthropic-messages.ts`, breaking every cite). Cites also rot *between* upgrades (0.80.9 revealed the provider catalog had already drifted 27→36 unnoticed) — run a periodic drift scan independent of version bumps. Track cite-drift found-but-out-of-scope as its own workitem rather than expanding the upgrade.

> **A gap-scan needs TWO passes — content matching fixes drift, not errors.** Re-anchoring maps where the old line *went*; a cite that was **already wrong** just becomes wrong at a new number and survives the pass untouched. Proven 2026-07-26: `loading.md` cited `loadExtensionModule` at `loader.ts:349-361` (actually `setActiveTools`; true home `:403`) and `branching-resume.md` cited `forkFrom` at `:1316-1352` (actually `:1579`) — both were wrong *before* the v0.82.1 re-anchor and passed straight through it. So run:
> 1. **Drift pass** (bulk, mechanical) — content-match every cite to its new line.
> 2. **Error pass** (targeted, per claim) — for the load-bearing claims, open the anchor and confirm it still says what the prose asserts. An in-bounds cite is not a correct cite.
>
> Also re-count enumerations against source every scan — they rot silently and no cite check catches them. The `KnownProvider` table sat at "28 providers" while the union had **38** (2026-07-26), and the provider catalog had drifted 27→36 unnoticed before that.

### Post-upgrade verification (run BEFORE bumping the pin — any failure ⇒ rollback, do not pin)

Proven 2026-07-16 on the 0.79.10 → 0.80.9 jump. Four gates tied to the territory concerns:

1. **RPC timing** — `PI_MONO_VERBOSE=1 bun /home/debian/apex/efforts/pi-code/scripts/consult-pi-mono.ts 'ping'` must return in ~5s **and EXIT** (not hang to timeout). Guards the `agent_end`/`willRetry` terminal-event contract that consult/pi-task resolve on. Wrap in `timeout 90` so a hang is caught, not waited out.
2. **Billing floor** — the smoke call above is an OAuth-subscription call; confirm it completes with `cache_control` active (`cacheWrite>0` in the `[consult] done` line) — proves the two-block cached-system OAuth path (`api/anthropic-messages.ts`) still bills against the Max subscription.
3. **Model resolve** — confirm unspecified-model anthropic resolves to `claude-opus-4-8`: `grep -n 'anthropic:' <installed>/dist/**/model-resolver.js` (authoritative — the *installed* compiled JS, not the git tree).
4. **Trust gating** — confirm the installed `resource-loader.js`/`project-trust.js` still carry the `isProjectTrusted()` + `hasUI` gates (headless RPC drops project `.pi/SYSTEM.md` → global floor).
5. **Consumer flip took effect** *(added 2026-07-26 — gates 1-4 all test pi; none of them would have caught a stale daemon)*. Two checks:
   - **Dispatch proof** — run the gate-1 smoke again and read the *session record*, not the model's self-report: `grep -oE '"model":"[^"]+"' ~/.pi/agent/sessions/<cwd-slug>/*.jsonl | tail -1` must show the new id. Models misreport their own identity — on 2026-07-25 `claude-opus-5` self-reported as `claude-opus-4-5-20260401`. Never accept a self-report as evidence.
   - **No stale process env** — every restarted service's `/proc/<pid>/environ` carries the new model (command in "Consumer surfaces" above). A service still holding the old value means the flip silently did nothing for that surface.

### Rollback procedure (both halves — a partial rollback leaves runtime and cites mismatched)

Fully reversible; nothing in the upgrade is destructive. npm retains all published versions; git retains the prior tag + expert HEAD.

```bash
# (1) RUNTIME — npm keeps every version; downgrade pulls the matching shrinkwrapped pi-ai automatically
npm i -g @earendil-works/pi-coding-agent@<prev-version>   # e.g. 0.79.10
#     + revert any consumer model-default edits (apex-app, synapse, ~/.pi/agent/settings.json)

# (2) FORK + PIN — reset expert/main to the prior tag/commit, restore Current pin:
git checkout expert/main && git reset --hard v<prev-version>   # or the prior expert HEAD sha
git push origin expert/main --force-with-lease
git checkout main && git reset --hard v<prev-version> && git push origin main --force-with-lease
```

Pre-commit, reversibility is inherent: the audit is read-only and the pin bump is one discrete commit — nothing changes until you push.

### Secondary sources (for `survey-usage`)

- Upstream GitHub Issues + Discussions: `https://github.com/earendil-works/pi/issues`
- GitHub code search: imports of `@mariozechner/pi-coding-agent` in public repos
- Relevant HN / X mentions
- Practitioner blog posts on coding-agent tooling

### Deployment-specific sources

No deployment target for this expert. Pi is used locally as a CLI tool (`/home/debian/.local/bin/pi`). The installed binary tracks the npm release, not this monorepo HEAD directly.

### Confidence rules (repo)

- Claims about behavior cite `file:line` in the pinned tree — always the **Current pin** declared above (today: `b4f29368`, `v0.82.1`), never a prior pin. *This line has drifted before; when bumping the pin, update it here too or the confidence rule silently authorizes stale cites.*
- Claims about deployment cite a successful probe against the local binary
- Claims about "best practice" cite the upstream docs or ≥2 independent usages in the codebase

---

## Notes

- This file is read by every maintenance verb. Keep it accurate.
- Run `self-update` after any significant upstream merge to refresh the pin and note what changed.
- **Runtime/fork relationship (read before any version eval):** the runnable `pi` is the npm global `@earendil-works/pi-coding-agent`, upgraded via `npm i -g` — it does NOT come from this fork. So a version eval/upgrade has two halves that must BOTH happen: (1) upgrade the runtime + flip consumer model defaults; (2) sync THIS fork + pin (per the Update procedure) so the expert's citations match the installed version. Always pin to the RELEASE TAG equal to the installed runtime, not `main` HEAD. Worked example: `efforts/pi-code/kb/pi-upgrade-0.75-to-0.78-assessment.md`.
