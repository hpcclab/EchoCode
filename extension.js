const vscode = require("vscode");
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
  getFriendlyLanguageName,
  tryExecuteVoiceCommand,
} = require("./program_features/Voice/voiceCommandRouter");

//student/dev mode system
const { announceMode } = require("./Core/program_settings/modeAudio");
const {
  refreshModeContext,
  onModeChange,
  getMode,
} = require("./Core/program_settings/mode");
const {
  guard,
  STUDENT_LOCKED_COMMANDS,
} = require("./Core/program_settings/guard");

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
      "[EchoCode] Warning: GitHub Copilot / Copilot Chat extension not found. AI features will be unavailable.",
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
    }),
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
        `EchoCode switched to ${newMode.toUpperCase()} mode`,
      );

      outputChannel.appendLine(`[EchoCode] Mode toggled to: ${newMode}`);
    },
  );
  const switchToStudentModeCommand = vscode.commands.registerCommand(
    "echocode.switchToStudentMode",
    async () => {
      await vscode.workspace
        .getConfiguration("echocode")
        .update("mode", "student", vscode.ConfigurationTarget.Global);

      await refreshModeContext();

      vscode.window.showInformationMessage("EchoCode switched to STUDENT mode");
      outputChannel.appendLine("[EchoCode] Mode switched to: student");
      announceMode("student", outputChannel);
    },
  );

  const switchToDevModeCommand = vscode.commands.registerCommand(
    "echocode.switchToDevMode",
    async () => {
      await vscode.workspace
        .getConfiguration("echocode")
        .update("mode", "dev", vscode.ConfigurationTarget.Global);

      await refreshModeContext();

      vscode.window.showInformationMessage("EchoCode switched to DEV mode");
      outputChannel.appendLine("[EchoCode] Mode switched to: dev");
      announceMode("dev", outputChannel);
    },
  );

  context.subscriptions.push(
    switchToStudentModeCommand,
    switchToDevModeCommand,
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
      `[ExternalIntentRouter] Registry build failed: ${err.message}`,
    ),
  );

  // start recording (no transcript yet)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStart", async () => {
      startRecording(outputChannel, context);
    }),
  );

  // ADD THIS — _voiceStop was never registered
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStop", async () => {
      try {
        const text = await stopAndTranscribe(
          outputChannel,
          context.globalState,
        );
        return { ok: true, text };
      } catch (err) {
        outputChannel.appendLine(`[Voice Stop Error] ${err.message}`);
        return { ok: false, text: "", error: err.message };
      }
    }),
  );

  // New command to change microphone manually
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.selectMicrophone", async () => {
      await selectMicrophone(context);
    }),
  );

  // --- MACRO 1: Voice to CODE only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceCode", async () => {
      if (isRecording()) {
        speakMessage("Processing");
        try {
          const text = await stopAndTranscribe(
            outputChannel,
            context.globalState,
          );
          if (!text || text.includes("no speech detected")) return;
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage(
              "EchoCode: Open a file to generate code.",
            );
            return;
          }
          const friendlyLang = getFriendlyLanguageName(
            editor.document.languageId,
          );
          vscode.window.showInformationMessage(
            `EchoCode: Generating ${friendlyLang} code...`,
          );
          const position = editor.selection.active;
          const indentation = (editor.document
            .lineAt(position.line)
            .text.match(/^\s*/) || [""])[0];
          const startLine = Math.max(0, position.line - 50);
          const endLine = Math.min(
            editor.document.lineCount - 1,
            position.line + 20,
          );
          const contextCode = editor.document.getText(
            new vscode.Range(
              startLine,
              0,
              endLine,
              editor.document.lineAt(endLine).text.length,
            ),
          );
          const generatedCode = await generateCodeFromVoice(
            text,
            friendlyLang,
            indentation,
            contextCode,
          );
          if (generatedCode) {
            await editor.edit((eb) => eb.insert(position, generatedCode));
            await speakMessage("Code generated.");
          }
        } catch (err) {
          vscode.window.showErrorMessage(
            `EchoCode Generation Fail: ${err.message}`,
          );
        }
      } else {
        await speakMessage("Coding mode. Listening.");
        startRecording(outputChannel, context);
      }
    }),
  );

  // --- MACRO 2: Voice to COMMAND only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceCommand", async () => {
      if (isRecording()) {
        speakMessage("Processing");
        try {
          const text = await stopAndTranscribe(
            outputChannel,
            context.globalState,
          );
          const voiceResult = await tryExecuteVoiceCommand(text, outputChannel);
          if (voiceResult.handled) {
            return;
          }

          vscode.window.showInformationMessage(
            `No command found for: "${text}"`,
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `EchoCode Command Fail: ${err.message}`,
          );
        }
      } else {
        await speakMessage("Command mode. Listening.");
        startRecording(outputChannel, context);
      }
    }),
  );

  // --- MACRO 3: Voice to CHAT only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceChat", async () => {
      if (isRecording()) {
        speakMessage("Processing");
        try {
          const text = await stopAndTranscribe(
            outputChannel,
            context.globalState,
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
    }),
  );

  // --- CYCLE VOICE MODE (Ctrl+Alt+') ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.cycleVoiceMode", async () => {
      // Cycle to next mode
      currentVoiceMode = (currentVoiceMode + 1) % VOICE_MODES.length;
      const label = VOICE_MODE_LABELS[currentVoiceMode];

      vscode.window.showInformationMessage(`EchoCode Voice Mode: ${label}`);
      await speakMessage(`Voice mode set to ${label}.`);
    }),
  );

  // Toggle Voice Command (Smart Router)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.toggleVoice", async () => {
      if (isRecording()) {
        // Sync UI: Stop immediately
        if (chatProvider) chatProvider.setRecordingState(false);

        // Announce processing (don't await to avoid blocking stop)
        speakMessage("Processing");

        const result = await vscode.commands.executeCommand(
          "echocode._voiceStop",
        );

        if (result && result.ok && result.text) {
          // Attempt to execute as a voice command first
          const voiceResult = await tryExecuteVoiceCommand(
            result.text,
            outputChannel,
          );

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
    }),
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
          "This command is only available for C++ files.",
        );
      }
    }),
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
          "This command is only available for Python files.",
        );
      }
    }),
  );
  context.subscriptions.push(checkPythonCommand);

  outputChannel.appendLine(
    "Commands registered: echocode.readErrors, echocode.annotate, echocode.speakNextAnnotation, echocode.readAllAnnotations, echocode.summarizeClass, echocode.summarizeFunction, echocode.jumpToNextFunction, echocode.jumpToPreviousFunction, echocode.openChat, echocode.startVoiceInput, echocode.loadAssignmentFile, echocode.rescanUserCode, echocode.readNextSequentialTask, echocode.increaseSpeechSpeed, echocode.decreaseSpeechSpeed, echocode.moveToNextFolder, echocode.moveToPreviousFolder",
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
        { placeHolder: "Choose EchoCode Guidance Level" },
      );

      if (!pick) return;

      await vscode.workspace
        .getConfiguration("echocode")
        .update("guidanceLevel", pick.value, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        `EchoCode guidance level set to ${pick.label}.`,
      );
    },
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
        vscode.ConfigurationTarget.Global,
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
    },
  );

  context.subscriptions.push(cycleGuidanceLevelCommand);

  context.subscriptions.push(setGuidanceLevelCommand);

  // Initialize folder list when the extension starts
  initializeFolderList();

  // Listen for workspace folder changes and reinitialize the folder list
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    outputChannel.appendLine(
      "Workspace folders changed. Reinitializing folder list...",
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
