# Custom Feature Implementations

> **Developer page.** The settings are user-visible, but this is a development mechanism.

## What it is

Eight of EchoCode's features can be replaced with your own code **without forking the repo**, at runtime, with hot reload. Point a setting at `user`, drop a file in that feature's `UserImplementation/` folder, and EchoCode loads yours instead of the built-in one.

This exists because EchoCode began as a course project where teams needed to reimplement a feature while keeping everything else working.

## The swappable eight

| Setting key | Feature folder |
|---|---|
| `annotationsBigO` | `program_features/Annotations_BigO/` |
| `assignmentTracker` | `program_features/Assignment_Tracker/` |
| `errorParser` | `program_features/C++_Error_Parser/` |
| `chatBot` | `program_features/ChatBot/` |
| `fileConnector` | `program_features/FileConnector/` |
| `folderFileCreator` | `program_features/Folder_File_Creator/` |
| `voice` | `program_features/Voice/` |
| `whatIsThis` | `program_features/WhatIsThis/` |

Each is `echocode.featureImplementation.<key>`, `builtin` (default) or `user`.

**Not swappable:** anything under `Core/` (speech, AI routing, mode, guidance, summaries) or `navigation_features/`. Those are called directly by `extension.js`.

## How to replace one

1. Create `program_features/<Feature>/UserImplementation/<SameFileName>`
2. Export **every** name the loader requires for that module (below)
3. Set `echocode.featureImplementation.<key>` to `user`

That is it. No restart — the change is picked up by the configuration watcher, and further edits to your file trigger a reload.

### Required exports

The loader validates exports and falls back if any are missing. Declared per module in `loadFeatureImplementations`:

| Module file | Must export |
|---|---|
| `Voice/dependencyManager.js` | `DependencyManager` (class, or default export) |
| `WhatIsThis/WhatIsThis` | `registerReadCurrentLineCommand` |
| `WhatIsThis/DescribeThis.js` | `registerDescribeCurrentLineCommand` |
| `WhatIsThis/CharacterReadOut.js` | `registerCharacterReadOutCommand` |
| `C++_Error_Parser/Python_Error_Parser.js` | `checkCurrentPythonFile` |

…and so on for the rest. Read `loadFeatureImplementations` in `extension.js` for the current list — it is the source of truth, and each call declares its own `requiredExports`.

Note that a feature key can cover **several module files**. `whatIsThis` covers three, so setting it to `user` makes EchoCode look for all three in that folder. Any one you do not supply falls back individually.

## It fails safe, and tells you why

Every failure path returns the built-in module and logs to the EchoCode output channel:

```
[Feature Loader] User implementation not found for voice: …/UserImplementation/dependencyManager.js. Using built-in module.
[Feature Loader] User implementation for whatIsThis/DescribeThis.js is missing exports: registerDescribeCurrentLineCommand. Using built-in module.
[Feature Loader] Failed to load user implementation for chatBot/Chat_Tutor.js: Unexpected token. Using built-in module.
[Feature Loader] Loaded user implementation for voice/dependencyManager.js
```

**If your implementation is not being used, read those lines.** Silence means your file was never looked for — check the setting.

## Implementation

`program_features/featureImplementationLoader.js` — ~114 lines.

```js
loadProgramFeatureModule({ featureKey, featureFolder, moduleFile, requiredExports, outputChannel })
resolveClassExport(moduleExports, exportName)
clearFeatureRequireCache(featureFolder)
```

### The load decision

```js
const defaultModule = require(defaultModulePath);   // always loaded
if (mode !== "user") return defaultModule;
if (!fs.existsSync(userModulePath)) { log; return defaultModule; }
try {
  const userModule = require(userModulePath);
  if (!hasRequiredExports(userModule, requiredExports)) { log missing; return defaultModule; }
  return userModule;
} catch (error) { log; return defaultModule; }
```

The built-in is **always required, even in user mode**. It is the fallback, so it must be loaded before the attempt. Cost is negligible — the whole module graph is 40ms — and it guarantees a working fallback exists.

`hasRequiredExports` checks `typeof !== "undefined"`, so it accepts any defined value, not only functions.

### Class resolution

```js
function resolveClassExport(moduleExports, exportName) {
  if (typeof moduleExports === "function") return moduleExports;          // module.exports = Class
  if (typeof moduleExports?.[exportName] === "function") return moduleExports[exportName];
  return null;
}
```

Accepts both `module.exports = DependencyManager` and `module.exports = { DependencyManager }`, so a user implementation can use either convention.

### Hot reload

```js
function clearRequireCacheByPrefix(prefixPath) {
  Object.keys(require.cache).forEach((cacheKey) => {
    if (path.resolve(cacheKey).startsWith(path.resolve(prefixPath))) delete require.cache[cacheKey];
  });
}
```

Clears the **whole feature folder** by path prefix, not just the changed file — a feature's modules import each other, so clearing one leaves stale references to the rest.

`extension.js` then calls `loadFeatureImplementations()` again and re-registers commands, disposing the previous registration via `setFeatureDisposable`.

## Pitfalls when writing one

**Module-level state does not survive a reload.** A reload clears the require cache, so your module is re-evaluated and its state resets. Anything that must persist belongs in `context.globalState` or `context.workspaceState`.

**A reload constructs new objects.** If `extension.js` builds an instance of your class, a reload builds another. Per-instance guards cannot prevent repeated work — the voice `DependencyManager` needs a *module-level* memo for exactly this reason. See [Voice Input](Voice-Input).

**Dispose everything.** Push disposables onto `context.subscriptions` and return them from your registrar. A registrar that registers a command without a disposable leaves a duplicate handler after every reload.

**The watcher fires on your own edits.** It is workspace-relative — `**/program_features/<folder>/UserImplementation/**` — so if you are developing EchoCode itself, saving your implementation triggers the reload. That is the feature working, but it means a save mid-edit can reload broken code. The fallback logging is how you notice.

**Match the built-in's contract, not just its exports.** The loader checks names, not behaviour. A `registerX` that never pushes to `context.subscriptions`, or returns nothing where `extension.js` expects a disposable, passes validation and then misbehaves.

## Adding a swappable feature

1. Put it in `program_features/<Feature>/` with a `UserImplementation/` subfolder.
2. Add a `loadProgramFeatureModule` call in `loadFeatureImplementations` with explicit `requiredExports`.
3. Add the key to `FEATURE_FOLDER_MAP` in `extension.js` — that drives both the config watcher and the file watcher.
4. Declare `echocode.featureImplementation.<key>` in `package.json` with the `builtin`/`user` enum.
5. Handle it in `registerFeatureCommands` so a reload re-registers it.

Step 3 is the one people miss. Without it the feature loads but never hot-reloads, and the setting appears to do nothing until a window reload.
