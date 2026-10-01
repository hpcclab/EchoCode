const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const {
  matchExternalCommand,
} = require("../../Core/program_settings/program_settings/ExternalIntentRouter");
const {
  generateCodeFromVoice,
} = require("../../Core/program_settings/program_settings/AIrequest");
const { getMode } = require("../../Core/program_settings/mode");
const {
  STUDENT_LOCKED_COMMANDS,
} = require("../../Core/program_settings/guard");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

const QUESTION_KEYWORDS = [
  "what",
  "how",
  "why",
  "explain",
  "describe",
  "does",
  "is ",
];

function getFriendlyLanguageName(languageId) {
  const map = {
    cpp: "C++",
    c: "C",
    csharp: "C#",
    javascript: "JavaScript",
    typescript: "TypeScript",
    python: "Python",
    java: "Java",
    html: "HTML",
    css: "CSS",
    php: "PHP",
    ruby: "Ruby",
    go: "Go",
    rust: "Rust",
    swift: "Swift",
    kotlin: "Kotlin",
    sql: "SQL",
    r: "R",
    shellscript: "Shell Script",
    powershell: "PowerShell",
    json: "JSON",
    xml: "XML",
    markdown: "Markdown",
    plaintext: "Pseudocode",
    bat: "Batch file",
    clojure: "Clojure",
    coffeescript: "CoffeeScript",
    dockerfile: "Dockerfile",
    fsharp: "F#",
    groovy: "Groovy",
    handlebars: "Handlebars",
    ini: "Ini",
    lua: "Lua",
    makefile: "Makefile",
    "objective-c": "Objective-C",
    perl: "Perl",
    scss: "SCSS",
    vb: "Visual Basic",
    yaml: "YAML",
  };

  return map[languageId] || languageId;
}

function loadVoiceCommands() {
  const commandsPath = path.join(
    __dirname,
    "../../Core/program_settings/program_settings/voice_commands.json",
  );

  return JSON.parse(fs.readFileSync(commandsPath, "utf-8"));
}

function normalizeForMatching(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function normalizedEditSimilarity(a, b) {
  const x = normalizeForMatching(a);
  const y = normalizeForMatching(b);
  if (!x || !y) return 0;

  const maxLen = Math.max(x.length, y.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(x, y);
  return 1 - distance / maxLen;
}

function tokenSet(text) {
  const normalized = normalizeForMatching(text);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter(Boolean));
}

function jaccardSimilarity(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function bestWindowEditSimilarity(transcript, phrase) {
  const transcriptTokens = normalizeForMatching(transcript)
    .split(" ")
    .filter(Boolean);
  const phraseTokens = normalizeForMatching(phrase).split(" ").filter(Boolean);

  if (!transcriptTokens.length || !phraseTokens.length) return 0;

  const phraseLen = phraseTokens.length;
  let best = 0;

  for (
    let windowLen = Math.max(1, phraseLen - 1);
    windowLen <= phraseLen + 1;
    windowLen++
  ) {
    if (windowLen > transcriptTokens.length) continue;
    for (let i = 0; i <= transcriptTokens.length - windowLen; i++) {
      const windowPhrase = transcriptTokens.slice(i, i + windowLen).join(" ");
      const score = normalizedEditSimilarity(windowPhrase, phrase);
      if (score > best) best = score;
    }
  }

  return best;
}

function tokenAlignmentSimilarity(transcript, phrase) {
  const transcriptTokens = normalizeForMatching(transcript)
    .split(" ")
    .filter(Boolean);
  const phraseTokens = normalizeForMatching(phrase).split(" ").filter(Boolean);

  if (!transcriptTokens.length || !phraseTokens.length) return 0;

  let total = 0;
  for (const phraseToken of phraseTokens) {
    let best = 0;
    for (const transcriptToken of transcriptTokens) {
      const sim = normalizedEditSimilarity(transcriptToken, phraseToken);
      if (sim > best) best = sim;
    }
    total += best;
  }

  return total / phraseTokens.length;
}

function scoreTranscriptToKeyword(transcript, keyword) {
  const normalizedTranscript = normalizeForMatching(transcript);
  const normalizedKeyword = normalizeForMatching(keyword);
  if (!normalizedTranscript || !normalizedKeyword) return 0;

  if (normalizedTranscript.includes(normalizedKeyword)) {
    return 1;
  }

  const globalEdit = normalizedEditSimilarity(
    normalizedTranscript,
    normalizedKeyword,
  );
  const windowEdit = bestWindowEditSimilarity(
    normalizedTranscript,
    normalizedKeyword,
  );
  const tokenScore = jaccardSimilarity(normalizedTranscript, normalizedKeyword);
  const tokenEdit = tokenAlignmentSimilarity(
    normalizedTranscript,
    normalizedKeyword,
  );

  // Weighted combination favors local phrase and token-level edit fit.
  return Math.max(
    windowEdit * 0.5 + tokenEdit * 0.35 + tokenScore * 0.15,
    globalEdit * 0.5 + tokenEdit * 0.35 + tokenScore * 0.15,
  );
}

function getMinimumScoreThreshold(keyword) {
  const normalized = normalizeForMatching(keyword);
  if (normalized.length <= 4) return 0.94;
  if (normalized.split(" ").length === 1) return 0.83;
  return 0.65;
}

function findBestInternalCommand(cleanedTranscript, commands) {
  let best = null;

  for (const command of commands) {
    const keywords = Array.isArray(command.keywords) ? command.keywords : [];
    let commandBestScore = 0;
    let commandBestKeyword = null;

    for (const keyword of keywords) {
      const score = scoreTranscriptToKeyword(cleanedTranscript, keyword);
      if (score > commandBestScore) {
        commandBestScore = score;
        commandBestKeyword = keyword;
      }
    }

    if (!commandBestKeyword) continue;

    const threshold = getMinimumScoreThreshold(commandBestKeyword);
    if (commandBestScore < threshold) continue;

    if (!best || commandBestScore > best.score) {
      best = {
        command,
        score: commandBestScore,
        matchedKeyword: commandBestKeyword,
      };
    }
  }

  return best;
}

async function tryExecuteInternalCommand(cleanedTranscript, outputChannel) {
  const commands = loadVoiceCommands();

  const bestMatch = findBestInternalCommand(cleanedTranscript, commands);
  if (!bestMatch) {
    return null;
  }

  const { command, score, matchedKeyword } = bestMatch;

  const currentMode = getMode();
  if (currentMode !== "dev" && STUDENT_LOCKED_COMMANDS.has(command.id)) {
    await speakMessage("That command is disabled in student mode.");
    return { handled: true };
  }

  await vscode.commands.executeCommand(command.id);
  outputChannel.appendLine(
    `[Voice Command] Matched: ${command.id} (keyword: "${matchedKeyword}", score: ${score.toFixed(2)})`,
  );
  return { handled: true, command: command.id };
}

async function tryExecuteExternalCommand(cleanedTranscript, outputChannel) {
  const externalCommand = matchExternalCommand(cleanedTranscript);
  if (!externalCommand) {
    return null;
  }

  const currentMode = getMode();
  if (
    currentMode === "student" &&
    STUDENT_LOCKED_COMMANDS.has(externalCommand.id)
  ) {
    await speakMessage("That command is disabled in student mode.");
    return { handled: true };
  }

  await vscode.commands.executeCommand(externalCommand.id);
  vscode.window.showInformationMessage(`✅ External: ${externalCommand.title}`);
  outputChannel.appendLine(
    `[Voice Command] External Matched: ${externalCommand.id}`,
  );
  return { handled: true, command: externalCommand.id };
}

function shouldRouteToChat(cleanedTranscript) {
  return QUESTION_KEYWORDS.some((keyword) =>
    cleanedTranscript.startsWith(keyword),
  );
}

function getEditorContext(editor) {
  const position = editor.selection.active;
  const lineText = editor.document.lineAt(position.line).text;
  const currentIndentation = (lineText.match(/^\s*/) || [""])[0];
  const startLine = Math.max(0, position.line - 50);
  const endLine = Math.min(editor.document.lineCount - 1, position.line + 20);
  const contextRange = new vscode.Range(
    startLine,
    0,
    endLine,
    editor.document.lineAt(endLine).text.length,
  );

  return {
    position,
    currentIndentation,
    contextCode: editor.document.getText(contextRange),
    friendlyLanguage: getFriendlyLanguageName(editor.document.languageId),
  };
}

async function tryGenerateCode(transcript, outputChannel) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { handled: false };
  }

  try {
    const editorContext = getEditorContext(editor);

    vscode.window.showInformationMessage(
      `EchoCode: Generating ${editorContext.friendlyLanguage} code...`,
    );
    outputChannel.appendLine(
      `[Voice Generation] Detected Language: ${editorContext.friendlyLanguage} (ID: ${editor.document.languageId})`,
    );

    const generatedCode = await generateCodeFromVoice(
      transcript,
      editorContext.friendlyLanguage,
      editorContext.currentIndentation,
      editorContext.contextCode,
    );

    if (!generatedCode) {
      return { handled: false };
    }

    await editor.edit((editBuilder) => {
      editBuilder.insert(editorContext.position, generatedCode);
    });
    outputChannel.appendLine(
      `[Voice Generation] Inserted code for: ${transcript}`,
    );
    outputChannel.appendLine(`[Voice Generation Output]:\n${generatedCode}`);
    await speakMessage(`Here is the code I generated: ${generatedCode}`);

    return { handled: true, command: "generateCode" };
  } catch (error) {
    outputChannel.appendLine(`[Voice Generation Error] ${error.message}`);
    vscode.window.showErrorMessage(
      `EchoCode Generation Fail: ${error.message}`,
    );
    return { handled: false };
  }
}

async function tryExecuteVoiceCommand(transcript, outputChannel, options = {}) {
  try {
    const allowCodeGeneration = options.allowCodeGeneration !== false;
    const cleanedTranscript = normalizeForMatching(transcript);
    if (
      !cleanedTranscript ||
      cleanedTranscript.includes("no speech detected")
    ) {
      outputChannel.appendLine(
        `[Voice Intent] Ignored empty/error input: "${transcript}"`,
      );
      return { handled: true };
    }

    const internalResult = await tryExecuteInternalCommand(
      cleanedTranscript,
      outputChannel,
    );
    if (internalResult) {
      return internalResult;
    }

    const externalResult = await tryExecuteExternalCommand(
      cleanedTranscript,
      outputChannel,
    );
    if (externalResult) {
      return externalResult;
    }

    if (shouldRouteToChat(cleanedTranscript)) {
      outputChannel.appendLine(
        `[Voice Intent] Detected Question: "${transcript}". Routing to Chat/Audio (Default).`,
      );
      return { handled: false };
    }

    if (!allowCodeGeneration) {
      outputChannel.appendLine(
        `[Voice Intent] No command match for: ${transcript}. Command-only mode prevents code generation fallback.`,
      );
      return { handled: false };
    }

    outputChannel.appendLine(
      `[Voice Intent] No strict command match for: ${transcript}. Attempting Code Generation...`,
    );

    return tryGenerateCode(transcript, outputChannel);
  } catch (error) {
    outputChannel.appendLine(`[Voice Intent Error] ${error.message}`);
    vscode.window.showErrorMessage(
      `EchoCode Voice Command Error: ${error.message}`,
    );
    return { handled: false };
  }
}

module.exports = {
  getFriendlyLanguageName,
  tryExecuteVoiceCommand,
};
