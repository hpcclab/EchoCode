# Architecture

> **Developer page.** Nothing here is user-facing.

## The shape of the thing

EchoCode is a single-process VS Code extension, roughly 10,200 lines of JavaScript (not TypeScript — see below). It has three layers:

```
extension.js                  Wiring: activation, command registration, dispatch
  ├── program_features/       User-facing features, swappable at runtime
  ├── navigation_features/     Cursor/file/folder movement (not swappable)
  └── Core/                    Shared services: AI routing, speech, mode, guidance
```

`extension.js` is the only module that knows about all the others. Features do not import each other — with two documented exceptions noted below.

## Why JavaScript with a TypeScript build

`package.json` sets `"main": "./extension.js"` — the runtime entry point is plain CommonJS JavaScript. But there is a `tsconfig.json`, a `src/` directory, and an `out/` directory.

The TypeScript build exists **only for the test suite**. `tsconfig.json` has `"rootDir": "src"` and `"exclude": ["test", …]`, and `.vscodeignore` excludes `src/`, `out/`, and `tsconfig.json` from the VSIX. Nothing at runtime requires `out/`.

So: `npm run compile` passing tells you the TS scaffold is intact, not that the extension works. The extension is never type-checked.

## Activation

Activation events are declared in `package.json`. The important one is `onStartupFinished` — EchoCode waits until VS Code has finished loading rather than delaying startup. The rest are `onCommand:` entries, which let VS Code activate lazily if a command fires first.

`activate(context)` in rough order:

1. Create the `EchoCode` output channel
2. `loadFeatureImplementations(outputChannel)` — load every feature module through the loader
3. Register commands, grouped by feature key
4. `initSecretStorage(context)`
5. Chain the Copilot warm-up into `initializeAIProviderOnStartup` — **not awaited**
6. Kick off the voice dependency bootstrap — **not awaited**
7. `initExternalCommandRegistry(context)` then `buildExternalCommandRegistry()` — **not awaited**
8. `refreshModeContext()` — set the mode context keys
9. Register file watchers and the configuration-change listener

### What is deliberately not awaited, and why

Three things at activation can take a long time, and each used to hold up the whole extension:

| Work | Why it is slow |
|---|---|
| AI provider check | A cold `vscode.lm` call waits for Copilot to activate and sign in |
| Voice dependency bootstrap | Can pip-install several hundred MB |
| External command registry | Enumerates ~3300 commands, writes 620KB |

All three are fire-and-forget with a `.catch()` that logs. Consumers resolve what they need later — voice commands read the Python path from `globalState` when they actually run.

**Do not await these.** The AI provider path in particular was measured at up to a minute with nothing rendered, which reads as a frozen extension.

### The Copilot warm-up is conditional

```js
const copilotWarmup =
  getAiSettings().provider === "copilot"
    ? tryEnsureCopilotActivated(outputChannel)
    : Promise.resolve(null);

copilotWarmup.then(() => initializeAIProviderOnStartup(context, outputChannel))
```

Ollama and hosted-API users should not pay to activate an extension they never call. The chain exists because the startup check probes Copilot through `vscode.lm`, which reports no models until Copilot is live.

The trade-off: for non-Copilot users, `detectProviders` then hits `selectChatModels` cold. That is why `listCopilotModels` has its own 3s cap — see [AI Providers and Models](AI-Providers-and-Models).

`tryEnsureCopilotActivated` races activation against a 5s timeout. Warming is only ever an optimisation and must never block.

## The request path

Every AI-backed feature goes through one funnel:

```
feature
  → AIrequest.js  (analyzeAI / requestTextFromMessages / generateCodeFromVoice / classifyVoiceIntent)
  → dispatchMessages()
  → copilot | ollama | api
```

Features never know which backend answered. **Add a backend in `dispatchMessages`**, not in a feature.

## Shared services under Core/

| Service | Module | Notes |
|---|---|---|
| AI routing | `program_settings/AIrequest.js` | The funnel above |
| Provider setup | `program_settings/aiProviderSetup.js` | Wizard, detection, startup re-check |
| HTTP | `program_settings/httpClient.js` | Dependency-free; JSON and NDJSON |
| Secrets | `program_settings/secretStore.js` | `context.secrets`, never settings |
| Hardware scan | `program_settings/systemScan.js` | Model recommendation |
| Speech | `speech_settings/speechHandler.js` | See [Speech Handler](Speech-Handler) |
| Mode | `mode.js`, `guard.js`, `modeAudio.js` | See [Modes and Guidance](Modes-and-Guidance) |
| Guidance | `guide_settings/guidanceLevel.js` | Verbosity formatting |
| Summaries | `Summarizer/` | Not swappable |

## Cross-feature coupling

Two places where features reach across, both deliberate and both worth knowing:

**`Chat_Tutor.js` requires `extension.js` back**, lazily inside a handler:

```js
const { tryExecuteVoiceCommand } = require("../../extension");
```

A circular dependency that works only because the require is deferred until after `extension.js` has finished evaluating. Hoisting it to module scope gets `undefined`.

**File/folder creation imports the navigation cursor:**

```js
const { getCurrentFolder } = require(".../folder_navigator");
```

So creation follows the navigation cursor rather than the Explorer selection. See [File and Folder Tools](File-and-Folder-Tools).

## Hot reload

`extension.js` watches for changes and rebuilds features in place:

```js
const watcher = vscode.workspace.createFileSystemWatcher(
  `**/program_features/${featureFolder}/UserImplementation/**`,
);
```

plus a configuration listener on the eight `featureImplementation.*` keys. Both route into `scheduleFeatureReload(featureKey, reason)`, debounced 150ms, which calls `reloadFeatureImplementation` → `clearFeatureRequireCache(featureFolder)` → `loadFeatureImplementations()`.

Two consequences that have caused real bugs:

- **A reload constructs fresh feature objects.** Anything holding per-instance state gets a new one. The voice `DependencyManager` needs a *module-level* memo for exactly this reason — see [Voice Input](Voice-Input).
- **The watcher is workspace-relative.** If you are developing EchoCode itself, editing files in your own checkout triggers reloads.

`setFeatureDisposable(featureKey, disposable)` disposes the previous registration before storing the new one, so a reload does not leave duplicate command handlers.

## Resource disposal

Everything registered goes into `context.subscriptions`. A clean activation registers ~53.

Two things are easy to leak and have been:

- **File watchers.** `fs.watch` handles must be `close()`d and tied to the extension lifetime. `ExternalIntentRouter` registers a `vscode.Disposable` for its watcher in `initExternalCommandRegistry`.
- **Decoration types.** `TextEditorDecorationType` must be disposed, not just cleared. See [Annotations](Annotations-and-Big-O).

## Where generated data lives

| Data | Location | Why |
|---|---|---|
| External command registry | `context.globalStorageUri` | Per-user, survives updates, regenerable |
| Voice venv (`echo_venv`) | `context.globalStorageUri` | Same |
| API keys | `context.secrets` (OS keychain) | Never plaintext |
| Settings | VS Code settings | User-editable |
| Python interpreter path | `context.globalState` | Cheap lookup for voice commands |

**Never write generated data next to the source.** VS Code replaces the install directory wholesale on every extension update, so anything there is silently discarded — and the directory is not guaranteed writable on managed installs.

## Reading the code in a sensible order

1. `package.json` — `contributes` tells you the whole user-facing surface
2. `extension.js` `activate()` — the wiring
3. `program_features/featureImplementationLoader.js` — how modules load
4. `Core/program_settings/program_settings/AIrequest.js` — the AI funnel
5. Any one feature module — they all follow the same shape
