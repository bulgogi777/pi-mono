# Extension Loading

Where pi looks for extensions and how each path becomes a loaded `Extension` object. All cites against pi-mono `HEAD`. Two layers: the **discovery** function `discoverAndLoadExtensions` (`packages/coding-agent/src/core/extensions/loader.ts:573-619`) used in some flows, and the **resource-loader** path used in the default startup flow (`packages/coding-agent/src/core/resource-loader.ts:398-408`).

The discovery sources, regardless of which entry path runs:

1. **Project**: `<cwd>/.pi/extensions/`
2. **Global**: `~/.pi/agent/extensions/`
3. **Configured paths**: explicit paths from CLI / settings / npm packages

The default startup goes through `resource-loader.ts` and the `package-manager.ts` settings layer, which builds the path list **including** npm package contributions; the directly-callable `discoverAndLoadExtensions` enumerates the project + global + configured paths in one call.

## Project-first ordering (loader.ts:592-597)

In `discoverAndLoadExtensions`:

```ts
// 1. Project-local extensions: cwd/${CONFIG_DIR_NAME}/extensions/
const localExtDir = path.join(cwd, CONFIG_DIR_NAME, "extensions");
addPaths(discoverExtensionsInDir(localExtDir));

// 2. Global extensions: agentDir/extensions/
const globalExtDir = path.join(agentDir, "extensions");
addPaths(discoverExtensionsInDir(globalExtDir));

// 3. Explicitly configured paths
for (const p of configuredPaths) { ... }
```

`CONFIG_DIR_NAME` is `.pi` (from `config.ts:376`). `agentDir` defaults to `~/.pi/agent/` (`config.ts:402-409`); override with `PI_CODING_AGENT_DIR`.

**Project-first** is the opposite of skills (where user/global wins). Dedup is by absolute path via the `seen` set at `loader.ts:578-585` — first occurrence wins, so if the same extension is listed in both project and global, the project version is loaded and the global one is silently skipped.

## What counts as an "extension" inside a directory

`discoverExtensionsInDir` at `loader.ts:537-568`. Three discovery rules per dir entry (documented at `:516-521`):

1. **Direct files**: `extensions/*.ts` or `*.js` → loaded.
2. **Subdirectory with index**: `extensions/<name>/index.ts` or `index.js` → loaded.
3. **Subdirectory with `package.json` carrying a `pi` field**: → loads what the manifest declares.

No recursion beyond one level. Complex packages must use the `package.json` manifest.

`isExtensionFile` at `loader.ts:480-482`: matches `*.ts` or `*.js`.

## The `pi.extensions` manifest (loader.ts:493-514)

`resolveExtensionEntries` at `loader.ts:495`. For a subdirectory with `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/main.ts", "./src/sidecar.ts"],
    "themes":     ["./themes/dark.json"],
    "skills":     ["./skills"],
    "prompts":    ["./prompts"]
  }
}
```

The four arrays — `extensions`, `themes`, `skills`, `prompts` — are the contribution shape. Pi reads them via `readPiManifest` (`loader.ts:468-478`). Paths are resolved relative to the directory containing `package.json` (`loader.ts:484`); files that don't exist are silently dropped (`loader.ts:503`). If no `pi.extensions` entries resolve, `resolveExtensionEntries` falls back to `index.ts` / `index.js` (`loader.ts:515-523`).

## npm packages — settings.json `packages` array

The third source above ("explicitly configured paths") is in practice populated by the **package manager** layer, which reads `~/.pi/agent/settings.json` and `<cwd>/.pi/settings.json` for a `packages` array of npm package identifiers (or git URLs). For each entry, `package-manager.ts` (around `:855-862` for the project-first collision rule, and `:920-930` / `:1002-1010` for various enumeration paths) installs and walks the package's `pi.extensions` manifest, then surfaces the resolved file paths to the resource loader.

The default flow at `resource-loader.ts:398-408` then calls `loadExtensions(extensionPaths, this.cwd, this.eventBus)` with the merged list — CLI-supplied paths plus the package-manager-resolved paths.

## Loose `extensions/` directory loads regardless of settings.json

`<cwd>/.pi/extensions/*.ts` and `~/.pi/agent/extensions/*.ts` are scanned **regardless** of whether `settings.json` has a `packages` entry. The `packages` array adds npm-package contributions on top; it doesn't gate the loose directory scan. Source: the `discoverExtensionsInDir(localExtDir)` and `discoverExtensionsInDir(globalExtDir)` calls at `loader.ts:593-597` are unconditional.

## Inline factory loading

For programmatic embedding, `loadExtensionFromFactory(factory, cwd, eventBus, runtime, extensionPath?)` at `loader.ts:404-432` lets a host program register an extension without going through the file system. Useful in SDK callers and tests. The synthetic path defaults to `"<inline>"` and shows up in source-info that way.

## Loader internals — `loadExtension` (loader.ts:391-420)

For each path, `loadExtension`:

1. `resolvePath(extensionPath, cwd)` — absolute-path normalization (`loader.ts:400`).
2. `loadExtensionModule(extensionPath, cacheToken?)` (`loader.ts:403-421`; called at `:464`) — uses `jiti` to load TS/JS without a build step. In bun-binary mode it uses `virtualModules`; in Node/dev it uses path aliases via `getAliases()`.
3. The module's default export must be a function (the factory) — anything else is rejected with `"Extension does not export a valid factory function"` (`loader.ts:402-404`).
4. `createExtension(...)` builds an empty `Extension` object with `path`, `resolvedPath`, `sourceInfo`, and empty `Map`s for handlers / tools / message renderers / commands / flags / shortcuts (`loader.ts:355-389`).
5. `createExtensionAPI(extension, runtime, cwd, eventBus)` builds the `pi` object the factory will see (`loader.ts:~395`).
6. `await factory(api)` — runs the extension's setup code.
7. Returns `{ extension, error: null }` on success, `{ extension: null, error: "..." }` on failure.

Errors are collected per-path into `LoadExtensionsResult.errors` (`loader.ts:443-446`); pi continues loading the rest.

## Override sources (resource-loader.ts:559-565, 631-650)

The resource loader knows that paths under `~/.pi/agent/extensions/` are scope `"user"` and paths under `<cwd>/.pi/extensions/` are scope `"project"`. Anything else (npm packages, CLI-supplied paths) gets scope based on its origin. This metadata is attached as `sourceInfo` on each `Extension` and surfaces in the TUI for the `/extensions` command and similar.

## Common gotchas

- **TypeScript imports**: handled by `jiti` — no separate compile step. But `jiti` won't help with native modules; if your extension depends on a native dep, you may need to bundle.
- **Inline import dynamic gotcha**: extensions are loaded via `jiti.import(extensionPath, { default: true })` (`loader.ts:419`; the `createJiti` config is `:411-417`). Make sure your extension uses a default export (`export default function (pi) {...}`).
- **Loose-directory loads always run**: there's no opt-out at the directory level. To selectively disable an extension, either delete/move its file, use `--no-extensions`, or the runtime extensions UI.
- **Project shadowing**: a project extension with the same path as a global one wins (the global is dedup'd out at `loader.ts:578-585`). But a project extension and a global extension with **different file names** both load — there's no name-based dedup.
- **`package.json` manifest paths**: silently filtered against `existsSync` (`loader.ts:503`). A typo in the manifest disappears with no warning. Verify with `ls`.

## Cross-references

- Resource discovery for skills, prompts, themes, AGENTS.md / SYSTEM.md (the broader path-discovery picture): **pi-architecture** `reference/discovery-paths.md`.
- The settings.json `packages` array and the npm-package contribution shape: **pi-architecture** (TBW `reference/packages-system.md`); fallback grep `packages/coding-agent/src/core/package-manager.ts`.
- `--no-extensions` and other CLI flags: `packages/coding-agent/src/cli/args.ts`.
- The `Extension` and `LoadExtensionsResult` types: `packages/coding-agent/src/core/extensions/types.ts:1438-1485`.
