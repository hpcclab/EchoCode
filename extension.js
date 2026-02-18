const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const DependencyManager = require("./program_features/Voice/dependencyManager"); // Import manager

const {
  startRecording,
  stopAndTranscribe,
  selectMicrophone, // Import this new function
  isRecording,
} = require("./program_features/Voice/whisperService");

const {
  generateCodeFromVoice,
} = require("./Core/program_settings/program_settings/AIrequest");

// Helper to map VS Code language IDs to friendly names for LLM
function getFriendlyLanguageName(languageId) {
  const map = {
    "cpp": "C++",
    "c": "C",
    "csharp": "C#",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "python": "Python",
    "java": "Java",
    "html": "HTML",
    "css": "CSS",
    "php": "PHP",
    "ruby": "Ruby",
    "go": "Go",
    "rust": "Rust",
    "swift": "Swift",
    "kotlin": "Kotlin",
    "sql": "SQL",
    "r": "R",
    "shellscript": "Shell Script",
    "powershell": "PowerShell",
    "json": "JSON",
    "xml": "XML",
    "markdown": "Markdown",
    "plaintext": "Pseudocode", // Fallback for plain text
    "bat": "Batch file",
    "clojure": "Clojure",
    "coffeescript": "CoffeeScript",
    "dockerfile": "Dockerfile",
    "fsharp": "F#",
    "groovy": "Groovy",
    "handlebars": "Handlebars",
    "ini": "Ini",
    "lua": "Lua",
    "makefile": "Makefile",
    "objective-c": "Objective-C",
    "perl": "Perl",
    "r": "R",
    "scss": "SCSS",
    "vb": "Visual Basic",
    "yaml": "YAML"
  };
  return map[languageId] || languageId; // Return mapped name or original ID if not found
}

async function tryExecuteVoiceCommand(transcript, outputChannel) {
  try {
    const cleaned = transcript.toLowerCase().trim();

    // 1. Guard Clause: Ignore empty or error messages from whisper
    if (!cleaned || cleaned.includes("no speech detected")) {
      outputChannel.appendLine(
        `[Voice Intent] Ignored empty/error input: "${transcript}"`
      );
      return { handled: true }; // Treated as handled so we don't spam errors
    }

    const commandsPath = path.join(
      __dirname,
      "Core/program_settings/program_settings/voice_commands.json"
    );
    const commands = JSON.parse(fs.readFileSync(commandsPath, "utf-8"));

    for (const cmd of commands) {
      if (cmd.keywords.some((k) => cleaned.includes(k))) {
        await vscode.commands.executeCommand(cmd.id);
        vscode.window.showInformationMessage(`✅ Executed: ${cmd.title}`);
        outputChannel.appendLine(`[Voice Command] Matched: ${cmd.id}`);
        return { handled: true, command: cmd.id };
      }
    }

    // no match — pass to Copilot for Code Generation
    const editor = vscode.window.activeTextEditor;

    // 3. Check for specific "Question" keywords to route to Chat/Audio instead of Code Gen
    //    If it starts with "What", "How", "Why", "Explain", "Describe", "Does" -> likely a question.
    const questionKeywords = [
      "what",
      "how",
      "why",
      "explain",
      "describe",
      "does",
      "is ",
    ];
    const isQuestion = questionKeywords.some((q) => cleaned.startsWith(q));

    if (isQuestion) {
      outputChannel.appendLine(
        `[Voice Intent] Detected Question: "${transcript}". Routing to Chat/Audio (Default).`
      );
      // Return handled: false so it falls through to other handlers (like chat/audio responder) if they exist,
      return { handled: false };
    }

    // 4. Otherwise, assume "Code Generation" intent (Action)
    outputChannel.appendLine(
      `[Voice Intent] No strict command match for: ${transcript}. Attempting Code Generation...`
    );

    if (editor) {
      try {
        const rawLangId = editor.document.languageId;
        const friendlyLang = getFriendlyLanguageName(rawLangId);

        vscode.window.showInformationMessage(`EchoCode: Generating ${friendlyLang} code...`);
        outputChannel.appendLine(`[Voice Generation] Detected Language: ${friendlyLang} (ID: ${rawLangId})`);

        // --- Indentation Logic ---
        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text;
        const indentationMatch = lineText.match(/^\s*/);
        const currentIndentation = indentationMatch ? indentationMatch[0] : "";

        // --- Context Window Logic ---
        // Capture 50 lines before and 20 lines after the cursor to give the AI context
        const startLine = Math.max(0, position.line - 50);
        const endLine = Math.min(editor.document.lineCount - 1, position.line + 20);
        const contextRange = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
        const contextCode = editor.document.getText(contextRange);

        const generatedCode = await generateCodeFromVoice(
          transcript,
          friendlyLang, // Pass the friendly name
          currentIndentation,
          contextCode // Pass the surrounding code
        );

        if (generatedCode) {
          await editor.edit((editBuilder) => {
            editBuilder.insert(position, generatedCode);
          });
          outputChannel.appendLine(
            `[Voice Generation] Inserted code for: ${transcript}`
          );
          outputChannel.appendLine(
            `[Voice Generation Output]:\n${generatedCode}`
          );
          await speakMessage(`Here is the code I generated: ${generatedCode}`);
          return { handled: true, command: "generateCode" };
        }
      } catch (genErr) {
        outputChannel.appendLine(`[Voice Generation Error] ${genErr.message}`);
        vscode.window.showErrorMessage(
          `EchoCode Generation Fail: ${genErr.message}`
        );
      }
    }

    return { handled: false };
  } catch (err) {
    outputChannel.appendLine(`[Voice Intent Err or] ${err.message}`);
    vscode.window.showErrorMessage(
      `EchoCode Voice Command Error: ${err.message}`
    );
    return { handled: false };
  }
}

// Python (optional adapter)
const { ensurePylintInstalled } = require("./Language/Python/pylintHandler");
const {
  initializeErrorHandling,
  registerErrorHandlingCommands,
} = require("./Language/Python/errorHandler");
const {
  checkCurrentPythonFile,
} = require("./program_features/C++_Error_Parser/Python_Error_Parser");

// Speech (core)
const {
  speakMessage,
  stopSpeaking,
  loadSavedSpeechSpeed,
  registerSpeechCommands,
  increaseSpeechSpeed,
  decreaseSpeechSpeed,
} = require("./Core/program_settings/speech_settings/speechHandler");

// Core features
const {
  registerSummarizerCommands,
} = require("./Core/Summarizer/summaryGenerator.js");
const {
  registerHotkeyGuideCommand,
} = require("./Core/program_settings/guide_settings/hotkeyGuide");
const {
  registerChatCommands,
} = require("./program_features/ChatBot/chat_tutor");

// Navigation + “What’s this”
const {
  registerMoveCursor,
} = require("./navigation_features/navigationHandler");
const { registerWhereAmICommand } = require("./navigation_features/whereAmI");
const {
  registerFileCreatorCommand,
} = require("./program_features/Folder_File_Creator/FileCreator");
const {
  registerFolderCreatorCommand,
} = require("./program_features/Folder_File_Creator/FolderCreator");
const {
  registerFileNavigatorCommand,
} = require("./navigation_features/Folder_File_Navigator/file_navigator");
const {
  initializeFolderList,
  registerFolderNavigatorCommands,
} = require("./navigation_features/Folder_File_Navigator/folder_navigator");
const {
  registerReadCurrentLineCommand,
} = require("./program_features/WhatIsThis/WhatIsThis");
const {
  registerDescribeCurrentLineCommand,
} = require("./program_features/WhatIsThis/DescribeThis");
const {
  registerCharacterReadOutCommand,
} = require("./program_features/WhatIsThis/CharacterReadOut");

const {
  compileCurrentCppFile,
} = require("./program_features/C++_Error_Parser/CPP_Error_Parser");

const {
  connectFile,
  handleCopyFileNameCommand,
  handlePasteImportCommand,
  registerFileConnectorCommands,
} = require("./program_features/FileConnector/File_Connector");

// Big-O + Annotations
const {
  registerBigOCommand,
} = require("./program_features/Annotations_BigO/bigOAnalysis");
const {
  registerAnnotationCommands,
} = require("./program_features/Annotations_BigO/annotations");

// Assignment tracker
const {
  registerAssignmentTrackerCommands,
} = require("./program_features/Assignment_Tracker/assignmentTracker");

let outputChannel;

const copilotExtensionIds = [
  "GitHub.copilot",
  "GitHub.copilot-nightly",
  "GitHub.copilot-chat",
];

async function ensureCopilotActivated(channel) {
  const copilotExtension = copilotExtensionIds
    .map((id) => vscode.extensions.getExtension(id))
    .find(Boolean);

  if (!copilotExtension) {
    channel.appendLine(
      "[EchoCode] Warning: GitHub Copilot / Copilot Chat extension not found. AI features will be unavailable."
    );
    return null;
  }

  if (!copilotExtension.isActive) {
    channel.appendLine("[EchoCode] Activating GitHub Copilot dependency...");
    await copilotExtension.activate();
  }

  return copilotExtension;
}

async function activate(context) {
  outputChannel = vscode.window.createOutputChannel("EchoCode");
  outputChannel.appendLine("[EchoCode] Activated");

  // --- DEPENDENCY CHECK START ---
  // This runs once on startup and ensures the venv exists
  const depManager = new DependencyManager(context, outputChannel);
  // We don't await this blocking if we want faster startup,
  // but for safety we await to ensure python is ready before first voice command
  depManager.ensureDependencies().catch((err) => {
    outputChannel.appendLine(`[Dependency Error] ${err.message}`);
  });
  // --- DEPENDENCY CHECK END ---

  // Speech prefs
  loadSavedSpeechSpeed();

  // Register core commands first (code-agnostic)
  // Register core commands first (code-agnostic)
  registerSpeechCommands(context, outputChannel);
  registerSummarizerCommands(context, outputChannel);
  registerHotkeyGuideCommand(context);
  const chatProvider = registerChatCommands(context, outputChannel);

  // start recording (no transcript yet)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStart", async () => {
      // Pass 'context' so we can access globalState for microphone settings
      startRecording(outputChannel, context);
    })
  );

  // New command to change microphone manually
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.selectMicrophone", async () => {
      await selectMicrophone(context);
    })
  );

  // Toggle Voice Command
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.toggleVoice", async () => {
      if (isRecording()) {
        // Sync UI: Stop immediately
        if (chatProvider) chatProvider.setRecordingState(false);

        // Announce processing (don't await to avoid blocking stop)
        speakMessage("Processing");

        const result = await vscode.commands.executeCommand("echocode._voiceStop");

        if (result && result.ok && result.text) {
          // Attempt to execute as a voice command first
          const voiceResult = await tryExecuteVoiceCommand(result.text, outputChannel);

          if (!voiceResult.handled) {
            // Fallback: Send to Chat Tutor
            await vscode.commands.executeCommand("echocode.openChat");
            if (chatProvider) {
              await chatProvider.handleUserMessage(result.text);
            }
          }
        }
      } else {
        // Sync UI: Start immediately
        if (chatProvider) chatProvider.setRecordingState(true);

        await speakMessage("Listening");
        await vscode.commands.executeCommand("echocode._voiceStart");
      }
    })
  );

  // stop recording and transcribe (returns text)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStop", async () => {
      try {
        // Pass context.globalState so we know where the venv python is
        const text = await stopAndTranscribe(
          outputChannel,
          context.globalState
        );
        return { ok: true, text };
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        vscode.window.showErrorMessage("EchoCode Whisper STT error: " + msg);
        outputChannel.appendLine("[Whisper] Error: " + msg);
        return { ok: false, error: msg };
      }
    })
  );
  registerBigOCommand(context);
  registerAnnotationCommands(context, outputChannel);
  registerAssignmentTrackerCommands(context);
  registerWhereAmICommand(context);
  registerMoveCursor(context);
  registerFileCreatorCommand(context);
  registerFolderCreatorCommand(context);
  registerFileNavigatorCommand(context);
  registerFolderNavigatorCommands(context);

  // What is this commands
  registerReadCurrentLineCommand(context);
  registerDescribeCurrentLineCommand(context);
  registerCharacterReadOutCommand(context);

  // Register file connector commands
  registerFileConnectorCommands(context, vscode);

  // Register C++ compilation command
  const compileCppCommand = vscode.commands.registerCommand(
    "echocode.compileAndParseCpp",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "cpp") {
        compileCurrentCppFile(editor.document.uri.fsPath);
      } else {
        vscode.window.showInformationMessage(
          "This command is only available for C++ files."
        );
      }
    }
  );
  context.subscriptions.push(compileCppCommand);

  // Register Python error checking command
  const checkPythonCommand = vscode.commands.registerCommand(
    "echocode.checkPythonErrors",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "python") {
        checkCurrentPythonFile(editor.document.uri.fsPath);
      } else {
        vscode.window.showInformationMessage(
          "This command is only available for Python files."
        );
      }
    }
  );
  context.subscriptions.push(checkPythonCommand);

  outputChannel.appendLine(
    "Commands registered: echocode.readErrors, echocode.annotate, echocode.speakNextAnnotation, echocode.readAllAnnotations, echocode.summarizeClass, echocode.summarizeFunction, echocode.jumpToNextFunction, echocode.jumpToPreviousFunction, echocode.openChat, echocode.startVoiceInput, echocode.loadAssignmentFile, echocode.rescanUserCode, echocode.readNextSequentialTask, echocode.increaseSpeechSpeed, echocode.decreaseSpeechSpeed, echocode.moveToNextFolder, echocode.moveToPreviousFolder"
  );

  // Initialize folder list when the extension starts
  initializeFolderList();

  // Listen for workspace folder changes and reinitialize the folder list
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    outputChannel.appendLine(
      "Workspace folders changed. Reinitializing folder list..."
    );
    initializeFolderList();
  });
}

function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine("[EchoCode] Deactivated");
    outputChannel.dispose();
  }
}

module.exports = { activate, deactivate, tryExecuteVoiceCommand };
