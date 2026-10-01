const { requestJson } = require("./httpClient");

/**
 * Hosted API backends EchoCode can talk to directly, for users who want a cloud model
 * without GitHub Copilot. Everything except Anthropic speaks the OpenAI wire format,
 * so adding another vendor is usually a new row here and nothing else.
 */
const API_PRESETS = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    wire: "openai",
    keyHint: "sk-…",
    signupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    wire: "openai",
    keyHint: "sk-or-…",
    signupUrl: "https://openrouter.ai/keys",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    wire: "openai",
    keyHint: "gsk_…",
    signupUrl: "https://console.groq.com/keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    wire: "anthropic",
    keyHint: "sk-ant-…",
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    baseUrl: "",
    wire: "openai",
    keyHint: "optional",
    signupUrl: "",
    detail:
      "Any OpenAI-compatible server — LM Studio, vLLM, llama.cpp, Together, DeepSeek, a company gateway.",
  },
];

const ANTHROPIC_VERSION = "2023-06-01";

function getPreset(id) {
  return API_PRESETS.find((p) => p.id === id) || null;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

/**
 * Anthropic authenticates with x-api-key and requires a pinned API version;
 * every other supported vendor uses a bearer token.
 */
function authHeaders(wire, apiKey) {
  if (!apiKey) return {};
  if (wire === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/**
 * The diagram's "verify API can be reached" step. Both wire formats expose GET
 * /models, so one call proves the base URL resolves, the key is accepted, and gives
 * us the model list to populate the picker — three checks for one round trip.
 */
async function listApiModels({ baseUrl, apiKey, wire }, opts = {}) {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const json = await requestJson(url, null, {
    method: "GET",
    headers: authHeaders(wire, apiKey),
    timeoutMs: opts.timeoutMs ?? 10000,
    label: "API provider",
  });

  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((m) => ({
      id: m?.id || m?.name || "",
      label: m?.display_name || m?.id || m?.name || "",
      owner: m?.owned_by || "",
    }))
    .filter((m) => m.id);
}

function buildOpenAiBody(messages, model, opts) {
  const body = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;
  return body;
}

/**
 * Anthropic takes the system prompt as a top-level field rather than a message role,
 * and requires an explicit max_tokens, so its body is built separately.
 */
function buildAnthropicBody(messages, model, opts) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body = {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: turns.length
      ? turns
      : [{ role: "user", content: system || "Hello" }],
  };
  if (system && turns.length) body.system = system;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  return body;
}

function extractOpenAiText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  // Some gateways return the multi-part content array shape.
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }
  return null;
}

function extractAnthropicText(json) {
  if (!Array.isArray(json?.content)) return null;
  return json.content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Sends a chat completion to whichever hosted API the user configured and returns
 * plain text. Callers never need to know which wire format is in play.
 */
async function sendApiChat(messages, settings, opts = {}) {
  const { apiBaseUrl, apiModel, apiKey, apiWire } = settings;

  if (!apiModel) {
    throw new Error(
      "No API model is selected. Run 'EchoCode: Select AI Provider & Model'.",
    );
  }

  const base = normalizeBaseUrl(apiBaseUrl);
  const isAnthropic = apiWire === "anthropic";
  const url = `${base}${isAnthropic ? "/messages" : "/chat/completions"}`;
  const body = isAnthropic
    ? buildAnthropicBody(messages, apiModel, opts)
    : buildOpenAiBody(messages, apiModel, opts);

  const json = await requestJson(url, body, {
    headers: authHeaders(apiWire, apiKey),
    timeoutMs: opts.timeoutMs ?? 120000,
    label: "API provider",
  });

  const text = isAnthropic ? extractAnthropicText(json) : extractOpenAiText(json);
  if (typeof text !== "string") {
    throw new Error("The API provider did not return a text response.");
  }
  return text;
}

module.exports = {
  API_PRESETS,
  ANTHROPIC_VERSION,
  getPreset,
  normalizeBaseUrl,
  authHeaders,
  listApiModels,
  sendApiChat,
};
