# agent-dir farm — two agent dirs, one pi install (Ark)

**Why this page exists:** apex-app runs one global `pi` against **two** agent dirs so it can route a spawn to either Anthropic account. Most of the second dir is symlinks into the first, so a file pi *writes* can be one file reached by two paths — and pi's file lock does not notice. This is the durable fact; `sources.md` § Post-upgrade verification gate 7 is the check that consumes it.

Scope: this box. A derivative apex-app on another host will have its own layout — re-measure, do not assume.

## Layout (measured 2026-09-22, `ls -la ~/.pi-agent-bulgogi777/`)

Live dir: `~/.pi/agent/`. Second dir: `~/.pi-agent-bulgogi777/`, selected per spawn via `PI_CODING_AGENT_DIR` (apex-app `server/chat-session.ts:1198`).

| Entry in `~/.pi-agent-bulgogi777/` | Kind | Resolves to |
|---|---|---|
| `models-store.json` | **real file** | itself (de-symlinked 2026-09-22 — see below) |
| `auth.json` | symlink | `~/.pi-agent-bulgogi777-auth.json` — a **separate** file, not the live one |
| `SYSTEM.md`, `models.json`, `settings.json`, `trust.json`, `telegram.json`, `web-search.json` | symlink | the live dir's copy |
| `bin`, `extensions`, `extensions-staging`, `npm`, `panel`, `sessions`, `skills`, `tmp`, `web-search-cache` | symlink | the live dir's copy |

So **no path under the second dir resolves to a live-dir file that pi read-modify-writes** — which is the property gate 7 exists to preserve. `crashes.json` (new in pi 0.86) is deliberately left per-dir and unsymlinked.

⚠ The `sessions/`, `tmp/`, `npm/` and `extensions/` shares are fine because nothing there is a single document two processes rewrite: session JSONLs are per-session filenames, and the rest are read paths or per-file scratch. `settings.json` is shared and pi *can* write it (`/settings`, and 0.86 added cache-warming keys) — unaudited for locking; treat a settings write from two dirs as unproven, not safe.

## The mechanism: pi locks with `realpath: false`

`FileModelsStore.write()` is a read-modify-write of the **whole** document inside a `proper-lockfile` lock (`core/models-store.ts:127-136` at `v0.87.1`): parse current, set `current[providerId]`, write `JSON.stringify(current, null, 2)`.

The lock comes from `FileAuthStorageBackend`, and both call sites pass `realpath: false` — `core/auth-storage.ts:76` (`lockfile.lockSync(path, { realpath: false })`) and `:128` (`lockfile.lock(this.authPath, { realpath: false, retries: 0, stale: 30_000, onCompromised })`). `proper-lockfile` derives the lock name from the path it is given, so **two paths to one file take two different locks** (high).

**Measured, not inferred** (2026-09-22, `proper-lockfile` from the installed 0.87.1 tree, a symlink+target pair under `/tmp`):

```
realpath:false -> second lock ACQUIRED (no mutual exclusion)
realpath:true  -> second lock BLOCKED: ELOCKED
```

Reproduce: lock the target path, then attempt the symlink path with `retries: 0`, once with each `realpath` value.

**Failure shape if it ever applies again:** a *lost update* — the later whole-file rewrite drops the entry the earlier writer just added. Not corruption: each write is one `writeFileSync` of a small-to-medium document, so a torn file is possible but unlikely. For a refreshable catalog cache this self-heals on the next refresh; for anything pi treats as state rather than cache it would not.

**Not an upgrade regression.** `core/auth-storage.ts` and `core/models-store.ts` both have **empty diffs** across `v0.85.1..v0.87.1`. The exposure became reachable on 2026-09-22 when apex-app per-session account routing (`a6e7669f`) made both accounts run concurrently, and was closed the same day by making the farm's `models-store.json` a real file (apex-app workitem `c850ecbb`).

## What to do when a gate-7 check comes back "shared + locked"

In preference order: (1) de-symlink that path in the second dir so each account owns a real file — costs whatever the file caches, and divergence is harmless for a cache; (2) accept it and write the failure shape down; (3) ask upstream for `realpath: true`. **Never patch the global install** to change it.
