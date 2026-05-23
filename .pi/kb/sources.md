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
- **Current pin:** `fc51a40d` (2026-05-23, main HEAD after self-update; covers releases 0.73.0 → 0.75.5)

### Update procedure

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout expert/main && git rebase upstream/main
git diff e4163fe9..upstream/main -- packages/
```

### Secondary sources (for `survey-usage`)

- Upstream GitHub Issues + Discussions: `https://github.com/earendil-works/pi/issues`
- GitHub code search: imports of `@mariozechner/pi-coding-agent` in public repos
- Relevant HN / X mentions
- Practitioner blog posts on coding-agent tooling

### Deployment-specific sources

No deployment target for this expert. Pi is used locally as a CLI tool (`/home/debian/.local/bin/pi`). The installed binary tracks the npm release, not this monorepo HEAD directly.

### Confidence rules (repo)

- Claims about behavior cite `file:line` in the pinned tree (`fc51a40d`)
- Claims about deployment cite a successful probe against the local binary
- Claims about "best practice" cite the upstream docs or ≥2 independent usages in the codebase

---

## Notes

- This file is read by every maintenance verb. Keep it accurate.
- Run `self-update` after any significant upstream merge to refresh the pin and note what changed.
