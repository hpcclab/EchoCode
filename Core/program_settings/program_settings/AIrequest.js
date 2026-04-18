const vscode = require("vscode");

// Helper to get model safely
async function selectModel() {
  // 1. Get all copilot models
  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });

  // 2. Safety check
  if (!models || models.length === 0) {
    throw new Error(
      "No Copilot models available. Please check your GitHub Copilot Chat extension."
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
    const model = await selectModel();
    const combinedPrompt = `${instructionPrompt}\n\nCode to analyze:\n${code}`;
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
    const model = await selectModel();

    // System prompt engineered as User message
    const systemInstruction =
      'Output only JSON like {"command": "<id>"}. Reply ONLY with strict minified JSON.';

    const combinedPrompt = `SYSTEM:\n${systemInstruction}\n\nUSER DATA:\n${JSON.stringify(
      { transcript, commands: commands.map((c) => ({ id: c.id })) }
    )}`;

    const messages = [vscode.LanguageModelChatMessage.User(combinedPrompt)];
    const chatReq = await model.sendRequest(messages, { temperature });

    let text = "";
    for await (const frag of chatReq.text) text += frag;

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

async function generateCodeFromVoice(transcript, languageId, indentation = "", contextCode = "") {
  try {
    const model = await selectModel();

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

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(transcript)
    ];

    const chatReq = await model.sendRequest(messages, { temperature: 0.1 });

    let code = "";
    for await (const fragment of chatReq.text) {
      code += fragment;
    }

    // Cleanup any leaked markdown formatting
    return code
      .replace(/^```[a-z]*\n/i, "")
      .replace(/```$/, "")
      .trim();
  } catch (err) {
    if (err.name === 'LanguageModelError' || err instanceof vscode.LanguageModelError) {
      throw new Error(`Copilot LM Error: ${err.message}`);
    }
    throw new Error(`Copilot Error: ${err.message}`);
  }
}

module.exports = {
  analyzeAI,
  classifyVoiceIntent,
  generateCodeFromVoice,
};
