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

async function tryExecuteInternalCommand(cleanedTranscript, outputChannel) {
  const commands = loadVoiceCommands();

  for (const command of commands) {
    if (
      !command.keywords.some((keyword) => cleanedTranscript.includes(keyword))
    ) {
      continue;
    }

    const currentMode = getMode();
    if (currentMode !== "dev" && STUDENT_LOCKED_COMMANDS.has(command.id)) {
      await speakMessage("That command is disabled in student mode.");
      return { handled: true };
    }

    await vscode.commands.executeCommand(command.id);
    outputChannel.appendLine(`[Voice Command] Matched: ${command.id}`);
    return { handled: true, command: command.id };
  }

  return null;
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

async function tryExecuteVoiceCommand(transcript, outputChannel) {
  try {
    const cleanedTranscript = transcript.toLowerCase().trim();
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
