import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";

const vscode: any = VS;
const nodeRequire = require;
const repoRoot = process.cwd();
const extensionModulePath = nodeRequire.resolve(
  path.join(repoRoot, "extension.js"),
);

type StubMap = Record<string, any>;

function createOutputChannelRecorder() {
  const lines: string[] = [];
  return {
    channel: {
      appendLine: (text: string) => lines.push(text),
      show: () => {},
      dispose: () => {},
    },
    lines,
  };
}

function createVscodeHarness() {
  const globalVscode: any = (globalThis as any).vscode;
  const commandRegistry = new Map<string, (...args: any[]) => any>();
  const infoMessages: string[] = [];
  const errorMessages: string[] = [];
  const configUpdates: Array<{ key: string; value: unknown; target: unknown }> =
    [];
  const output = createOutputChannelRecorder();
  const originalRegister = globalVscode.commands.registerCommand;
  const originalExecute = globalVscode.commands.executeCommand;
  const originalGetCommands = globalVscode.commands.getCommands;
  const originalShowInfo = globalVscode.window.showInformationMessage;
  const originalShowError = globalVscode.window.showErrorMessage;
  const originalCreateOutputChannel = globalVscode.window.createOutputChannel;
  const originalQuickPick = globalVscode.window.showQuickPick;
  const originalGetConfiguration = globalVscode.workspace.getConfiguration;
  const originalCreateFileSystemWatcher =
    globalVscode.workspace.createFileSystemWatcher;
  const originalOnDidChangeConfiguration =
    globalVscode.workspace.onDidChangeConfiguration;
  const originalOnDidChangeWorkspaceFolders =
    globalVscode.workspace.onDidChangeWorkspaceFolders;
  const originalExtensions = globalVscode.extensions;
  const originalConfigurationTarget = globalVscode.ConfigurationTarget;
  const originalDisposable = globalVscode.Disposable;

  const workspace = {
    getConfiguration: () => ({
      get: (_key: string, fallback: unknown) => fallback,
      update: async (key: string, value: unknown, target: unknown) => {
        configUpdates.push({ key, value, target });
      },
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    createFileSystemWatcher: () => ({
      onDidChange: () => ({ dispose: () => {} }),
      onDidCreate: () => ({ dispose: () => {} }),
      onDidDelete: () => ({ dispose: () => {} }),
      dispose: () => {},
    }),
  };

  globalVscode.commands.registerCommand = (
    id: string,
    handler: (...args: any[]) => any,
  ) => {
    commandRegistry.set(id, handler);
    return { dispose: () => commandRegistry.delete(id) };
  };

  globalVscode.commands.executeCommand = async (id: string, ...args: any[]) => {
    const handler = commandRegistry.get(id);
    if (!handler) {
      throw new Error(`Command not found: ${id}`);
    }
    return handler(...args);
  };

  globalVscode.commands.getCommands = async () =>
    Array.from(commandRegistry.keys());
  globalVscode.window.showInformationMessage = (message: string) => {
    infoMessages.push(message);
    return Promise.resolve(undefined);
  };
  globalVscode.window.showErrorMessage = (message: string) => {
    errorMessages.push(message);
    return Promise.resolve(undefined);
  };
  globalVscode.window.createOutputChannel = () => output.channel;
  globalVscode.window.showQuickPick = async (items: any[]) => items[0];
  globalVscode.workspace.getConfiguration = workspace.getConfiguration;
  globalVscode.workspace.createFileSystemWatcher =
    workspace.createFileSystemWatcher;
  globalVscode.workspace.onDidChangeConfiguration =
    workspace.onDidChangeConfiguration;
  globalVscode.workspace.onDidChangeWorkspaceFolders =
    workspace.onDidChangeWorkspaceFolders;
  globalVscode.extensions = {
    getExtension: () => null,
  };
  globalVscode.ConfigurationTarget = { Global: "global" };
  globalVscode.Disposable = {
    from: (...disposables: Array<{ dispose?: () => void } | undefined>) => ({
      dispose: () => {
        for (const disposable of disposables) {
          if (disposable && typeof disposable.dispose === "function") {
            disposable.dispose();
          }
        }
      },
    }),
  };

  return {
    commandRegistry,
    infoMessages,
    errorMessages,
    configUpdates,
    outputLines: output.lines,
    restore: () => {
      globalVscode.commands.registerCommand = originalRegister;
      globalVscode.commands.executeCommand = originalExecute;
      globalVscode.commands.getCommands = originalGetCommands;
      globalVscode.window.showInformationMessage = originalShowInfo;
      globalVscode.window.showErrorMessage = originalShowError;
      globalVscode.window.createOutputChannel = originalCreateOutputChannel;
      globalVscode.window.showQuickPick = originalQuickPick;
      globalVscode.workspace.getConfiguration = originalGetConfiguration;
      globalVscode.workspace.createFileSystemWatcher =
        originalCreateFileSystemWatcher;
      globalVscode.workspace.onDidChangeConfiguration =
        originalOnDidChangeConfiguration;
      globalVscode.workspace.onDidChangeWorkspaceFolders =
        originalOnDidChangeWorkspaceFolders;
      globalVscode.extensions = originalExtensions;
      globalVscode.ConfigurationTarget = originalConfigurationTarget;
      globalVscode.Disposable = originalDisposable;
    },
  };
}

function loadRootExtension(stubModules: StubMap) {
  const previousEntries = new Map<string, any>();

  for (const [relativePath, moduleExports] of Object.entries(stubModules)) {
    const modulePath = nodeRequire.resolve(path.join(repoRoot, relativePath));
    previousEntries.set(modulePath, nodeRequire.cache[modulePath]);
    (nodeRequire.cache as any)[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports: moduleExports,
    };
  }

  const previousExtension = nodeRequire.cache[extensionModulePath];
  delete nodeRequire.cache[extensionModulePath];

  return {
    extension: nodeRequire(extensionModulePath),
    restore: () => {
      delete nodeRequire.cache[extensionModulePath];
      if (previousExtension) {
        nodeRequire.cache[extensionModulePath] = previousExtension;
      }

      for (const [modulePath, previousEntry] of previousEntries.entries()) {
        if (previousEntry) {
          nodeRequire.cache[modulePath] = previousEntry;
        } else {
          delete nodeRequire.cache[modulePath];
        }
      }
    },
  };
}

function createExtensionStubs(state: {
  isRecording: boolean;
  stopText?: string;
  voiceHandled?: boolean;
}) {
  const chatProvider = {
    handledMessages: [] as string[],
    recordingStates: [] as boolean[],
    handleUserMessage: async (message: string) => {
      chatProvider.handledMessages.push(message);
    },
    setRecordingState: (value: boolean) => {
      chatProvider.recordingStates.push(value);
    },
  };
  const spokenMessages: string[] = [];
  const startRecordingCalls: number[] = [];
  const selectMicrophoneCalls: number[] = [];
  const refreshCalls: number[] = [];
  const buildRegistryCalls: number[] = [];
  const dependencyEnsures: number[] = [];
  const announceCalls: string[] = [];
  const initializeFolderCalls: number[] = [];
  const stopCalls: number[] = [];
  const voiceCommands: string[] = [];

  const stubs: StubMap = {
    "program_features/Voice/dependencyManager.js": class DependencyManager {
      constructor(_context: any, _outputChannel: any) {}

      async ensureDependencies() {
        dependencyEnsures.push(1);
      }
    },
    "Core/program_settings/program_settings/ExternalIntentRouter.js": {
      matchExternalCommand: () => null,
      buildExternalCommandRegistry: async () => {
        buildRegistryCalls.push(1);
      },
    },
    "program_features/Voice/whisperService.js": {
      startRecording: () => {
        startRecordingCalls.push(1);
      },
      stopAndTranscribe: async () => {
        stopCalls.push(1);
        return state.stopText ?? "stub transcript";
      },
      selectMicrophone: async () => {
        selectMicrophoneCalls.push(1);
      },
      isRecording: () => state.isRecording,
    },
    "program_features/Voice/voiceCommandRouter.js": {
      getFriendlyLanguageName: (languageId: string) => languageId,
      tryExecuteVoiceCommand: async (text: string) => {
        voiceCommands.push(text);
        return { handled: state.voiceHandled ?? true };
      },
    },
    "Core/program_settings/modeAudio.js": {
      announceMode: (mode: string) => {
        announceCalls.push(mode);
      },
    },
    "Core/program_settings/mode.js": {
      refreshModeContext: async () => {
        refreshCalls.push(1);
        return "student";
      },
      onModeChange: () => ({ dispose: () => {} }),
      getMode: () => "student",
    },
    "Core/program_settings/guard.js": {
      guard: (_id: string, handler: (...args: any[]) => any) => handler,
      STUDENT_LOCKED_COMMANDS: new Set(),
    },
    "Language/Python/pylintHandler.js": {
      ensurePylintInstalled: async () => {},
    },
    "Language/Python/errorHandler.js": {
      initializeErrorHandling: () => {},
      registerErrorHandlingCommands: () => {},
    },
    "program_features/C++_Error_Parser/Python_Error_Parser.js": {
      checkCurrentPythonFile: () => {},
    },
    "Core/program_settings/speech_settings/speechHandler.js": {
      speakMessage: async (message: string) => {
        spokenMessages.push(message);
      },
      loadSavedSpeechSpeed: () => {},
      registerSpeechCommands: () => {},
      increaseSpeechSpeed: () => {},
      decreaseSpeechSpeed: () => {},
    },
    "Core/Summarizer/summaryGenerator.js": {
      registerSummarizerCommands: () => {},
    },
    "Core/program_settings/guide_settings/hotkeyGuide.js": {
      registerHotkeyGuideCommand: () => {},
    },
    "program_features/ChatBot/Chat_Tutor.js": {
      registerChatCommands: (context: any) => {
        context.subscriptions.push(
          vscode.commands.registerCommand("echocode.openChat", async () => {}),
        );
        return chatProvider;
      },
    },
    "navigation_features/navigationHandler.js": {
      registerMoveCursor: () => {},
    },
    "navigation_features/whereAmI.js": {
      registerWhereAmICommand: () => {},
    },
    "program_features/Folder_File_Creator/FileCreator.js": {
      registerFileCreatorCommand: () => {},
    },
    "program_features/Folder_File_Creator/FolderCreator.js": {
      registerFolderCreatorCommand: () => {},
    },
    "navigation_features/Folder_File_Navigator/file_navigator.js": {
      registerFileNavigatorCommand: () => {},
    },
    "navigation_features/Folder_File_Navigator/folder_navigator.js": {
      initializeFolderList: () => {
        initializeFolderCalls.push(1);
      },
      registerFolderNavigatorCommands: () => {},
    },
    "program_features/WhatIsThis/WhatIsThis": {
      registerReadCurrentLineCommand: () => {},
    },
    "program_features/WhatIsThis/DescribeThis.js": {
      registerDescribeCurrentLineCommand: () => {},
    },
    "program_features/WhatIsThis/CharacterReadOut.js": {
      registerCharacterReadOutCommand: () => {},
    },
    "program_features/C++_Error_Parser/CPP_Error_Parser.js": {
      compileCurrentCppFile: () => {},
    },
    "program_features/FileConnector/File_Connector.js": {
      connectFile: () => {},
      handleCopyFileNameCommand: () => {},
      handlePasteImportCommand: () => {},
      registerFileConnectorCommands: () => {},
    },
    "program_features/Annotations_BigO/bigOAnalysis.js": {
      registerBigOCommand: () => {},
    },
    "program_features/Annotations_BigO/annotations.js": {
      registerAnnotationCommands: () => {},
    },
    "program_features/Assignment_Tracker/assignmentTracker.js": {
      registerAssignmentTrackerCommands: () => {},
    },
  };

  return {
    stubs,
    state: {
      chatProvider,
      spokenMessages,
      startRecordingCalls,
      selectMicrophoneCalls,
      refreshCalls,
      buildRegistryCalls,
      dependencyEnsures,
      announceCalls,
      initializeFolderCalls,
      stopCalls,
      voiceCommands,
    },
  };
}

suite("EchoCode – Root Extension Integration", () => {
  test("activate registers the root extension command set", async () => {
    const harness = createVscodeHarness();
    const { stubs, state } = createExtensionStubs({ isRecording: false });
    const module = loadRootExtension(stubs);
    const context = vscode.__createMockContext();

    try {
      await module.extension.activate(context);

      const commands = Array.from(harness.commandRegistry.keys());
      const expected = [
        "echocode.toggleMode",
        "echocode.switchToStudentMode",
        "echocode.switchToDevMode",
        "echocode._voiceStart",
        "echocode._voiceStop",
        "echocode.selectMicrophone",
        "echocode.voiceCode",
        "echocode.voiceCommand",
        "echocode.voiceChat",
        "echocode.cycleVoiceMode",
        "echocode.toggleVoice",
        "echocode.compileAndParseCpp",
        "echocode.checkPythonErrors",
        "echocode.setGuidanceLevel",
        "echocode.cycleGuidanceLevel",
      ];

      for (const command of expected) {
        assert.ok(
          commands.includes(command),
          `${command} should be registered`,
        );
      }

      assert.equal(state.dependencyEnsures.length, 1);
      assert.equal(state.buildRegistryCalls.length, 1);
      assert.equal(state.initializeFolderCalls.length, 1);
      assert.deepEqual(state.announceCalls, ["student"]);
      assert.ok(
        harness.outputLines.some((line) =>
          line.includes("[EchoCode] Activated"),
        ),
      );
    } finally {
      module.restore();
      harness.restore();
    }
  });

  test("cycleVoiceMode rotates through code, command, and chat labels", async () => {
    const harness = createVscodeHarness();
    const { stubs, state } = createExtensionStubs({ isRecording: false });
    const module = loadRootExtension(stubs);
    const context = vscode.__createMockContext();

    try {
      await module.extension.activate(context);

      await harness.commandRegistry.get("echocode.cycleVoiceMode")?.();
      await harness.commandRegistry.get("echocode.cycleVoiceMode")?.();
      await harness.commandRegistry.get("echocode.cycleVoiceMode")?.();

      assert.deepEqual(harness.infoMessages.slice(-3), [
        "EchoCode Voice Mode: Code Generation",
        "EchoCode Voice Mode: Command",
        "EchoCode Voice Mode: Chat Tutor",
      ]);
      assert.deepEqual(state.spokenMessages.slice(-3), [
        "Voice mode set to Code Generation.",
        "Voice mode set to Command.",
        "Voice mode set to Chat Tutor.",
      ]);
    } finally {
      module.restore();
      harness.restore();
    }
  });

  test("toggleVoice starts recording in idle mode", async () => {
    const harness = createVscodeHarness();
    const { stubs, state } = createExtensionStubs({ isRecording: false });
    const module = loadRootExtension(stubs);
    const context = vscode.__createMockContext();

    try {
      await module.extension.activate(context);

      await harness.commandRegistry.get("echocode.toggleVoice")?.();

      assert.deepEqual(state.chatProvider.recordingStates, [true]);
      assert.deepEqual(state.spokenMessages.slice(-1), ["Listening"]);
      assert.equal(state.startRecordingCalls.length, 1);
    } finally {
      module.restore();
      harness.restore();
    }
  });

  test("toggleVoice falls back to chat when voice routing does not handle the transcript", async () => {
    const harness = createVscodeHarness();
    const { stubs, state } = createExtensionStubs({
      isRecording: true,
      stopText: "Explain this code",
      voiceHandled: false,
    });
    const module = loadRootExtension(stubs);
    const context = vscode.__createMockContext();

    try {
      await module.extension.activate(context);

      await harness.commandRegistry.get("echocode.toggleVoice")?.();

      assert.deepEqual(state.chatProvider.recordingStates, [false]);
      assert.ok(state.spokenMessages.includes("Processing"));
      assert.equal(state.stopCalls.length, 1);
      assert.deepEqual(state.voiceCommands, ["Explain this code"]);
      assert.deepEqual(state.chatProvider.handledMessages, [
        "Explain this code",
      ]);
    } finally {
      module.restore();
      harness.restore();
    }
  });
});
