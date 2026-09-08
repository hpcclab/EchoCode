const vscode = require("vscode");
const { requestJson, requestNdjson } = require("./httpClient");
const { getPreset, listApiModels, sendApiChat } = require("./apiProviders");
const { getApiKey } = require("./secretStore");

/**
 * Reads the active AI backend from settings.
 *
 * `echocode.aiProvider` is the canonical setting. `echocode.useLocalOllama` predates
 * it and is still honoured when the new setting is blank, so existing installs keep
 * working after an update without the user touching anything.
 */
function getAiSettings() {
  const config = vscode.workspace.getConfiguration("echocode");

  const useLocalOllama = config.get("useLocalOllama", false);
  const explicitProvider = config.get("aiProvider", "");
  const provider = explicitProvider || (useLocalOllama ? "ollama" : "copilot");

  const apiProviderId = config.get("apiProvider", "");
  const preset = getPreset(apiProviderId);

  return {
    provider,
    useLocalOllama: provider === "ollama",
    ollamaBaseUrl: config.get("ollamaBaseUrl", "http://127.0.0.1:11434"),
    ollamaModel: config.get("ollamaModel", "llama3.2"),
    copilotModel: config.get("copilotModel", ""),
    apiProviderId,
    apiBaseUrl: config.get("apiBaseUrl", "") || preset?.baseUrl || "",
    apiModel: config.get("apiModel", ""),
    apiWire: preset?.wire || "openai",
  };
}

/**
 * Settings plus the API key from secret storage. Only the hosted-API path needs the
 * key, so the async lookup stays out of the synchronous settings read.
 */
async function resolveAiSettings() {
  const settings = getAiSettings();
  if (settings.provider === "api") {
    settings.apiKey = await getApiKey(settings.apiProviderId);
  }
  return settings;
}

async function listOllamaModels(opts = {}) {
  const settings = getAiSettings();
  const baseUrl = String(opts.baseUrl || settings.ollamaBaseUrl || "").replace(
    /\/$/,
    "",
  );
  const url = `${baseUrl}/api/tags`;

  const json = await requestJson(url, null, {
    method: "GET",
    timeoutMs: opts.timeoutMs ?? 3000,
    label: "Ollama",
  });

  if (!json || !Array.isArray(json.models)) {
    return [];
  }

  return json.models.map((m) => m && m.name).filter(Boolean);
}

/**
 * Downloads a model into the user's Ollama install. Uses Ollama's HTTP API rather
 * than shelling out to `ollama pull` so it also works when the server is on another
 * machine, and so the NDJSON progress stream can drive a real progress bar.
 */
async function pullOllamaModel(modelName, opts = {}) {
  const settings = getAiSettings();
  const baseUrl = String(opts.baseUrl || settings.ollamaBaseUrl || "").replace(
    /\/$/,
    "",
  );

  let lastStatus = "";
  await requestNdjson(
    `${baseUrl}/api/pull`,
    { name: modelName, stream: true },
    {
      label: "Ollama",
      cancellationToken: opts.cancellationToken,
      onEvent: (event) => {
        if (event && event.error) {
          throw new Error(event.error);
        }
        lastStatus = (event && event.status) || lastStatus;
        if (opts.onProgress) {
          opts.onProgress({
            status: lastStatus,
            completed: (event && event.completed) || 0,
            total: (event && event.total) || 0,
          });
        }
      },
    },
  );

  return lastStatus;
}

async function listCopilotModels() {
  if (!vscode.lm || typeof vscode.lm.selectChatModels !== "function") {
    return [];
  }

  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
  return (models || []).map((m) => ({
    id: m.id || m.family || m.name,
    name: m.name || m.family || m.id,
    family: m.family || "",
  }));
}

async function sendOllamaPrompt(prompt, opts = {}) {
  const settings = getAiSettings();
  const baseUrl = String(settings.ollamaBaseUrl || "").replace(/\/$/, "");
  const url = `${baseUrl}/api/generate`;

  const body = {
    model: settings.ollamaModel,
    prompt,
    stream: false,
    options: {},
  };

  if (typeof opts.temperature === "number") {
    body.options.temperature = opts.temperature;
  }

  const json = await requestJson(url, body, { label: "Ollama" });
  if (!json || typeof json.response !== "string") {
    throw new Error("Ollama did not return a text response.");
  }

  return json.response;
}

function normalizeMessage(message) {
  if (!message) return null;

  if (typeof message === "string") {
    return { role: "user", content: message };
  }

  const role =
    message.role === "assistant" || message.role === "system"
      ? message.role
      : "user";
  const content = String(message.content ?? "");
  return { role, content };
}

function buildOllamaPromptFromMessages(messages) {
  return messages
    .map((m) => {
      if (m.role === "assistant") return `ASSISTANT:\n${m.content}`;
      if (m.role === "system") return `SYSTEM:\n${m.content}`;
      return `USER:\n${m.content}`;
    })
    .join("\n\n");
}

// Helper to get model safely
async function selectModel() {
  // 1. Get all copilot models
  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });

  // 2. Safety check
  if (!models || models.length === 0) {
    throw new Error(
      "No Copilot models available. Please check your GitHub Copilot Chat extension.",
    );
  }

  // 3. Prefer the model the user explicitly chose (see aiProviderSetup.js)
  const settings = getAiSettings();
  if (settings.copilotModel) {
    const persisted = models.find(
      (m) =>
        m.id === settings.copilotModel || m.family === settings.copilotModel,
    );
    if (persisted) {
      return persisted;
    }
  }

  // 4. Prefer GPT-4, fallback to default
  let selected = models.find((m) => m.family && m.family.includes("gpt-4"));
  if (!selected) {
    selected = models[0];
  }
  return selected;
}

async function sendCopilotMessages(messages, opts = {}) {
  const model = await selectModel();
  const lmMessages = messages.map((m) => {
    if (m.role === "assistant") {
      return vscode.LanguageModelChatMessage.Assistant(m.content);
    }
    return vscode.LanguageModelChatMessage.User(m.content);
  });

  const chatReq = await model.sendRequest(
    lmMessages,
    { temperature: opts.temperature },
    opts.cancellationToken,
  );

  let text = "";
  for await (const fragment of chatReq.text) {
    text += fragment;
  }
  return text;
}

/**
 * The single place that decides which backend answers a prompt. Every feature-facing
 * helper below funnels through here, so adding a backend is one new branch instead of
 * one per call site.
 */
async function dispatchMessages(rawMessages, opts = {}) {
  const messages = (rawMessages || []).map(normalizeMessage).filter(Boolean);
  if (messages.length === 0) {
    throw new Error("No AI messages were provided.");
  }

  const settings = await resolveAiSettings();

  if (settings.provider === "ollama") {
    return sendOllamaPrompt(buildOllamaPromptFromMessages(messages), opts);
  }

  if (settings.provider === "api") {
    return sendApiChat(messages, settings, opts);
  }

  return sendCopilotMessages(messages, opts);
}

async function requestTextFromMessages(rawMessages, opts = {}) {
  return dispatchMessages(rawMessages, opts);
}

async function analyzeAI(code, instructionPrompt) {
  try {
    const combinedPrompt = `${instructionPrompt}\n\nCode to analyze:\n${code}`;
    return await dispatchMessages([{ role: "user", content: combinedPrompt }]);
  } catch (err) {
    // Handle off-topic refusals cleanly
    if (err.message && err.message.includes("off_topic")) {
      return "I cannot analyze this code (Copilot refusal).";
    }
    throw err;
  }
}

async function classifyVoiceIntent(transcript, commands, opts = {}) {
  try {
    const temperature = opts.temperature ?? 0.0;

    // System prompt engineered as User message
    const systemInstruction =
      'Output only JSON like {"command": "<id>"}. Reply ONLY with strict minified JSON.';

    const combinedPrompt = `SYSTEM:\n${systemInstruction}\n\nUSER DATA:\n${JSON.stringify(
      { transcript, commands: commands.map((c) => ({ id: c.id })) },
    )}`;

    const text = await dispatchMessages(
      [{ role: "user", content: combinedPrompt }],
      { temperature },
    );

    const match = text.match(/\{[\s\S]*\}/);
    const candidate = match ? match[0] : text;
    try {
      const parsed = JSON.parse(candidate);
      return parsed.command || "none";
    } catch {
      return "none";
    }
  } catch (err) {
    return "none";
  }
}

async function generateCodeFromVoice(
  transcript,
  languageId,
  indentation = "",
  contextCode = "",
) {
  try {
    let systemPrompt = `You are an expert coding assistant.
    Your task is to convert the user's spoken natural language request into valid ${languageId} code.

    STRICT RULES:
    1. Return ONLY the code. No markdown backticks, no explanations, no conversational text.
    2. **Indentation**: The code MUST be inserted at indentation level: "${indentation}". Ensure all generated lines are strictly indented relative to this baseline.
    3. **Literal Interpretation (CRITICAL)**: Implement EXACTLY what the user states and nothing more and nothing less. DO NOT speculate or add extra features. For example, if the user asks to create a calculator class, create ONLY the class prototype/skeleton—do NOT automatically add add/subtract methods unless specifically asked.
    4. **Errors & Edge Cases**: Write functional code, but DO NOT over-engineer or add exhaustive error-handling unless explicitly requested. Keep the code as concise as possible.
    5. **Variable Declaration**: Explicitly declare variables (e.g., 'let'/'const' in JS; proper types in C++/Java).
    6. **Standards**: Follow standard coding conventions for ${languageId}. Use meaningful variable names.
    7. **Python Specifics**: Use standard 4-space indentation. Do NOT use triple quotes for the body unless asked.

    If the request is unclear, just do your best to write the exact minimal code requested.`;

    if (contextCode) {
      systemPrompt += `\n\nCONTEXT (Surrounding Code):
    The user is editing the following file. The cursor is located roughly where the code ends or in the middle.
    Use this context to ensure variables, types, and styles match.
    \`\`\`${languageId}
    ${contextCode}
    \`\`\``;
    }

    const code = await dispatchMessages(
      [
        { role: "user", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      { temperature: 0.1 },
    );

    // Cleanup any leaked markdown formatting
    return code
      .replace(/^```[a-z]*\n/i, "")
      .replace(/```$/, "")
      .trim();
  } catch (err) {
    const settings = getAiSettings();
    if (
      settings.provider === "copilot" &&
      (err.name === "LanguageModelError" ||
        err instanceof vscode.LanguageModelError)
    ) {
      throw new Error(`Copilot LM Error: ${err.message}`);
    }
    throw new Error(`AI Error: ${err.message}`);
  }
}

module.exports = {
  getAiSettings,
  resolveAiSettings,
  requestTextFromMessages,
  analyzeAI,
  classifyVoiceIntent,
  generateCodeFromVoice,
  selectModel,
  listOllamaModels,
  listCopilotModels,
  listApiModels,
  pullOllamaModel,
};
