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
- **Current pin:** `2d16f929` (2026-07-16, tag `v0.80.9`; covers releases 0.80.1 → 0.80.9). Matches the installed npm runtime `@earendil-works/pi-coding-agent@0.80.9`. **0.80.x re-architected the AI package** (one-file-per-provider split): the anthropic OAuth/billing stealth path moved `packages/ai/src/providers/anthropic.ts` → **`packages/ai/src/api/anthropic-messages.ts`** — mechanism byte-identical (two-block identity+custom system, `sk-ant-oat` detect, `claude-code-20250219,oauth-2025-04-20` headers) but ALL prior `providers/anthropic.ts:NNN` cites are dead. Also NEW `agent_settled` RPC event (fires after `agent_end`); `waitForIdle()` repointed `agent_end`→`agent_settled`. Project-trust gating and `defaultModelPerProvider.anthropic="claude-opus-4-8"` UNCHANGED. See `efforts/pi-code/kb/pi-anthropic-subscription-billing.md`.
  - **Prior pin:** `8e190066` (2026-06-22, tag `v0.79.10`; 0.79.0 → 0.79.10) — 0.79.x added project-trust gating (headless RPC resolves untrusted → project `.pi/SYSTEM.md` dropped; global `~/.pi/agent/SYSTEM.md` floor + version-aware `--approve` handle it).

### Update procedure

A version eval has **two independent halves — do BOTH** (the runtime is the npm global, NOT a build of this fork):

```bash
# (1) RUNTIME — upgrade the installed pi + flip consumer model defaults (apex-app, synapse, ~/.pi settings)
npm i -g @earendil-works/pi-coding-agent@<version>

# (2) FORK + PIN (this expert) — sync so file:line citations match what's actually running.
#     Pin to the RELEASE TAG that equals the installed runtime, NOT main HEAD
#     (main HEAD runs ahead of the npm release).
git fetch upstream --tags
RUNTIME=$(node -p "require('/home/debian/.local/lib/node_modules/@earendil-works/pi-coding-agent/package.json').version")  # e.g. 0.78.1
git checkout main && git merge --ff-only "v$RUNTIME" && git push origin main
git checkout expert/main && git rebase "v$RUNTIME"            # .pi/-only → clean
git diff <old-pin>.."v$RUNTIME" -- packages/                  # territory review
# bump Current pin: above to the v$RUNTIME sha, then: git push origin expert/main --force-with-lease
```

> **Gap-scan is MANDATORY, not optional, after any large-diff or AI-package upgrade.** Big refactors relocate files and shift every line (e.g. 0.80.x moved the whole anthropic OAuth/billing path `providers/anthropic.ts` → `api/anthropic-messages.ts`, breaking every cite). Cites also rot *between* upgrades (0.80.9 revealed the provider catalog had already drifted 27→36 unnoticed) — run a periodic drift scan independent of version bumps. Track cite-drift found-but-out-of-scope as its own workitem rather than expanding the upgrade.

### Post-upgrade verification (run BEFORE bumping the pin — any failure ⇒ rollback, do not pin)

Proven 2026-07-16 on the 0.79.10 → 0.80.9 jump. Four gates tied to the territory concerns:

1. **RPC timing** — `PI_MONO_VERBOSE=1 bun /home/debian/apex/efforts/pi-code/scripts/consult-pi-mono.ts 'ping'` must return in ~5s **and EXIT** (not hang to timeout). Guards the `agent_end`/`willRetry` terminal-event contract that consult/pi-task resolve on. Wrap in `timeout 90` so a hang is caught, not waited out.
2. **Billing floor** — the smoke call above is an OAuth-subscription call; confirm it completes with `cache_control` active (`cacheWrite>0` in the `[consult] done` line) — proves the two-block cached-system OAuth path (`api/anthropic-messages.ts`) still bills against the Max subscription.
3. **Model resolve** — confirm unspecified-model anthropic resolves to `claude-opus-4-8`: `grep -n 'anthropic:' <installed>/dist/**/model-resolver.js` (authoritative — the *installed* compiled JS, not the git tree).
4. **Trust gating** — confirm the installed `resource-loader.js`/`project-trust.js` still carry the `isProjectTrusted()` + `hasUI` gates (headless RPC drops project `.pi/SYSTEM.md` → global floor).

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

- Claims about behavior cite `file:line` in the pinned tree (`8e190066`)
- Claims about deployment cite a successful probe against the local binary
- Claims about "best practice" cite the upstream docs or ≥2 independent usages in the codebase

---

## Notes

- This file is read by every maintenance verb. Keep it accurate.
- Run `self-update` after any significant upstream merge to refresh the pin and note what changed.
- **Runtime/fork relationship (read before any version eval):** the runnable `pi` is the npm global `@earendil-works/pi-coding-agent`, upgraded via `npm i -g` — it does NOT come from this fork. So a version eval/upgrade has two halves that must BOTH happen: (1) upgrade the runtime + flip consumer model defaults; (2) sync THIS fork + pin (per the Update procedure) so the expert's citations match the installed version. Always pin to the RELEASE TAG equal to the installed runtime, not `main` HEAD. Worked example: `efforts/pi-code/kb/pi-upgrade-0.75-to-0.78-assessment.md`.
