# Settings Reference

## For users

All settings live under the `echocode.` prefix. Open **Settings** and search for "echocode", or edit `settings.json` directly.

Several are written for you by **EchoCode: Select AI Provider & Model** — you rarely need to set those by hand.

### Speech and presentation

| Setting | Default | What it does |
|---|---|---|
| `echocode.voice` | `""` | Voice name for text-to-speech. Blank uses your system default. On Windows EchoCode tries `Microsoft Zira Desktop` when blank. |
| `echocode.rate` | `1` | Speech rate. `0.5` is slow, `1.5` is fast. |
| `echocode.speechSpeed` | `1` | Live speed, changed by **Ctrl+Alt+U** / **Ctrl+Alt+D**. Written automatically. |
| `echocode.guidanceLevel` | `balanced` | How much detail explanations carry: `guided`, `balanced`, or `concise`. See [Modes and Guidance](Modes-and-Guidance). |

`voice` and `rate` are the declared settings; `speechSpeed` is what the speed shortcuts actually persist. If you set a rate and it seems ignored, check `speechSpeed`.

### Mode

| Setting | Default | What it does |
|---|---|---|
| `echocode.mode` | `student` | `student` locks AI and explanation features. `dev` enables everything. |

### AI backend

| Setting | Default | What it does |
|---|---|---|
| `echocode.aiProvider` | `""` | Which backend to use: `copilot`, `ollama`, or `api`. Blank falls back to the legacy toggle below. |
| `echocode.useLocalOllama` | `false` | Legacy. Only consulted when `aiProvider` is blank. Prefer `aiProvider`. |
| `echocode.ollamaBaseUrl` | `http://127.0.0.1:11434` | Your Ollama server. Can point at another machine. |
| `echocode.ollamaModel` | `llama3.2` | Model name for Ollama. |
| `echocode.copilotModel` | `""` | Preferred Copilot model id. Blank auto-selects. |
| `echocode.apiProvider` | `""` | Hosted API preset: `openai`, `openrouter`, `groq`, `anthropic`, or `custom`. |
| `echocode.apiBaseUrl` | `""` | Full base URL including version path, e.g. `https://api.openai.com/v1`. Blank uses the preset default. |
| `echocode.apiModel` | `""` | Model id to send to the hosted API. |

**Your API key is never stored in settings.** It goes into VS Code's secret storage, which is backed by your OS keychain. There is deliberately no setting for it — see [AI Providers and Models](AI-Providers-and-Models).

### Feature implementation swapping

Eight settings of the form `echocode.featureImplementation.<feature>`, each `builtin` (default) or `user`:

`annotationsBigO`, `assignmentTracker`, `errorParser`, `chatBot`, `fileConnector`, `folderFileCreator`, `voice`, `whatIsThis`

Set one to `user` and EchoCode loads your own code from that feature's `UserImplementation/` folder instead of the built-in version. This is a development feature — see [Custom Feature Implementations](Custom-Feature-Implementations). If your replacement is missing or broken, EchoCode silently falls back to the built-in one and logs why.

---

## For developers

### Where settings are declared and read

Declared in `package.json` under `contributes.configuration.properties`. Read through the standard API:

```js
const config = vscode.workspace.getConfiguration("echocode");
config.get("ollamaModel", "llama3.2");
```

Written with an explicit global target:

```js
await config.update(key, value, vscode.ConfigurationTarget.Global);
```

`aiProviderSetup.js` wraps that as `saveGlobal()`. Global is deliberate — an AI backend choice is a property of the machine, not the folder you happen to have open.

### The provider resolution chain

`getAiSettings()` in `Core/program_settings/program_settings/AIrequest.js` is the single place backend choice is resolved:

```js
const useLocalOllama = config.get("useLocalOllama", false);
const explicitProvider = config.get("aiProvider", "");
const provider = explicitProvider || (useLocalOllama ? "ollama" : "copilot");
```

`aiProvider` is canonical. `useLocalOllama` predates it and is honoured only when `aiProvider` is blank, so installs that predate the newer setting keep working across an update without the user touching anything. **Keep that fallback** if you refactor — removing it silently reverts those users to Copilot.

Note the final default: with both unset, the provider is `copilot`.

### Secrets are not settings

API keys go through `Core/program_settings/program_settings/secretStore.js`, which wraps `context.secrets` (the OS keychain):

```js
function keyName(providerId) {
  return `echocode.apiKey.${providerId || "custom"}`;
}
```

`initSecretStorage(context)` must be called during activation before any provider code reads a key. `isAvailable()` reports whether storage exists at all, and the hosted-API flow refuses to proceed without it rather than falling back to plaintext.

Settings files are plaintext, frequently committed, and sync across machines — which is exactly why there is no key setting. Do not add one.

### Reacting to changes

`extension.js` subscribes to configuration changes, but only watches the feature-implementation keys:

```js
vscode.workspace.onDidChangeConfiguration((event) => {
  for (const featureKey of RELOADABLE_FEATURE_KEYS) {
    const settingKey = `echocode.featureImplementation.${featureKey}`;
    if (event.affectsConfiguration(settingKey)) {
      scheduleFeatureReload(featureKey, "configuration changed");
    }
  }
});
```

Reloads are debounced 150ms per feature, because a settings edit can fire several events in quick succession.

Other settings are read on demand rather than cached, so they take effect on next use without a reload. The exception is `speechSpeed`, held in a module-level variable in the speech handler and refreshed by `loadSavedSpeechSpeed()`.

### Adding a setting

1. Declare it in `package.json` with a `type`, `default`, and a `description` a screen reader can read usefully.
2. Read it with `config.get(key, default)` — pass the default at every call site rather than relying on the manifest, so the code still behaves if the manifest drifts.
3. If it needs to take effect immediately, extend the `onDidChangeConfiguration` handler; otherwise on-demand reads are fine.
4. If it is machine-scoped, write it with `ConfigurationTarget.Global`.
