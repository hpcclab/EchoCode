const vscode = require("vscode");
const {
  listOllamaModels,
  listCopilotModels,
  listApiModels,
  pullOllamaModel,
} = require("./AIrequest");
const { API_PRESETS, getPreset, normalizeBaseUrl } = require("./apiProviders");
const { getApiKey, setApiKey, isAvailable } = require("./secretStore");
const { scanSystemSpecs, recommendModel, describeSpecs } = require("./systemScan");

const FIRST_RUN_KEY = "echocode.aiProviderConfigured";

// Sentinel returned by a branch when the user backed out to the API-or-Local question
// instead of finishing or cancelling outright.
const BACK = "back";

// Guards the setup loop against a user bouncing between branches forever.
const MAX_BRANCH_HOPS = 12;

async function speak(message) {
  try {
    const { speakMessage } = require("../speech_settings/speechHandler");
    await speakMessage(message);
  } catch (_) {
    // TTS is best-effort here; the quick pick UI is still fully usable without it.
  }
}

async function saveGlobal(config, key, value) {
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}

/**
 * Probes every provider for what's actually available right now.
 * Copilot models come from vscode.lm; Ollama models come from a live /api/tags call;
 * the hosted-API entry reports whatever endpoint the user has already configured.
 * Any probe failing (extension missing, server not running) just yields an empty list.
 */
async function detectProviders(outputChannel) {
  const result = {
    copilot: { available: false, models: [] },
    ollama: { available: false, models: [] },
    api: { available: false, models: [], configured: false },
  };

  try {
    const copilotModels = await listCopilotModels();
    result.copilot.available = copilotModels.length > 0;
    result.copilot.models = copilotModels;
  } catch (err) {
    outputChannel?.appendLine(
      `[AI Setup] Copilot model detection failed: ${err.message}`,
    );
  }

  try {
    const ollamaModels = await listOllamaModels({ timeoutMs: 2000 });
    result.ollama.available = ollamaModels.length > 0;
    result.ollama.models = ollamaModels;
  } catch (err) {
    outputChannel?.appendLine(
      `[AI Setup] Ollama model detection failed: ${err.message}`,
    );
  }

  const config = vscode.workspace.getConfiguration("echocode");
  const apiProviderId = config.get("apiProvider", "");
  if (apiProviderId) {
    result.api.configured = true;
    try {
      const preset = getPreset(apiProviderId);
      const models = await listApiModels(
        {
          baseUrl: config.get("apiBaseUrl", "") || preset?.baseUrl || "",
          apiKey: await getApiKey(apiProviderId),
          wire: preset?.wire || "openai",
        },
        { timeoutMs: 5000 },
      );
      result.api.available = models.length > 0;
      result.api.models = models;
    } catch (err) {
      outputChannel?.appendLine(
        `[AI Setup] API provider check failed: ${err.message}`,
      );
    }
  }

  return result;
}

/* ------------------------------------------------------------------ *
 * Hosted API branch
 * ------------------------------------------------------------------ */

/**
 * Asks for the endpoint and key, then proves the endpoint answers before saving
 * anything. Verifying up front means the first real EchoCode request can't be the
 * thing that discovers a typo'd URL or a rejected key.
 */
async function configureApiProvider(context, outputChannel) {
  const presetPick = await vscode.window.showQuickPick(
    API_PRESETS.map((p) => ({
      label: p.label,
      detail: p.detail || p.baseUrl,
      value: p.id,
    })),
    {
      placeHolder: "Which model API do you want to use?",
      ignoreFocusOut: true,
    },
  );

  if (!presetPick) return BACK;

  const preset = getPreset(presetPick.value);

  const baseUrl = await vscode.window.showInputBox({
    prompt: "API base URL",
    value: preset.baseUrl,
    placeHolder: "https://api.example.com/v1",
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || !value.trim()) return "A base URL is required.";
      try {
        new URL(value.trim());
        return null;
      } catch {
        return "That is not a valid URL.";
      }
    },
  });
  if (!baseUrl) return false;

  if (!isAvailable()) {
    vscode.window.showErrorMessage(
      "EchoCode cannot store an API key because VS Code secret storage is unavailable.",
    );
    return false;
  }

  const existingKey = await getApiKey(preset.id);
  const apiKey = await vscode.window.showInputBox({
    prompt: existingKey
      ? `API key for ${preset.label} (leave blank to keep the saved key)`
      : `API key for ${preset.label}`,
    placeHolder: preset.keyHint,
    password: true,
    ignoreFocusOut: true,
  });
  // An explicit Escape cancels; an empty box means "reuse what's stored".
  if (apiKey === undefined) return false;

  const effectiveKey = apiKey.trim() || existingKey;

  // --- Verify the API can be reached (and populate the model list) ---
  let models = [];
  try {
    models = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `EchoCode: contacting ${preset.label}…`,
        cancellable: false,
      },
      () =>
        listApiModels(
          {
            baseUrl: normalizeBaseUrl(baseUrl),
            apiKey: effectiveKey,
            wire: preset.wire,
          },
          { timeoutMs: 15000 },
        ),
    );
  } catch (err) {
    outputChannel?.appendLine(`[AI Setup] API verification failed: ${err.message}`);
    await speak(`Could not reach ${preset.label}.`);

    const retry = await vscode.window.showErrorMessage(
      `EchoCode could not reach ${preset.label}: ${err.message}`,
      "Try Again",
      "Choose a Different Provider",
    );
    if (retry === "Try Again") return configureApiProvider(context, outputChannel);
    return BACK;
  }

  // --- User selects the model ---
  const MANUAL = "__manual__";
  const items = [
    ...models.map((m) => ({
      label: m.id,
      description: m.owner || undefined,
      value: m.id,
    })),
    {
      label: "$(edit) Enter a model name manually",
      value: MANUAL,
    },
  ];

  const modelPick = await vscode.window.showQuickPick(items, {
    placeHolder: `Choose a ${preset.label} model (${models.length} available)`,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });
  if (!modelPick) return false;

  let modelId = modelPick.value;
  if (modelId === MANUAL) {
    const manual = await vscode.window.showInputBox({
      prompt: `Model name for ${preset.label}`,
      ignoreFocusOut: true,
    });
    if (!manual || !manual.trim()) return false;
    modelId = manual.trim();
  }

  // --- Persist: EchoCode routes models there ---
  const config = vscode.workspace.getConfiguration("echocode");
  if (apiKey.trim()) {
    await setApiKey(preset.id, apiKey.trim());
  }
  await saveGlobal(config, "aiProvider", "api");
  await saveGlobal(config, "useLocalOllama", false);
  await saveGlobal(config, "apiProvider", preset.id);
  await saveGlobal(config, "apiBaseUrl", normalizeBaseUrl(baseUrl));
  await saveGlobal(config, "apiModel", modelId);

  vscode.window.showInformationMessage(
    `EchoCode: Using ${preset.label} (${modelId}).`,
  );
  await speak(`EchoCode will use ${preset.label} with ${modelId}.`);
  await context.globalState.update(FIRST_RUN_KEY, true);
  return true;
}

async function configureCopilot(context, detected) {
  if (!detected.copilot.models.length) {
    vscode.window.showWarningMessage(
      "No Copilot models were detected. Make sure GitHub Copilot Chat is installed and you're signed in.",
    );
  }

  let modelValue = "";
  let modelLabel = "the default model";
  if (detected.copilot.models.length) {
    const modelPick = await vscode.window.showQuickPick(
      detected.copilot.models.map((m) => ({
        label: m.name,
        description: m.family,
        value: m.id,
      })),
      { placeHolder: "Choose a Copilot model", ignoreFocusOut: true },
    );
    if (!modelPick) return false;
    modelValue = modelPick.value;
    modelLabel = modelPick.label;
  }

  const config = vscode.workspace.getConfiguration("echocode");
  await saveGlobal(config, "aiProvider", "copilot");
  await saveGlobal(config, "useLocalOllama", false);
  await saveGlobal(config, "copilotModel", modelValue);

  vscode.window.showInformationMessage(
    `EchoCode: Using GitHub Copilot (${modelLabel}).`,
  );
  await speak(`EchoCode will use GitHub Copilot with ${modelLabel}.`);
  await context.globalState.update(FIRST_RUN_KEY, true);
  return true;
}

/**
 * The API side of the fork: Copilot rides on VS Code's own language model API, so it
 * needs no URL or key; anything else is a third-party endpoint we have to verify.
 */
async function runApiBranch(context, outputChannel, detected) {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "$(github) GitHub Copilot",
        value: "copilot",
        detail: detected.copilot.available
          ? `${detected.copilot.models.length} model(s) detected — no API key needed`
          : "Not detected — install/sign in to GitHub Copilot Chat",
      },
      {
        label: "$(cloud) Another model API",
        value: "api",
        detail: "OpenAI, OpenRouter, Groq, Anthropic, or a custom endpoint",
      },
      { label: "$(arrow-left) Back", value: BACK },
    ],
    { placeHolder: "What model do you want?", ignoreFocusOut: true },
  );

  if (!choice) return false;
  if (choice.value === BACK) return BACK;
  if (choice.value === "copilot") return configureCopilot(context, detected);
  return configureApiProvider(context, outputChannel);
}

/* ------------------------------------------------------------------ *
 * Local Ollama branch
 * ------------------------------------------------------------------ */

async function saveOllamaChoice(context, modelName) {
  const config = vscode.workspace.getConfiguration("echocode");
  await saveGlobal(config, "aiProvider", "ollama");
  await saveGlobal(config, "useLocalOllama", true);
  await saveGlobal(config, "ollamaModel", modelName);

  vscode.window.showInformationMessage(
    `EchoCode: Using local Ollama model "${modelName}".`,
  );
  await speak(`EchoCode will use the local Ollama model ${modelName}.`);
  await context.globalState.update(FIRST_RUN_KEY, true);
  return true;
}

/**
 * The "Ollama Model Install" subgraph: read the machine, recommend a model that fits
 * it, confirm, then pull. Sizing matters here because a model that overruns memory
 * doesn't fail loudly — it swaps, and EchoCode just feels broken.
 */
async function installRecommendedModel(context, outputChannel) {
  const specs = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "EchoCode: checking what your machine can run…",
      cancellable: false,
    },
    () => scanSystemSpecs(),
  );

  const { recommended, alternatives, underpowered, budgetGb } =
    recommendModel(specs);

  outputChannel?.appendLine(
    `[AI Setup] System scan: ${describeSpecs(specs)} (usable model budget ~${budgetGb.toFixed(1)} GB)`,
  );
  // Kept deliberately short: this is spoken before the quick pick opens, and reading
  // the full hardware summary aloud stalls setup for ten-plus seconds. The details go
  // to the output channel above and to the quick pick itself, which a screen reader
  // announces on focus anyway.
  await speak(`Recommending ${recommended.name} for this machine.`);

  if (underpowered) {
    vscode.window.showWarningMessage(
      `EchoCode: this machine has about ${budgetGb.toFixed(1)} GB to spare, which is below what any recommended model wants. ${recommended.name} will run but may be slow.`,
    );
  }

  const CUSTOM = "__custom__";
  const modelPick = await vscode.window.showQuickPick(
    [
      {
        label: `$(star-full) ${recommended.name}`,
        description: "Recommended for this machine",
        detail: `${recommended.blurb} Needs roughly ${recommended.requiredGb} GB.`,
        value: recommended.name,
      },
      ...alternatives.map((m) => ({
        label: m.name,
        description:
          m.requiredGb > budgetGb ? "May not fit this machine" : "Also fits",
        detail: `${m.blurb} Needs roughly ${m.requiredGb} GB.`,
        value: m.name,
      })),
      {
        label: "$(edit) Enter a different model name",
        value: CUSTOM,
      },
    ],
    {
      placeHolder: `Install for you — ${describeSpecs(specs)}`,
      ignoreFocusOut: true,
      matchOnDetail: true,
    },
  );

  if (!modelPick) return BACK;

  let modelName = modelPick.value;
  if (modelName === CUSTOM) {
    const manual = await vscode.window.showInputBox({
      prompt: "Ollama model name to pull (e.g. llama3.2, qwen2.5-coder:7b)",
      ignoreFocusOut: true,
    });
    if (!manual || !manual.trim()) return BACK;
    modelName = manual.trim();
  }

  const confirm = await vscode.window.showInformationMessage(
    `Download "${modelName}" now? This can take several minutes and uses several gigabytes of disk.`,
    { modal: true },
    "Install",
  );
  if (confirm !== "Install") return BACK;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `EchoCode: downloading ${modelName}`,
        cancellable: true,
      },
      async (progress, token) => {
        let lastPercent = 0;
        await pullOllamaModel(modelName, {
          cancellationToken: token,
          onProgress: ({ status, completed, total }) => {
            if (total > 0) {
              const percent = Math.floor((completed / total) * 100);
              // report() takes an increment, so send only the delta since last tick.
              const increment = Math.max(0, percent - lastPercent);
              lastPercent = percent;
              progress.report({ message: `${status} — ${percent}%`, increment });
            } else {
              progress.report({ message: status });
            }
          },
        });
      },
    );
  } catch (err) {
    outputChannel?.appendLine(`[AI Setup] Model pull failed: ${err.message}`);
    vscode.window.showErrorMessage(
      `EchoCode: could not download "${modelName}": ${err.message}`,
    );
    await speak(`The download failed. ${err.message}`);
    return BACK;
  }

  await speak(`${modelName} is installed.`);
  return saveOllamaChoice(context, modelName);
}

/**
 * The local side of the fork. Scanning the configured Ollama address is the first
 * gate: if nothing answers there we warn and hand the user back to the top-level
 * choice rather than dead-ending them in a branch that cannot work.
 */
async function runLocalBranch(context, outputChannel) {
  const config = vscode.workspace.getConfiguration("echocode");
  let baseUrl = config.get("ollamaBaseUrl", "http://127.0.0.1:11434");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let models = null;

    try {
      models = await listOllamaModels({ baseUrl, timeoutMs: 3000 });
    } catch (err) {
      outputChannel?.appendLine(
        `[AI Setup] Ollama not reachable at ${baseUrl}: ${err.message}`,
      );
    }

    // --- Ollama itself is not answering ---
    if (models === null) {
      await speak("Ollama was not detected.");
      const choice = await vscode.window.showWarningMessage(
        `EchoCode: Ollama is not responding at ${baseUrl}. Make sure Ollama is installed and running, then try again.`,
        "Retry",
        "Change Address",
        "Use an API Instead",
      );

      if (choice === "Retry") continue;
      if (choice === "Change Address") {
        const entered = await vscode.window.showInputBox({
          prompt: "Ollama server address",
          value: baseUrl,
          ignoreFocusOut: true,
        });
        if (!entered) return false;
        baseUrl = normalizeBaseUrl(entered);
        await saveGlobal(config, "ollamaBaseUrl", baseUrl);
        continue;
      }
      if (choice === "Use an API Instead") return BACK;
      return false;
    }

    // --- Reachable, and models are installed ---
    if (models.length) {
      const INSTALL = "__install__";
      const pick = await vscode.window.showQuickPick(
        [
          ...models.map((name) => ({ label: name, value: name })),
          {
            label: "$(cloud-download) Install another model…",
            value: INSTALL,
          },
        ],
        {
          placeHolder: "Choose an installed Ollama model",
          ignoreFocusOut: true,
        },
      );
      if (!pick) return false;
      if (pick.value === INSTALL) {
        return installRecommendedModel(context, outputChannel);
      }
      return saveOllamaChoice(context, pick.value);
    }

    // --- Reachable, but nothing is installed ---
    await speak("Ollama is running, but no models are installed.");
    const careToInstall = await vscode.window.showWarningMessage(
      "EchoCode: Ollama is running but has no models installed. Would you like EchoCode to recommend and install one?",
      "Recommend a Model",
      "Enter Model Name",
      "Use an API Instead",
    );

    if (careToInstall === "Recommend a Model") {
      const result = await installRecommendedModel(context, outputChannel);
      if (result === BACK) continue;
      return result;
    }

    if (careToInstall === "Enter Model Name") {
      const manual = await vscode.window.showInputBox({
        prompt: "Enter the Ollama model name (e.g. llama3.2)",
        placeHolder: "llama3.2",
        ignoreFocusOut: true,
      });
      if (!manual || !manual.trim()) continue;
      return saveOllamaChoice(context, manual.trim());
    }

    if (careToInstall === "Use an API Instead") return BACK;
    return false;
  }

  return false;
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

/**
 * The top-level "API or Local" fork. Each branch can hand control back here, which is
 * what makes "Ollama isn't installed" recoverable without restarting setup.
 * Persists the choice to EchoCode's global settings; returns true if one was saved.
 */
async function pickProviderAndModel(context, outputChannel) {
  const detected = await detectProviders(outputChannel);

  for (let hop = 0; hop < MAX_BRANCH_HOPS; hop += 1) {
    const providerPick = await vscode.window.showQuickPick(
      [
        {
          label: "$(cloud) API model",
          value: "api",
          detail: detected.copilot.available
            ? `GitHub Copilot (${detected.copilot.models.length} model(s)) or another hosted API`
            : "GitHub Copilot, OpenAI, OpenRouter, Groq, Anthropic, or a custom endpoint",
        },
        {
          label: "$(server-environment) Local model (Ollama)",
          value: "local",
          detail: detected.ollama.available
            ? `${detected.ollama.models.length} model(s) installed — runs entirely on this machine`
            : "Runs entirely on this machine — EchoCode will help you set it up",
        },
      ],
      {
        placeHolder: "Choose your EchoCode AI provider",
        ignoreFocusOut: true,
      },
    );

    if (!providerPick) return false;

    const result =
      providerPick.value === "api"
        ? await runApiBranch(context, outputChannel, detected)
        : await runLocalBranch(context, outputChannel);

    if (result !== BACK) return result;
  }

  return false;
}

/**
 * Re-probes the active provider and warns if the configured model has disappeared
 * (Ollama model removed, Copilot model deprecated/renamed, API key revoked, etc).
 * Safe to call on every activation; does nothing intrusive when everything matches.
 */
async function checkForProviderUpdates(context, outputChannel) {
  const config = vscode.workspace.getConfiguration("echocode");
  const detected = await detectProviders(outputChannel);

  const explicitProvider = config.get("aiProvider", "");
  const provider =
    explicitProvider || (config.get("useLocalOllama", false) ? "ollama" : "copilot");

  if (provider === "ollama") {
    const currentModel = config.get("ollamaModel", "");
    if (!detected.ollama.available) {
      outputChannel?.appendLine(
        "[AI Setup] Ollama is selected but not reachable at the configured URL.",
      );
    } else if (currentModel && !detected.ollama.models.includes(currentModel)) {
      outputChannel?.appendLine(
        `[AI Setup] Configured Ollama model "${currentModel}" is no longer installed. Available: ${detected.ollama.models.join(", ") || "none"}`,
      );
      const choice = await vscode.window.showWarningMessage(
        `EchoCode: The configured Ollama model "${currentModel}" was not found. Choose a different installed model?`,
        "Choose Model",
        "Dismiss",
      );
      if (choice === "Choose Model") {
        await pickProviderAndModel(context, outputChannel);
      }
    }
  } else if (provider === "api") {
    const currentModel = config.get("apiModel", "");
    const presetId = config.get("apiProvider", "");
    const label = getPreset(presetId)?.label || presetId || "the API provider";

    if (!detected.api.available) {
      outputChannel?.appendLine(
        `[AI Setup] ${label} is selected but did not respond to a model listing.`,
      );
    } else if (
      currentModel &&
      !detected.api.models.some((m) => m.id === currentModel)
    ) {
      outputChannel?.appendLine(
        `[AI Setup] Configured ${label} model "${currentModel}" is no longer offered.`,
      );
      const choice = await vscode.window.showWarningMessage(
        `EchoCode: ${label} no longer offers the model "${currentModel}". Choose a different one?`,
        "Choose Model",
        "Dismiss",
      );
      if (choice === "Choose Model") {
        await pickProviderAndModel(context, outputChannel);
      }
    }
  } else {
    const currentModel = config.get("copilotModel", "");
    if (!detected.copilot.available) {
      outputChannel?.appendLine(
        "[AI Setup] Copilot is selected but no models were detected.",
      );
    } else if (
      currentModel &&
      !detected.copilot.models.some((m) => m.id === currentModel)
    ) {
      outputChannel?.appendLine(
        `[AI Setup] Configured Copilot model "${currentModel}" is no longer available; EchoCode will fall back to a default model automatically.`,
      );
    }
  }

  return detected;
}

/**
 * Called once per activation. First launch ever: shows the provider/model picker.
 * Every launch after that: silently rechecks availability (Ollama/Copilot/API model
 * lineups all change often).
 */
async function initializeAIProviderOnStartup(context, outputChannel) {
  const alreadyConfigured = context.globalState.get(FIRST_RUN_KEY, false);

  if (!alreadyConfigured) {
    await speak("Welcome to EchoCode. Let's choose your AI provider.");
    await pickProviderAndModel(context, outputChannel);
    return;
  }

  await checkForProviderUpdates(context, outputChannel);
}

module.exports = {
  detectProviders,
  pickProviderAndModel,
  checkForProviderUpdates,
  initializeAIProviderOnStartup,
  installRecommendedModel,
};
