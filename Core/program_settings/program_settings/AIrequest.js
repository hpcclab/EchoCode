const vscode = require('vscode'); // VSCode API

async function analyzeAI(code, instructionPrompt) {
  var chatRequest;
  const craftedPrompt = [
    vscode.LanguageModelChatMessage.User(
      // Default prompt
      // 'Give a brief explanation of the flow of execution of the provided python function'
      instructionPrompt
    ),
    vscode.LanguageModelChatMessage.User(code)
  ];
  const models = await vscode.lm.selectChatModels({
    vendor: 'copilot'
  });
  if (models.length === 0) {
    console.log("There are no models available");
  }

  try {
    const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
    chatRequest = await model.sendRequest(craftedPrompt, {});
  } catch (err) {
    console.log("error with requesting from model");
    // Making the chat request might fail because
    // - model does not exist
    // - user consent not given
    // - quota limits w ere exceeded
    if (err instanceof vscode.LanguageModelError) {
      console.log(err.message, err.code, err.cause);
      if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
        stream.markdown(
          vscode.l10n.t("I'm sorry, I cannot summarize the provided code.")
        );
      }
    } else {
      // add other error handling logic
      throw err;
    }
  }

  var results = '';
  for await (const fragment of chatRequest.text) {
    results += fragment;
  }

  return results;
}

module.exports = { analyzeAI };

async function generateCodeFromVoice(transcript, languageId, indentation = "", contextCode = "") {
  // 1) Selecting Copilot model
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (!models || models.length === 0) {
    throw new Error('No Copilot models available. Please ensure GitHub Copilot Chat is installed and active.');
  }
  const model = models[0];

  // 2) Constructing prompt
  // We want PURE code, no markdown fencing if possible.
  let systemPrompt = `You are an expert coding assistant. 
    Your task is to convert the user's spoken natural language request into valid, high-quality ${languageId} code.
    
    STRICT RULES:
    1. Return ONLY the code. No markdown backticks, no explanations, no conversational text.
    2. The code will be inserted at indentation level: "${indentation}". Ensure all lines are indented relative to this baseline.
    3. **Variable Declaration**: ALL variables must be explicitly declared (e.g., using 'let', 'const', or 'var' in JS; proper types in C++/Java/C#). Do NOT use undeclared variables.
    4. **Error Handling**: The code must be robust and error-free. Handle potential edge cases where appropriate.
    5. **Standards**: Follow standard coding conventions for ${languageId}. Use meaningful variable names.
    6. **Security**: Avoid usage of insecure functions or patterns (e.g., eval(), hardcoded credentials).
    7. **Completeness**: If the user asks for a loop, function, or logic, implement it fully.
    8. **Python Specifics**: Use standard 4-space indentation. Do NOT use triple quotes for the body unless explicitly asked.
    
    If the request is unclear or impossible to implement safely, return a comment in ${languageId} explaining why.`;

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

  // 3) Send request
  let chatReq;
  try {
    chatReq = await model.sendRequest(messages, { temperature: 0.1 }); // Low temp for precision
  } catch (err) {
    if (err instanceof vscode.LanguageModelError) {
      throw new Error(`Copilot LM Error: ${err.message}`);
    }
    throw err;
  }

  // 4) Collecting response
  let code = '';
  for await (const fragment of chatReq.text) {
    code += fragment;
  }

  // 5) Final Cleanup
  code = code.replace(/^```[a-z]*\n/i, '').replace(/```$/, '').trim();

  return code;
}

module.exports.generateCodeFromVoice = generateCodeFromVoice;