const vscode = require("vscode");
const http = require("http");
const https = require("https");

function getAiSettings() {
  const config = vscode.workspace.getConfiguration("echocode");
  return {
    useLocalOllama: config.get("useLocalOllama", false),
    ollamaBaseUrl: config.get("ollamaBaseUrl", "http://127.0.0.1:11434"),
    ollamaModel: config.get("ollamaModel", "llama3.2"),
  };
}

function requestJson(url, body) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      reject(new Error(`Invalid Ollama URL: ${url}`));
      return;
    }

    const isHttps = parsedUrl.protocol === "https:";
    const transport = isHttps ? https : http;
    const payload = JSON.stringify(body);

    const req = transport.request(
      {
        method: "POST",
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          if (
            !res.statusCode ||
            res.statusCode < 200 ||
            res.statusCode >= 300
          ) {
            reject(
              new Error(
                `Ollama request failed (${res.statusCode || "unknown"}): ${raw || "no response body"}`,
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("Ollama returned invalid JSON."));
          }
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
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

  const json = await requestJson(url, body);
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

async function requestTextFromMessages(rawMessages, opts = {}) {
  const messages = (rawMessages || []).map(normalizeMessage).filter(Boolean);
  if (messages.length === 0) {
    throw new Error("No AI messages were provided.");
  }

  const settings = getAiSettings();

  if (settings.useLocalOllama) {
    const prompt = buildOllamaPromptFromMessages(messages);
    return sendOllamaPrompt(prompt, { temperature: opts.temperature });
  }

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

  // 3. Prefer GPT-4, fallback to default
  let selected = models.find((m) => m.family && m.family.includes("gpt-4"));
  if (!selected) {
    selected = models[0];
  }
  return selected;
}

async function analyzeAI(code, instructionPrompt) {
  try {
    const combinedPrompt = `${instructionPrompt}\n\nCode to analyze:\n${code}`;
    const settings = getAiSettings();

    if (settings.useLocalOllama) {
      return await sendOllamaPrompt(combinedPrompt, {});
    }

    const model = await selectModel();
    const messages = [vscode.LanguageModelChatMessage.User(combinedPrompt)];
    const chatRequest = await model.sendRequest(messages, {});

    let results = "";
    for await (const fragment of chatRequest.text) {
      results += fragment;
    }

    return results;
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
    const settings = getAiSettings();

    // System prompt engineered as User message
    const systemInstruction =
      'Output only JSON like {"command": "<id>"}. Reply ONLY with strict minified JSON.';

    const combinedPrompt = `SYSTEM:\n${systemInstruction}\n\nUSER DATA:\n${JSON.stringify(
      { transcript, commands: commands.map((c) => ({ id: c.id })) },
    )}`;

    let text = "";
    if (settings.useLocalOllama) {
      text = await sendOllamaPrompt(combinedPrompt, { temperature });
    } else {
      const model = await selectModel();
      const messages = [vscode.LanguageModelChatMessage.User(combinedPrompt)];
      const chatReq = await model.sendRequest(messages, { temperature });
      for await (const frag of chatReq.text) text += frag;
    }

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
    const settings = getAiSettings();

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

    let code = "";
    if (settings.useLocalOllama) {
      const localPrompt = `${systemPrompt}\n\nUSER REQUEST:\n${transcript}`;
      code = await sendOllamaPrompt(localPrompt, { temperature: 0.1 });
    } else {
      const model = await selectModel();
      const messages = [
        vscode.LanguageModelChatMessage.User(systemPrompt),
        vscode.LanguageModelChatMessage.User(transcript),
      ];
      const chatReq = await model.sendRequest(messages, { temperature: 0.1 });
      for await (const fragment of chatReq.text) {
        code += fragment;
      }
    }

    // Cleanup any leaked markdown formatting
    return code
      .replace(/^```[a-z]*\n/i, "")
      .replace(/```$/, "")
      .trim();
  } catch (err) {
    const settings = getAiSettings();
    if (
      !settings.useLocalOllama &&
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
  requestTextFromMessages,
  analyzeAI,
  classifyVoiceIntent,
  generateCodeFromVoice,
};
