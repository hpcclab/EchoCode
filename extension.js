const vscode = require("vscode");
require("dotenv").config();
const {
  loadProgramFeatureModule,
  resolveClassExport,
  clearFeatureRequireCache,
} = require("./program_features/featureImplementationLoader");

// Ensure this is the ONLY time ExternalIntentRouter is required in the whole file
const {
  matchExternalCommand,
  buildExternalCommandRegistry,
} = require("./Core/program_settings/program_settings/ExternalIntentRouter");

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
  checkCurrentPythonFile: builtInCheckCurrentPythonFile,
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

// Navigation + “What’s this”
const {
  registerMoveCursor,
} = require("./navigation_features/navigationHandler");
const { registerWhereAmICommand } = require("./navigation_features/whereAmI");
const {
  registerFileNavigatorCommand,
} = require("./navigation_features/Folder_File_Navigator/file_navigator");
const {
  initializeFolderList,
  registerFolderNavigatorCommands,
} = require("./navigation_features/Folder_File_Navigator/folder_navigator");

let outputChannel;
let tryExecuteVoiceCommand = async () => ({ handled: false });

const FEATURE_FOLDER_MAP = {
  annotationsBigO: "Annotations_BigO",
  assignmentTracker: "Assignment_Tracker",
  errorParser: "C++_Error_Parser",
  chatBot: "ChatBot",
  fileConnector: "FileConnector",
  folderFileCreator: "Folder_File_Creator",
  voice: "Voice",
  whatIsThis: "WhatIsThis",
};

const RELOADABLE_FEATURE_KEYS = Object.keys(FEATURE_FOLDER_MAP);

function loadFeatureImplementations(channel) {
  const voiceDependencyModule = loadProgramFeatureModule({
    featureKey: "voice",
    featureFolder: "Voice",
    moduleFile: "dependencyManager.js",
    outputChannel: channel,
  });

  const whisperServiceModule = loadProgramFeatureModule({
    featureKey: "voice",
    featureFolder: "Voice",
    moduleFile: "whisperService.js",
    requiredExports: [
      "startRecording",
      "stopAndTranscribe",
      "selectMicrophone",
      "isRecording",
    ],
    outputChannel: channel,
  });

  const voiceCommandRouterModule = loadProgramFeatureModule({
    featureKey: "voice",
    featureFolder: "Voice",
    moduleFile: "voiceCommandRouter.js",
    requiredExports: ["getFriendlyLanguageName", "tryExecuteVoiceCommand"],
    outputChannel: channel,
  });

  const chatModule = loadProgramFeatureModule({
    featureKey: "chatBot",
    featureFolder: "ChatBot",
    moduleFile: "Chat_Tutor.js",
    requiredExports: ["registerChatCommands"],
    outputChannel: channel,
  });

  const fileConnectorModule = loadProgramFeatureModule({
    featureKey: "fileConnector",
    featureFolder: "FileConnector",
    moduleFile: "File_Connector.js",
    requiredExports: ["registerFileConnectorCommands"],
    outputChannel: channel,
  });

  const bigOModule = loadProgramFeatureModule({
    featureKey: "annotationsBigO",
    featureFolder: "Annotations_BigO",
    moduleFile: "bigOAnalysis.js",
    requiredExports: ["registerBigOCommand"],
    outputChannel: channel,
  });

  const annotationsModule = loadProgramFeatureModule({
    featureKey: "annotationsBigO",
    featureFolder: "Annotations_BigO",
    moduleFile: "annotations.js",
    requiredExports: ["registerAnnotationCommands"],
    outputChannel: channel,
  });

  const assignmentModule = loadProgramFeatureModule({
    featureKey: "assignmentTracker",
    featureFolder: "Assignment_Tracker",
    moduleFile: "assignmentTracker.js",
    requiredExports: ["registerAssignmentTrackerCommands"],
    outputChannel: channel,
  });

  const cppParserModule = loadProgramFeatureModule({
    featureKey: "errorParser",
    featureFolder: "C++_Error_Parser",
    moduleFile: "CPP_Error_Parser.js",
    requiredExports: ["compileCurrentCppFile"],
    outputChannel: channel,
  });

  const pythonParserModule = loadProgramFeatureModule({
    featureKey: "errorParser",
    featureFolder: "C++_Error_Parser",
    moduleFile: "Python_Error_Parser.js",
    requiredExports: ["checkCurrentPythonFile"],
    outputChannel: channel,
  });

  const fileCreatorModule = loadProgramFeatureModule({
    featureKey: "folderFileCreator",
    featureFolder: "Folder_File_Creator",
    moduleFile: "FileCreator.js",
    requiredExports: ["registerFileCreatorCommand"],
    outputChannel: channel,
  });

  const folderCreatorModule = loadProgramFeatureModule({
    featureKey: "folderFileCreator",
    featureFolder: "Folder_File_Creator",
    moduleFile: "FolderCreator.js",
    requiredExports: ["registerFolderCreatorCommand"],
    outputChannel: channel,
  });

  const whatIsThisModule = loadProgramFeatureModule({
    featureKey: "whatIsThis",
    featureFolder: "WhatIsThis",
    moduleFile: "WhatIsThis",
    requiredExports: ["registerReadCurrentLineCommand"],
    outputChannel: channel,
  });

  const describeThisModule = loadProgramFeatureModule({
    featureKey: "whatIsThis",
    featureFolder: "WhatIsThis",
    moduleFile: "DescribeThis.js",
    requiredExports: ["registerDescribeCurrentLineCommand"],
    outputChannel: channel,
  });

  const characterReadOutModule = loadProgramFeatureModule({
    featureKey: "whatIsThis",
    featureFolder: "WhatIsThis",
    moduleFile: "CharacterReadOut.js",
    requiredExports: ["registerCharacterReadOutCommand"],
    outputChannel: channel,
  });

  const dependencyManagerCtor =
    resolveClassExport(voiceDependencyModule, "DependencyManager") ||
    resolveClassExport(
      require("./program_features/Voice/dependencyManager"),
      "DependencyManager",
    );

  return {
    DependencyManager: dependencyManagerCtor,
    startRecording: whisperServiceModule.startRecording,
    stopAndTranscribe: whisperServiceModule.stopAndTranscribe,
    selectMicrophone: whisperServiceModule.selectMicrophone,
    isRecording: whisperServiceModule.isRecording,
    getFriendlyLanguageName: voiceCommandRouterModule.getFriendlyLanguageName,
    tryExecuteVoiceCommand: voiceCommandRouterModule.tryExecuteVoiceCommand,
    registerChatCommands: chatModule.registerChatCommands,
    registerFileConnectorCommands:
      fileConnectorModule.registerFileConnectorCommands,
    registerBigOCommand: bigOModule.registerBigOCommand,
    registerAnnotationCommands: annotationsModule.registerAnnotationCommands,
    registerAssignmentTrackerCommands:
      assignmentModule.registerAssignmentTrackerCommands,
    compileCurrentCppFile: cppParserModule.compileCurrentCppFile,
    checkCurrentPythonFile:
      pythonParserModule.checkCurrentPythonFile ||
      builtInCheckCurrentPythonFile,
    registerFileCreatorCommand: fileCreatorModule.registerFileCreatorCommand,
    registerFolderCreatorCommand:
      folderCreatorModule.registerFolderCreatorCommand,
    registerReadCurrentLineCommand:
      whatIsThisModule.registerReadCurrentLineCommand,
    registerDescribeCurrentLineCommand:
      describeThisModule.registerDescribeCurrentLineCommand,
    registerCharacterReadOutCommand:
      characterReadOutModule.registerCharacterReadOutCommand,
  };
}

function toDisposable(value) {
  if (!value) return null;

  if (typeof value.dispose === "function") {
    return value;
  }

  if (Array.isArray(value)) {
    const valid = value.filter(
      (item) => item && typeof item.dispose === "function",
    );
    if (valid.length > 0) {
      return vscode.Disposable.from(...valid);
    }
  }

  return null;
}

function registerUserImplementationWatchers(context, onFeatureChanged) {
  const watchers = [];

  for (const [featureKey, featureFolder] of Object.entries(
    FEATURE_FOLDER_MAP,
  )) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      `**/program_features/${featureFolder}/UserImplementation/**`,
    );

    const triggerReload = () => onFeatureChanged(featureKey);
    watcher.onDidChange(triggerReload);
    watcher.onDidCreate(triggerReload);
    watcher.onDidDelete(triggerReload);

    watchers.push(watcher);
  }

  const disposable = vscode.Disposable.from(...watchers);
  context.subscriptions.push(disposable);
  return disposable;
}

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

  let featureImplementations = loadFeatureImplementations(outputChannel);
  const featureDisposables = new Map();
  let chatProvider = null;

  const setFeatureDisposable = (featureKey, disposableValue) => {
    const previous = featureDisposables.get(featureKey);
    if (previous && typeof previous.dispose === "function") {
      previous.dispose();
    }

    const disposable = toDisposable(disposableValue);
    if (disposable) {
      featureDisposables.set(featureKey, disposable);
      context.subscriptions.push(disposable);
    } else {
      featureDisposables.delete(featureKey);
    }
  };

  const registerFeatureCommands = (featureKey) => {
    switch (featureKey) {
      case "annotationsBigO": {
        const d1 = featureImplementations.registerBigOCommand(context);
        const d2 = featureImplementations.registerAnnotationCommands(
          context,
          outputChannel,
        );
        return vscode.Disposable.from(...[d1, d2].filter(Boolean));
      }
      case "assignmentTracker":
        return featureImplementations.registerAssignmentTrackerCommands(
          context,
        );
      case "chatBot": {
        const registration = featureImplementations.registerChatCommands(
          context,
          outputChannel,
        );
        if (
          registration &&
          typeof registration === "object" &&
          "provider" in registration
        ) {
          chatProvider = registration.provider || null;
          return registration.disposable || null;
        }

        chatProvider = registration || null;
        return null;
      }
      case "fileConnector":
        return featureImplementations.registerFileConnectorCommands(
          context,
          vscode,
        );
      case "folderFileCreator": {
        const d1 = featureImplementations.registerFileCreatorCommand(context);
        const d2 = featureImplementations.registerFolderCreatorCommand(context);
        return vscode.Disposable.from(...[d1, d2].filter(Boolean));
      }
      case "whatIsThis": {
        const d1 =
          featureImplementations.registerReadCurrentLineCommand(context);
        const d2 =
          featureImplementations.registerDescribeCurrentLineCommand(context);
        const d3 =
          featureImplementations.registerCharacterReadOutCommand(context);
        return vscode.Disposable.from(...[d1, d2, d3].filter(Boolean));
      }
      default:
        return null;
    }
  };

  const reloadFeatureImplementation = async (featureKey, reason = "change") => {
    const featureFolder = FEATURE_FOLDER_MAP[featureKey];
    if (!featureFolder) {
      return;
    }

    try {
      clearFeatureRequireCache(featureFolder);
      featureImplementations = loadFeatureImplementations(outputChannel);
      tryExecuteVoiceCommand = featureImplementations.tryExecuteVoiceCommand;

      if (
        featureKey === "voice" &&
        typeof featureImplementations.DependencyManager === "function"
      ) {
        const depManager = new featureImplementations.DependencyManager(
          context,
          outputChannel,
        );
        depManager.ensureDependencies().catch((err) => {
          outputChannel.appendLine(`[Dependency Error] ${err.message}`);
        });
      }

      if (
        [
          "annotationsBigO",
          "assignmentTracker",
          "chatBot",
          "fileConnector",
          "folderFileCreator",
          "whatIsThis",
        ].includes(featureKey)
      ) {
        setFeatureDisposable(featureKey, registerFeatureCommands(featureKey));
      }

      outputChannel.appendLine(
        `[Feature Loader] Reloaded ${featureKey} implementation (${reason}).`,
      );
    } catch (error) {
      outputChannel.appendLine(
        `[Feature Loader] Failed to reload ${featureKey}: ${error.message}`,
      );
    }
  };

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
  if (typeof featureImplementations.DependencyManager === "function") {
    const depManager = new featureImplementations.DependencyManager(
      context,
      outputChannel,
    );
    // We don't await this blocking if we want faster startup,
    // but for safety we await to ensure python is ready before first voice command
    depManager.ensureDependencies().catch((err) => {
      outputChannel.appendLine(`[Dependency Error] ${err.message}`);
    });
  } else {
    outputChannel.appendLine(
      "[Feature Loader] Voice dependency manager is invalid. Skipping dependency bootstrap.",
    );
  }
  // --- DEPENDENCY CHECK END ---

  // Speech prefs
  loadSavedSpeechSpeed();

  // Register core commands first (code-agnostic)
  // Register core commands first (code-agnostic)
  registerSpeechCommands(context, outputChannel);
  registerSummarizerCommands(context, outputChannel);
  registerHotkeyGuideCommand(context);

  // Register commands from configurable feature modules.
  [
    "chatBot",
    "annotationsBigO",
    "assignmentTracker",
    "folderFileCreator",
    "whatIsThis",
    "fileConnector",
  ].forEach((featureKey) => {
    setFeatureDisposable(featureKey, registerFeatureCommands(featureKey));
  });

  // Build external command registry on activation (non-blocking)
  buildExternalCommandRegistry().catch((err) =>
    outputChannel.appendLine(
      `[ExternalIntentRouter] Registry build failed: ${err.message}`,
    ),
  );

  // start recording (no transcript yet)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStart", async () => {
      featureImplementations.startRecording(outputChannel, context);
    }),
  );

  // ADD THIS — _voiceStop was never registered
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStop", async () => {
      try {
        const text = await featureImplementations.stopAndTranscribe(
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
      await featureImplementations.selectMicrophone(context);
    }),
  );

  // --- MACRO 1: Voice to CODE only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceCode", async () => {
      if (featureImplementations.isRecording()) {
        speakMessage("Processing");
        try {
          const text = await featureImplementations.stopAndTranscribe(
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
          const friendlyLang = featureImplementations.getFriendlyLanguageName(
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
        featureImplementations.startRecording(outputChannel, context);
      }
    }),
  );

  // --- MACRO 2: Voice to COMMAND only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceCommand", async () => {
      if (featureImplementations.isRecording()) {
        speakMessage("Processing");
        try {
          const text = await featureImplementations.stopAndTranscribe(
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
        featureImplementations.startRecording(outputChannel, context);
      }
    }),
  );

  // --- MACRO 3: Voice to CHAT only ---
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.voiceChat", async () => {
      if (featureImplementations.isRecording()) {
        speakMessage("Processing");
        try {
          const text = await featureImplementations.stopAndTranscribe(
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
        featureImplementations.startRecording(outputChannel, context);
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
      if (featureImplementations.isRecording()) {
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

  registerWhereAmICommand(context);
  registerMoveCursor(context);
  registerFileNavigatorCommand(context);
  registerFolderNavigatorCommands(context);

  // Register C++ compilation command
  const compileCppCommand = vscode.commands.registerCommand(
    "echocode.compileAndParseCpp",
    guard("echocode.compileAndParseCpp", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "cpp") {
        featureImplementations.compileCurrentCppFile(
          editor.document.uri.fsPath,
        );
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
        featureImplementations.checkCurrentPythonFile(
          editor.document.uri.fsPath,
        );
      } else {
        vscode.window.showInformationMessage(
          "This command is only available for Python files.",
        );
      }
    }),
  );
  context.subscriptions.push(checkPythonCommand);

  const reloadTimers = new Map();
  const scheduleFeatureReload = (featureKey, reason) => {
    const existingTimer = reloadTimers.get(featureKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      reloadTimers.delete(featureKey);
      reloadFeatureImplementation(featureKey, reason);
    }, 150);

    reloadTimers.set(featureKey, timer);
  };

  const watcherDisposable = registerUserImplementationWatchers(
    context,
    (featureKey) => {
      scheduleFeatureReload(featureKey, "user implementation file changed");
    },
  );
  context.subscriptions.push(watcherDisposable);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      for (const featureKey of RELOADABLE_FEATURE_KEYS) {
        const settingKey = `echocode.featureImplementation.${featureKey}`;
        if (event.affectsConfiguration(settingKey)) {
          scheduleFeatureReload(featureKey, "configuration changed");
        }
      }
    }),
  );

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

async function executeVoiceCommand(...args) {
  return tryExecuteVoiceCommand(...args);
}

module.exports = {
  activate,
  deactivate,
  tryExecuteVoiceCommand: executeVoiceCommand,
};
