const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const DependencyManager = require("./program_features/Voice/dependencyManager");

// Ensure this is the ONLY time ExternalIntentRouter is required in the whole file
const {
  matchExternalCommand,
  buildExternalCommandRegistry,
} = require("./Core/program_settings/program_settings/ExternalIntentRouter");

const {
  startRecording,
  stopAndTranscribe,
  selectMicrophone,
  isRecording,
} = require("./program_features/Voice/whisperService");

const {
  generateCodeFromVoice,
} = require("./Core/program_settings/program_settings/AIrequest");

// Helper to map VS Code language IDs to friendly names for LLM
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
    plaintext: "Pseudocode", // Fallback for plain text
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
    r: "R",
    scss: "SCSS",
    vb: "Visual Basic",
    yaml: "YAML",
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

    // Priority 2: External/user-defined commands (NEW — two lines)
    const externalCmd = matchExternalCommand(cleaned);
    if (externalCmd) {
      await vscode.commands.executeCommand(externalCmd.id);
      vscode.window.showInformationMessage(`✅ External: ${externalCmd.title}`);
      outputChannel.appendLine(
        `[Voice Command] External Matched: ${externalCmd.id}`
      );
      return { handled: true, command: externalCmd.id };
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

        vscode.window.showInformationMessage(
          `EchoCode: Generating ${friendlyLang} code...`
        );
        outputChannel.appendLine(
          `[Voice Generation] Detected Language: ${friendlyLang} (ID: ${rawLangId})`
        );

        // --- Indentation Logic ---
        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text;
        const indentationMatch = lineText.match(/^\s*/);
        const currentIndentation = indentationMatch ? indentationMatch[0] : "";

        // --- Context Window Logic ---
        // Capture 50 lines before and 20 lines after the cursor to give the AI context
        const startLine = Math.max(0, position.line - 50);
        const endLine = Math.min(
          editor.document.lineCount - 1,
          position.line + 20
        );
        const contextRange = new vscode.Range(
          startLine,
          0,
          endLine,
          editor.document.lineAt(endLine).text.length
        );
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

//student/dev mode system
const { announceMode } = require("./Core/program_settings/modeAudio");
const { refreshModeContext, onModeChange, getMode } = require("./Core/program_settings/mode");
const { guard } = require("./Core/program_settings/guard");


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

// Voice mode cycle: 0 = Chat, 1 = Code, 2 = Command
const VOICE_MODES = ["chat", "code", "command"];
const VOICE_MODE_LABELS = ["Chat Tutor", "Code Generation", "Command"];
let currentVoiceMode = 0;

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

  // Initialize student/dev mode context
const initialMode = await refreshModeContext();
announceMode(initialMode, outputChannel);
  
  context.subscriptions.push(
    onModeChange(async () => {
  const mode = await refreshModeContext();
  outputChannel.appendLine(`[EchoCode] Mode changed: ${mode}`);
  announceMode(mode, outputChannel);
})
  );

  // Toggle Student/Dev mode command
const toggleModeCommand = vscode.commands.registerCommand(
  "echocode.toggleMode",
  async () => {
    const currentMode = getMode();
    const newMode = currentMode === "student" ? "dev" : "student";

    await vscode.workspace
      .getConfiguration("echocode")
      .update("mode", newMode, vscode.ConfigurationTarget.Global);

    await refreshModeContext();

    vscode.window.showInformationMessage(
      `EchoCode switched to ${newMode.toUpperCase()} mode`
    );

    outputChannel.appendLine(`[EchoCode] Mode toggled to: ${newMode}`);
  }
);

context.subscriptions.push(toggleModeCommand);
// Ensure Copilot (stable, chat, or nightly) is available for AI features
await ensureCopilotActivated(outputChannel);

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

  // Build external command registry on activation (non-blocking)
  buildExternalCommandRegistry().catch((err) =>
    outputChannel.appendLine(
      `[ExternalIntentRouter] Registry build failed: ${err.message}`
    )
  );

  // start recording (no transcript yet)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStart", async () => {
      startRecording(outputChannel, context);
    })
  );

  // ADD THIS — _voiceStop was never registered
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStop", async () => {
      try {
        const text = await stopAndTranscribe(
          outputChannel,
          context.globalState
        );
        return { ok: true, text };
      } catch (err) {
        outputChannel.appendLine(`[Voice Stop Error] ${err.message}`);
        return { ok: false, text: "", error: err.message };
      }
    })
  );

  // New command to change microphone manually
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.selectMicrophone", async () => {
      await selectMicrophone(context);
    })
  );

  // --- MACRO 1: Voice to CODE only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceCode", async () => {
      if (isRecording()) {
        speakMessage("Processing");
        try {
          const text = await stopAndTranscribe(
            outputChannel,
            context.globalState
          );
          if (!text || text.includes("no speech detected")) return;
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage(
              "EchoCode: Open a file to generate code."
            );
            return;
          }
          const friendlyLang = getFriendlyLanguageName(
            editor.document.languageId
          );
          vscode.window.showInformationMessage(
            `EchoCode: Generating ${friendlyLang} code...`
          );
          const position = editor.selection.active;
          const indentation = (editor.document
            .lineAt(position.line)
            .text.match(/^\s*/) || [""])[0];
          const startLine = Math.max(0, position.line - 50);
          const endLine = Math.min(
            editor.document.lineCount - 1,
            position.line + 20
          );
          const contextCode = editor.document.getText(
            new vscode.Range(
              startLine,
              0,
              endLine,
              editor.document.lineAt(endLine).text.length
            )
          );
          const generatedCode = await generateCodeFromVoice(
            text,
            friendlyLang,
            indentation,
            contextCode
          );
          if (generatedCode) {
            await editor.edit((eb) => eb.insert(position, generatedCode));
            await speakMessage("Code generated.");
          }
        } catch (err) {
          vscode.window.showErrorMessage(
            `EchoCode Generation Fail: ${err.message}`
          );
        }
      } else {
        await speakMessage("Coding mode. Listening.");
        startRecording(outputChannel, context);
      }
    })
  );

  // --- MACRO 2: Voice to COMMAND only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceCommand", async () => {
      if (isRecording()) {
        speakMessage("Processing");
        try {
          const text = await stopAndTranscribe(
            outputChannel,
            context.globalState
          );
          if (!text || text.includes("no speech detected")) return;
          const cleaned = text.toLowerCase().trim();

          // Priority 1: EchoCode internal commands
          const commandsPath = path.join(
            __dirname,
            "Core/program_settings/program_settings/voice_commands.json"
          );
          const internalCommands = JSON.parse(
            fs.readFileSync(commandsPath, "utf-8")
          );
          for (const cmd of internalCommands) {
            if (cmd.keywords.some((k) => cleaned.includes(k))) {
              await vscode.commands.executeCommand(cmd.id);
              vscode.window.showInformationMessage(`✅ Executed: ${cmd.title}`);
              return;
            }
          }

          // Priority 2: External/user-defined commands
          const externalCmd = matchExternalCommand(cleaned);
          if (externalCmd) {
            await vscode.commands.executeCommand(externalCmd.id);
            vscode.window.showInformationMessage(
              `✅ External: ${externalCmd.title}`
            );
            return;
          }

          vscode.window.showInformationMessage(
            `No command found for: "${text}"`
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `EchoCode Command Fail: ${err.message}`
          );
        }
      } else {
        await speakMessage("Command mode. Listening.");
        startRecording(outputChannel, context);
      }
    })
  );

  // --- MACRO 3: Voice to CHAT only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceChat", async () => {
      if (isRecording()) {
        speakMessage("Processing");
        try {
          const text = await stopAndTranscribe(
            outputChannel,
            context.globalState
          );
          if (!text || text.includes("no speech detected")) return;
          await vscode.commands.executeCommand("echocode.openChat");
          if (chatProvider) {
            await chatProvider.handleUserMessage(text);
          }
        } catch (err) {
          vscode.window.showErrorMessage(`EchoCode Chat Fail: ${err.message}`);
        }
      } else {
        await speakMessage("Chat mode. Listening.");
        startRecording(outputChannel, context);
      }
    })
  );

  // --- CYCLE VOICE MODE (Ctrl+Alt+') ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.cycleVoiceMode", async () => {
      // Cycle to next mode
      currentVoiceMode = (currentVoiceMode + 1) % VOICE_MODES.length;
      const label = VOICE_MODE_LABELS[currentVoiceMode];

      vscode.window.showInformationMessage(`EchoCode Voice Mode: ${label}`);
      await speakMessage(`Voice mode set to ${label}.`);
    })
  );

  // --- SMART TOGGLE: Uses current mode to decide behavior ---
  // This replaces the need to remember 3 separate hotkeys.
  // Ctrl+Alt+Space now respects the current mode.
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.toggleVoice", async () => {
      if (isRecording()) {
        if (chatProvider) chatProvider.setRecordingState(false);
        speakMessage("Processing");
        try {
          const text = await stopAndTranscribe(
            outputChannel,
            context.globalState
          );
          if (!text || text.includes("no speech detected")) return;

          const mode = VOICE_MODES[currentVoiceMode];

          if (mode === "chat") {
            // Mode 0: Send to chat tutor
            await vscode.commands.executeCommand("echocode.openChat");
            if (chatProvider) await chatProvider.handleUserMessage(text);
          } else if (mode === "code") {
            // Mode 1: Generate code into editor
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
              vscode.window.showErrorMessage(
                "EchoCode: Open a file to generate code."
              );
              return;
            }
            const friendlyLang = getFriendlyLanguageName(
              editor.document.languageId
            );
            vscode.window.showInformationMessage(
              `EchoCode: Generating ${friendlyLang} code...`
            );
            const position = editor.selection.active;
            const indentation = (editor.document
              .lineAt(position.line)
              .text.match(/^\s*/) || [""])[0];
            const startLine = Math.max(0, position.line - 50);
            const endLine = Math.min(
              editor.document.lineCount - 1,
              position.line + 20
            );
            const contextCode = editor.document.getText(
              new vscode.Range(
                startLine,
                0,
                endLine,
                editor.document.lineAt(endLine).text.length
              )
            );
            const generatedCode = await generateCodeFromVoice(
              text,
              friendlyLang,
              indentation,
              contextCode
            );
            if (generatedCode) {
              await editor.edit((eb) => eb.insert(position, generatedCode));
              await speakMessage("Code generated.");
            }
          } else if (mode === "command") {
            // Mode 2: Run internal then external commands
            const cleaned = text.toLowerCase().trim();
            const commandsPath = path.join(
              __dirname,
              "Core/program_settings/program_settings/voice_commands.json"
            );
            const internalCommands = JSON.parse(
              fs.readFileSync(commandsPath, "utf-8")
            );
            for (const cmd of internalCommands) {
              if (cmd.keywords.some((k) => cleaned.includes(k))) {
                await vscode.commands.executeCommand(cmd.id);
                vscode.window.showInformationMessage(
                  `✅ Executed: ${cmd.title}`
                );
                return;
              }
            }
            const externalCmd = matchExternalCommand(cleaned);
            if (externalCmd) {
              await vscode.commands.executeCommand(externalCmd.id);
              vscode.window.showInformationMessage(
                `✅ External: ${externalCmd.title}`
              );
              return;
            }
            vscode.window.showInformationMessage(
              `No command found for: "${text}"`
            );
          }
        } catch (err) {
          outputChannel.appendLine(`[Toggle Voice Error] ${err.message}`);
        }
      } else {
        if (chatProvider) chatProvider.setRecordingState(true);
        await speakMessage(
          `${VOICE_MODE_LABELS[currentVoiceMode]} mode. Listening.`
        );
        startRecording(outputChannel, context);
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
  guard("echocode.compileAndParseCpp", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === "cpp") {
      compileCurrentCppFile(editor.document.uri.fsPath);
    } else {
      vscode.window.showInformationMessage(
        "This command is only available for C++ files."
      );
    }
  })
);
context.subscriptions.push(compileCppCommand);

  // Register Python error checking command
  const checkPythonCommand = vscode.commands.registerCommand(
  "echocode.checkPythonErrors",
  guard("echocode.checkPythonErrors", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === "python") {
      checkCurrentPythonFile(editor.document.uri.fsPath);
    } else {
      vscode.window.showInformationMessage(
        "This command is only available for Python files."
      );
    }
  })
);
context.subscriptions.push(checkPythonCommand);


  outputChannel.appendLine(
    "Commands registered: echocode.readErrors, echocode.annotate, echocode.speakNextAnnotation, echocode.readAllAnnotations, echocode.summarizeClass, echocode.summarizeFunction, echocode.jumpToNextFunction, echocode.jumpToPreviousFunction, echocode.openChat, echocode.startVoiceInput, echocode.loadAssignmentFile, echocode.rescanUserCode, echocode.readNextSequentialTask, echocode.increaseSpeechSpeed, echocode.decreaseSpeechSpeed, echocode.moveToNextFolder, echocode.moveToPreviousFolder"
  );

  // Guidance level commands - for controlling how verbose/guided the AI responses are across features that use AI (summarizer, big O, annotations, what's this)
  const setGuidanceLevelCommand = vscode.commands.registerCommand(
    "echocode.setGuidanceLevel",
    async () => {
      // Show a quick pick to select the guidance level
      const pick = await vscode.window.showQuickPick(
        [
          {
            label: "Guided",
            value: "guided",
            detail: "Step-by-step, minimal jargon",
          },
          {
            label: "Balanced",
            value: "balanced",
            detail: "Rule + a couple fix options",
          },
          {
            label: "Concise",
            value: "concise",
            detail: "Technical, raw error included",
          },
        ],
        { placeHolder: "Choose EchoCode Guidance Level" }
      );

      if (!pick) return;

      await vscode.workspace
        .getConfiguration("echocode")
        .update("guidanceLevel", pick.value, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        `EchoCode guidance level set to ${pick.label}.`
      );
    }
  );

  // Optional: command to cycle through guidance levels quickly
  const cycleGuidanceLevelCommand = vscode.commands.registerCommand(
    "echocode.cycleGuidanceLevel",
    // Cycles through guided -> balanced -> concise -> back to guided
    async () => {
      const config = vscode.workspace.getConfiguration("echocode");
      const current = config.get("guidanceLevel", "balanced");

      const order = ["guided", "balanced", "concise"];
      const idx = order.indexOf(current);
      const next =
        order[
          (idx >= 0 ? idx : 1) + 1 >= order.length
            ? 0
            : (idx >= 0 ? idx : 1) + 1
        ];

      await config.update(
        "guidanceLevel",
        next,
        vscode.ConfigurationTarget.Global
      );

      const label =
        next === "guided"
          ? "Guided"
          : next === "balanced"
          ? "Balanced"
          : "Concise";

      vscode.window.showInformationMessage(`EchoCode guidance level: ${label}`);

      // Optional: speak confirmation (uses your existing TTS setup)
      try {
        // speakMessage is not imported in extension.js, so require it here
        const {
          speakMessage,
        } = require("./Core/program_settings/speech_settings/speechHandler");
        await speakMessage(`Guidance level set to ${label}.`);
      } catch (_) {
        // If TTS unavailable, silently ignore
      }
    }
  );

  context.subscriptions.push(cycleGuidanceLevelCommand);

  context.subscriptions.push(setGuidanceLevelCommand);

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
