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
- **Current pin:** `592c34c0` (2026-06-07, tag `v0.78.1`; covers releases 0.76.0 → 0.78.1). Matches the installed npm runtime `@earendil-works/pi-coding-agent@0.78.1`.

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

### Secondary sources (for `survey-usage`)

- Upstream GitHub Issues + Discussions: `https://github.com/earendil-works/pi/issues`
- GitHub code search: imports of `@mariozechner/pi-coding-agent` in public repos
- Relevant HN / X mentions
- Practitioner blog posts on coding-agent tooling

### Deployment-specific sources

No deployment target for this expert. Pi is used locally as a CLI tool (`/home/debian/.local/bin/pi`). The installed binary tracks the npm release, not this monorepo HEAD directly.

### Confidence rules (repo)

- Claims about behavior cite `file:line` in the pinned tree (`592c34c0`)
- Claims about deployment cite a successful probe against the local binary
- Claims about "best practice" cite the upstream docs or ≥2 independent usages in the codebase

---

## Notes

- This file is read by every maintenance verb. Keep it accurate.
- Run `self-update` after any significant upstream merge to refresh the pin and note what changed.
- **Runtime/fork relationship (read before any version eval):** the runnable `pi` is the npm global `@earendil-works/pi-coding-agent`, upgraded via `npm i -g` — it does NOT come from this fork. So a version eval/upgrade has two halves that must BOTH happen: (1) upgrade the runtime + flip consumer model defaults; (2) sync THIS fork + pin (per the Update procedure) so the expert's citations match the installed version. Always pin to the RELEASE TAG equal to the installed runtime, not `main` HEAD. Worked example: `efforts/pi-code/kb/pi-upgrade-0.75-to-0.78-assessment.md`.
