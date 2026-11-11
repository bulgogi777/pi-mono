# CLAUDE.md — pi-mono (fork)

This is a fork of `earendil-works/pi` (upstream, the source of pi-the-tool). **Never commit to `main`** — it is pristine and tracks `upstream/main`; all fork-local work lands on `expert/main` instead.

The pi-mono expert (identity, kb, territorial skills) lives in `efforts/pi-code/.pi/` in the vault, not here. Nothing under this repo's own `.pi/` is the expert's — what remains there is upstream's own tooling (extensions, prompts, git/npm scratch dirs), preserved as-is.

This cwd is **untrusted** (`~/.pi/agent/trust.json`). A pi session started here loads no project `.pi/` by default.

> Tracked on `expert/main` via `git add -f` — upstream's `.gitignore` blanket-ignores `.claude/`.
