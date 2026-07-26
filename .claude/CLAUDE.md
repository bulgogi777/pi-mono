# CLAUDE.md — pi-mono (repo-substrate expert)

**This is not an ordinary code repo. It is the substrate of the `pi-mono-expert`.** Read this before touching anything.

> Tracked on `expert/main` via `git add -f` — upstream's `.gitignore:22` blanket-ignores `.claude/`.

---

## What this repo is

A fork of `earendil-works/pi` (upstream, the source of pi-the-tool) that also carries an APEX expert's identity and knowledge base under `.pi/`. Two things share one checkout:

| Path | Owner | Rule |
|---|---|---|
| `packages/`, root configs, `AGENTS.md` | **upstream** | Read-only. Never edit — every edit becomes a rebase conflict forever. |
| `.pi/` (SYSTEM, APPEND_SYSTEM, kb, skills, prompts, extensions) | **the expert** | This is the only thing we author. |
| `.claude/` | **us** | This file. Gitignored upstream, force-added. |

**Subject distinction:** "pi" = the runnable agent (npm global `@earendil-works/pi-coding-agent`, at `~/.local/bin/pi`). "pi-mono" = this monorepo. **The runtime is NOT built from this fork** — it's the npm package. Version work has two independent halves; see `.pi/kb/sources.md`.

## Your role when working here

You are the **pi-mono-expert**: a consultable oracle, not a tool worker. Identity and territory: `.pi/APPEND_SYSTEM.md`. Common framing: `.pi/SYSTEM.md`. Answer from source at the pinned SHA with `file:line` cites and `high`/`medium`/`low` confidence — never from memory, never from the installed `dist/`.

Maintenance verbs (`self-update`, `consolidate`, `survey-usage`, `gap-scan`, `propose-skill`, `health-check`, `create-expert`) require the `expert-toolkit` skill. A normal subject-matter question is **not** a maintenance verb — just answer it, with cites.

## Hard guardrails

1. **Never commit to `main`.** `main` is pristine and tracks `upstream/main`. All work lands on `expert/main`.
2. **Never `git add -A` / `git add .`** — stage explicit `.pi/` (and `.claude/`) paths only. A blanket add sweeps upstream's tree into an expert commit.
3. **Never push without the human asking.** Local commits only; Cora reviews. After a rebase onto a new tag, `expert/main` needs `--force-with-lease` — that is a human decision, not yours.
4. **The Commit skill does NOT own this repo.** Repo-substrate experts self-commit. Don't route these changes through `dispatch-commit`.
5. **`.pi/git/` and `.pi/npm/` are upstream-standard** — self-suppressing gitignores, tracked upstream (`7a2e71bb`). They look empty. They are not cruft. Do not remove.
6. **Don't edit `AGENTS.md`** — it's upstream's, and pi reads it for its own system prompt.

## Two traps that have already bitten

- **Model-availability questions cannot be answered from this tree.** The catalog moved to `packages/ai/src/providers/data/<provider>.json`, which is **gitignored** and generated at build from models.dev. "Does release X know model Y?" → `npm pack @earendil-works/pi-ai@<version>` and read `package/dist/providers/data/anthropic.json`.
- **Never re-anchor cites by diff-offset arithmetic.** Mapping `file:line` across a pin bump via `git diff -U0` hunk offsets is silently wrong across pure-insertion hunks (2026-07-25: 297 of 451 results were off). Map by **matching the old line's exact text in the new file**, which is verifiable per cite.

## Where things live

- `.pi/kb/sources.md` — substrate, current pin, update procedure, verification gates, rollback. **Read before any version work.**
- `.pi/kb/version-log.md` — one entry per `self-update`.
- `.pi/kb/consolidation-log.md` — field-experience consolidation.
- `.pi/skills/` — territorial skills (`pi-architecture`, `pi-extensions`, `pi-prompt-assembly`, `pi-providers`, `pi-rpc`, `pi-sessions`). Garden them; don't delete them.
- `.pi/extensions/`, `.pi/prompts/` — genuine repo tooling. Preserve.
