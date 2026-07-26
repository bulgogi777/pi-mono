# Packages System

How `pi install` works, what the `packages` array in `settings.json` does, and how npm packages contribute extensions/skills/prompts/themes via a `pi` field in their `package.json`. All cites against pi-mono `HEAD`. The CLI handler is `package-manager-cli.ts` (`packages/coding-agent/src/package-manager-cli.ts`); the resolver is `DefaultPackageManager` at `packages/coding-agent/src/core/package-manager.ts:756-…`.

## CLI subcommands

Top-level dispatcher: `handlePackageCommand` at `package-manager-cli.ts:365-…`. Recognized commands (`:16`): `"install" | "remove" | "update" | "list"`. Plus `"uninstall"` as an alias for `"remove"` (`:124-126`).

| Command | Usage | What it does | Code |
|---|---|---|---|
| `pi install <source> [-l]` | `:45` | Resolves the source, installs the package, and persists it to settings via `installAndPersist`. | `package-manager-cli.ts:432-435`; `package-manager.ts:966-…` |
| `pi remove <source> [-l]` (alias `pi uninstall`) | `:47` | `removeAndPersist` — deletes the install and removes from settings. Returns false (`exitCode = 1`) if not found. | `package-manager-cli.ts:437-446` |
| `pi update [source\|self\|pi] [--self] [--extensions] [--extension <s>] [--force]` | `:49` | Updates pi itself (`--self` / `pi`), one package, all packages (`--extensions`), or both (default). | `package-manager-cli.ts:266-340` |
| `pi list` | `:51` | Lists configured packages by scope (user / project), with `(filtered)` annotation when the entry is in object form. | `package-manager-cli.ts:447-470` |

The `-l` / `--local` flag stores the entry in **project** settings (`<cwd>/.pi/settings.json`) instead of global. Without it, entries land in `~/.pi/agent/settings.json`.

## Source format

Three source kinds parsed by the package manager (see `package-manager.ts:114-128`):

- **npm** — `npm:@scope/name`, `npm:@scope/name@1.2.3`, `npm:bare-name`
- **git** — `git:github.com/user/repo`, `git:git@github.com:user/repo`, `https://github.com/user/repo`, `ssh://git@github.com/user/repo`
- **local** — `./local/path`, absolute path

`pi install` examples shown in `--help` (`:60-66`):

```
pi install npm:@foo/bar
pi install git:github.com/user/repo
pi install ./local/path
```

## settings.json `packages` array

The `Settings.packages` field (`settings-manager.ts:95`) is `PackageSource[]?` (`:65-73`):

```ts
type PackageSource = string | {
  source: string;
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
};
```

- **String form** — loads **all** declared resources from the package's `pi` manifest.
- **Object form** — filter: only the listed paths from each resource type are loaded. The `source` field carries the npm/git/local identifier.

Project-vs-global merge: `packages` is an array, so per the merge rules in `reference/settings-json-schema.md` the **project array replaces the global array entirely** if set. To inherit and add, only define `packages` in one scope.

Within a single resolution pass, the package manager collects packages from **both** scopes and merges them; project-scope packages win on collision (`package-manager.ts:855-862` and `:1622-1670`).

## The `pi` manifest in `package.json`

When `pi` resolves a package, it reads the package's `package.json` and looks for a `"pi"` field. Shape: `PiManifest` at `extensions/loader.ts:462-467`:

```jsonc
{
  "pi": {
    "extensions": ["./dist/main.js", "./dist/sidecar.js"],
    "skills":     ["./skills"],
    "prompts":    ["./prompts"],
    "themes":     ["./themes/dark.json"]
  }
}
```

All four arrays are optional. Paths are resolved relative to the package's root. Files that don't exist are silently dropped during the manifest scan (`loader.ts:503`). For extensions specifically, `resolveExtensionEntries` (`loader.ts:495-525`) checks the `pi.extensions` field first; if absent, falls back to `index.ts` / `index.js` at the package root.

## Resolution flow

`DefaultPackageManager.resolve(onMissing?)` at `package-manager.ts:756-…` (the entry point used by the resource loader at startup):

1. Read both global and project `settings.json` (`package-manager.ts:2141-2147`).
2. For each `PackageSource` in either array, parse and resolve to an installed local path (`getInstalledPath`, `:84-89`). Missing sources can trigger `onMissing` to install on demand or skip.
3. For each installed package, read its `package.json` `pi` field via `readPiManifest` (`extensions/loader.ts:468-478`).
4. Per resource type (`"extensions" | "skills" | "prompts" | "themes"`, `:185-187`), collect the file paths the manifest declares.
5. Apply the `PackageSource` object-form filter (if set) to narrow which paths from each manifest survive.
6. Merge user vs project results: **project-first** for collisions, dedup by absolute path.
7. Return a `ResolvedPaths` (`package-manager.ts:59-64`) keyed by resource type, each entry a `ResolvedResource` (`:53-57`) carrying `path`, `metadata`, and `enabled`.

The result feeds `DefaultResourceLoader` (`resource-loader.ts:398-408` for extensions), which then passes the merged file list to `loadExtensions`, `loadSkills`, etc.

## Install internals

`DefaultPackageManager.install(source, options?)` at `package-manager.ts:943-…`:

- For **npm** sources, runs `npm install` (or the configured `npmCommand` from settings, e.g. `["mise","exec","node@20","--","npm"]`) into a per-source directory under `~/.pi/agent/packages/` (or `<cwd>/.pi/packages/` with `-l`).
- For **git** sources, clones into the same packages dir.
- For **local** sources, no install — pi just records the path.
- Surfaces `ProgressEvent` (`:68-73`) via the registered `ProgressCallback` so the CLI can stream `Installing <source>...` lines.

`installAndPersist` (`:966-…`) wraps `install` and then calls `addSourceToSettings` to write the new entry into `settings.json` under a `proper-lockfile` lock.

## Loose `extensions/`, `skills/`, etc. directories

The discovery paths described in `reference/discovery-paths.md` (`<cwd>/.pi/extensions/`, `~/.pi/agent/skills/`, etc.) load **regardless** of `settings.json` `packages`. The packages array adds npm-package contributions on top; it never gates the loose-directory scan. So a user can keep ad-hoc extension `.ts` files under `~/.pi/agent/extensions/` and they'll always load.

## Common gotchas

- **`pi.extensions` can list files that don't exist** — they're silently dropped, not warned. Verify with `ls` after editing the manifest.
- **The `pi` field must be an object.** If it's a string or array at the top level, `readPiManifest` returns `null` (`loader.ts:470-475`).
- **`npmCommand`** is consulted only for `pi install` / `pi update`, not for runtime imports. Runtime extension loading uses `jiti` (`loader.ts:349-361`).
- **Lockfile contention** during concurrent `pi install` runs uses `proper-lockfile` (`package-manager.ts:855` and surroundings) — concurrent runs serialize rather than corrupt.
- **Local paths in `packages` are NOT walked recursively** for resources. They follow the same `pi.extensions` manifest contract as npm packages. For ad-hoc local development, prefer the loose `<cwd>/.pi/extensions/` directory.

## Cross-references

- Schema for `settings.json` overall: `reference/settings-json-schema.md`.
- Where packages' resource paths actually surface in pi (and the path-discovery precedence): `reference/discovery-paths.md`.
- Extension loading internals (`pi.extensions` manifest, `index.ts` fallback, `jiti` resolution): **pi-extensions** `reference/loading.md`.
- CLI flag interactions (`--no-extensions`, `--extension <path>`): `reference/cli-flags.md`.
