# Runtime module identity

## Rule

**Do not rely on module-level mutable state from pi inside an extension unless you have verified that the extension and the host execute the same module instance.** A `Set`, `Map`, counter, cache, or registry is local to its loaded module instance; a write through a different physical copy is invisible to pi's copy. **high** — pi's detached-child tracker is a module-level `Set`, and its three exported operations only mutate that local set (`packages/coding-agent/src/utils/shell.ts:192-211`).

Use exported pure functions when their inputs and outputs are sufficient. Do not treat that as permission to share their module state. If the extension needs lifecycle ownership, keep its own state and attach its own `process` lifecycle handlers. **high** — pi's RPC host itself kills its tracked set on `SIGTERM`/`SIGHUP` and then runs shutdown (`packages/coding-agent/src/modes/rpc/rpc-mode.ts:366-379`); shutdown ultimately calls `process.exit(exitCode)` (`:728-745`).

## Import resolution is runtime-specific

Do not simplify this to “every extension bare-import resolves from its own `node_modules`.” Pi deliberately aliases bare `@earendil-works/pi-coding-agent` to the bundled/runtime entry for extensions: compiled binaries provide it through `VIRTUAL_MODULES` (`packages/coding-agent/src/core/extensions/loader.ts:49-74`), and the Node loader maps it to `packageIndex` (`:83-144`). **high**

The hazard appears when an extension reaches around that public bare import — for example through a relative `../../node_modules/...` deep import — or otherwise loads a second physical copy. Treat deep/internal imports as a module-identity boundary. **high** — this follows from the two distinct module paths in the worked probe below; it is not a claim that the public bare import always splits.

## Worked probe: apex-app owned bash

**Field provenance:** peer-dispatched verification from `fixes-9#aedea8`, threads `a938dbb3` and `71b3f514`, preserved on work item `9358e605`. **high**

On 2026-09-17, apex-app's owned bash extension imported `trackDetachedChildPid` through its own `node_modules` path while the running pi CLI was `/home/debian/.local/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`. Its background child `4017107` survived pi's `SIGTERM` shutdown (pi exit code 143) because the extension changed a different tracker `Set`. **high** — live RPC probe, 2026-09-17; pi's tracker implementation is `packages/coding-agent/src/utils/shell.ts:196-211`, and the RPC SIGTERM path is `packages/coding-agent/src/modes/rpc/rpc-mode.ts:366-379`.

The fix in apex-app work item `9358e605` used an extension-owned `Set<number>` plus `exit`, `SIGTERM`, and `SIGHUP` cleanup handlers. Re-measurement at commit `0cf4c08` found the child gone within two seconds after both SIGTERM (pi exit 143) and stdin-close shutdown (pi exit 0). **high** — live RPC probes, 2026-09-17; the host's stdin-close shutdown path is `packages/coding-agent/src/modes/rpc/rpc-mode.ts:804-820`.

## Review checklist

Before a tool extension uses a registry, cache, counter, process table, or lifecycle tracker:

1. Locate the state declaration and determine whether it is module-level.
2. Trace the extension's import resolution in the target runtime; do not infer identity from package version.
3. If identity is not directly verified, own the mutable state in the extension.
4. Probe the real exit path, not only an in-process fixture: test both signal shutdown and the host's normal stdin-close/reap path when relevant.

**apex-app build gate:** Before building any new apex-app extension tool that touches process lifecycle, tool-registration collisions, or settings, consult this expert against source. The `1ddfbb42` / `9358e605` arc found all three assumptions wrong. **high** — field provenance above; module binding is verified in `packages/coding-agent/src/core/extensions/loader.ts:49-74,83-144`.
