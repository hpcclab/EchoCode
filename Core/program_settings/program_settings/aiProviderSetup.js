const vscode = require("vscode");
const { listOllamaModels, listCopilotModels } = require("./AIrequest");

const FIRST_RUN_KEY = "echocode.aiProviderConfigured";

async function speak(message) {
  try {
    const {
      speakMessage,
    } = require("../speech_settings/speechHandler");
    await speakMessage(message);
  } catch (_) {
    // TTS is best-effort here; the quick pick UI is still fully usable without it.
  }
}

/**
 * Probes both providers for what's actually available right now.
 * Copilot models come from vscode.lm; Ollama models come from a live /api/tags call.
 * Either probe failing (extension missing, server not running) just yields an empty list.
 */
async function detectProviders(outputChannel) {
  const result = {
    copilot: { available: false, models: [] },
    ollama: { available: false, models: [] },
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

  return result;
}

/**
 * Two-step quick pick: choose a provider, then choose one of its detected models.
 * Persists the choice to EchoCode's global settings. Returns true if a choice was saved.
 */
async function pickProviderAndModel(context, outputChannel) {
  const detected = await detectProviders(outputChannel);
  const config = vscode.workspace.getConfiguration("echocode");

  const providerPick = await vscode.window.showQuickPick(
    [
      {
        label: "$(github) GitHub Copilot",
        value: "copilot",
        detail: detected.copilot.available
          ? `${detected.copilot.models.length} model(s) detected`
          : "Not detected — install/sign in to GitHub Copilot Chat",
      },
      {
        label: "$(server-environment) Local Ollama",
        value: "ollama",
        detail: detected.ollama.available
          ? `${detected.ollama.models.length} model(s) installed`
          : "Not detected — is Ollama running at the configured URL?",
      },
    ],
    {
      placeHolder: "Choose your EchoCode AI provider",
      ignoreFocusOut: true,
    },
  );

  if (!providerPick) {
    return false;
  }

  if (providerPick.value === "copilot") {
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

    await config.update(
      "useLocalOllama",
      false,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "copilotModel",
      modelValue,
      vscode.ConfigurationTarget.Global,
    );

    vscode.window.showInformationMessage(
      `EchoCode: Using GitHub Copilot (${modelLabel}).`,
    );
    await speak(`EchoCode will use GitHub Copilot with ${modelLabel}.`);
  } else {
    let modelName = "";

    if (detected.ollama.models.length) {
      const modelPick = await vscode.window.showQuickPick(
        detected.ollama.models.map((name) => ({ label: name })),
        {
          placeHolder: "Choose an installed Ollama model",
          ignoreFocusOut: true,
        },
      );
      if (!modelPick) return false;
      modelName = modelPick.label;
    } else {
      const proceed = await vscode.window.showWarningMessage(
        "No installed Ollama models were detected. Make sure Ollama is running and you've pulled a model (e.g. `ollama pull llama3.2`).",
        "Enter Model Name Manually",
        "Cancel",
      );
      if (proceed !== "Enter Model Name Manually") return false;

      const manual = await vscode.window.showInputBox({
        prompt: "Enter the Ollama model name (e.g. llama3.2)",
        placeHolder: "llama3.2",
        ignoreFocusOut: true,
      });
      if (!manual) return false;
      modelName = manual;
    }

    await config.update(
      "useLocalOllama",
      true,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "ollamaModel",
      modelName,
      vscode.ConfigurationTarget.Global,
    );

    vscode.window.showInformationMessage(
      `EchoCode: Using local Ollama model "${modelName}".`,
    );
    await speak(`EchoCode will use the local Ollama model ${modelName}.`);
  }

  await context.globalState.update(FIRST_RUN_KEY, true);
  return true;
}

/**
 * Re-probes both providers and warns if the currently configured model has
 * disappeared (Ollama model removed, Copilot model deprecated/renamed, etc).
 * Safe to call on every activation; does nothing intrusive when everything still matches.
 */
async function checkForProviderUpdates(context, outputChannel) {
  const config = vscode.workspace.getConfiguration("echocode");
  const detected = await detectProviders(outputChannel);
  const usingOllama = config.get("useLocalOllama", false);

  if (usingOllama) {
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
 * Every launch after that: silently rechecks availability (Ollama/Copilot both change often).
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
};
