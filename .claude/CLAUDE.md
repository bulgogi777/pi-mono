# CLAUDE.md — pi-mono (repo-substrate expert)

**This is not an ordinary code repo. It is the substrate of the `pi-mono-expert`.** Read this before touching anything.

> Tracked on `expert/main` via `git add -f` — upstream's `.gitignore:22` blanket-ignores `.claude/`.

> **This file is NOT the expert context, and pi never loads it.** The expert context is `.pi/` — that is what `consult-pi-mono` / pi RPC reads. pi's `loadProjectContextFiles` (`resource-loader.ts:105-118`) walks **ancestors only, never child dirs**, so `.claude/` is out of scope; and per-directory it takes `AGENTS.md` before `CLAUDE.md` and stops at the first hit (`:68`), so upstream's root `AGENTS.md` would shadow a root-level `CLAUDE.md` anyway. This file exists for **Claude Code sessions with cwd here** — the surface `.pi/` does not protect.
>
> Keep repo-note content in `.claude/`, never at repo root: if upstream ever dropped `AGENTS.md`, a root `CLAUDE.md` *would* land in pi's system prompt, and self-identifying text there is what trips Anthropic's third-party-app classification (Max subscription → extra-usage billing).

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

## ⚠ Read `.pi/APPEND_SYSTEM.md` NOW, before any git operation

**The hard guardrails are canonical in `.pi/APPEND_SYSTEM.md` § Hard guardrails** — six rules (never commit to `main`; never `git add -A`; never push unasked; don't route through the Commit skill; don't edit `AGENTS.md`; don't remove `.pi/git|npm/`) plus the two traps that have already bitten (model-availability can't be answered from this tree; never re-anchor cites by diff arithmetic).

They live there because **pi loads that file into the system prompt automatically** for every session with this cwd — panel members, consults, apex-app tabs — while Claude Code never reads `.pi/`. **You are the session it cannot reach.** Open it first; it is short.

Not duplicated here on purpose: two copies of a rule set drift, and the drift is silent.

## This is a TRUSTED cwd

`~/.pi/agent/trust.json` carries `/home/debian/apex/x/code/pi-mono: true` (added 2026-08-12). Consequence: upstream-authored `.pi/extensions/*.ts` **execute** in any pi session started here, and upstream `.pi/skills|prompts|SYSTEM.md|settings.json` load. **Every version eval must diff `.pi/` and read it before the rebase lands** — the gate, the baseline file set, and how to revoke are in `.pi/kb/sources.md` § Update procedure. Trust gates *project* `.pi/` only; global `~/.pi/agent/` is never gated.

## Where things live

- `.pi/kb/sources.md` — substrate, current pin, update procedure, verification gates, rollback. **Read before any version work.**
- `.pi/kb/version-log.md` — one entry per `self-update`.
- `.pi/kb/consolidation-log.md` — field-experience consolidation.
- `.pi/skills/` — territorial skills (`pi-architecture`, `pi-extensions`, `pi-prompt-assembly`, `pi-providers`, `pi-rpc`, `pi-sessions`). Garden them; don't delete them.
- `.pi/extensions/`, `.pi/prompts/` — genuine repo tooling. Preserve.
