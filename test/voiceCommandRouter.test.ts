import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";

const vscode: any = VS;
const fs = require("fs") as typeof import("fs");
const nodeRequire = require;
const repoRoot = process.cwd();

const routerModulePath = nodeRequire.resolve(
  path.join(repoRoot, "program_features/Voice/voiceCommandRouter.js"),
);
const dependencyPaths = {
  externalIntentRouter: nodeRequire.resolve(
    path.join(
      repoRoot,
      "Core/program_settings/program_settings/ExternalIntentRouter.js",
    ),
  ),
  aiRequest: nodeRequire.resolve(
    path.join(repoRoot, "Core/program_settings/program_settings/AIrequest.js"),
  ),
  mode: nodeRequire.resolve(
    path.join(repoRoot, "Core/program_settings/mode.js"),
  ),
  guard: nodeRequire.resolve(
    path.join(repoRoot, "Core/program_settings/guard.js"),
  ),
  speech: nodeRequire.resolve(
    path.join(
      repoRoot,
      "Core/program_settings/speech_settings/speechHandler.js",
    ),
  ),
};

function loadVoiceRouter(overrides: Record<string, any> = {}) {
  const savedEntries = new Map<string, any>();
  const mockedModules = {
    [dependencyPaths.externalIntentRouter]: {
      matchExternalCommand: () => null,
      ...(overrides.externalIntentRouter || {}),
    },
    [dependencyPaths.aiRequest]: {
      generateCodeFromVoice: async () => null,
      ...(overrides.aiRequest || {}),
    },
    [dependencyPaths.mode]: {
      getMode: () => "dev",
      ...(overrides.mode || {}),
    },
    [dependencyPaths.guard]: {
      STUDENT_LOCKED_COMMANDS: new Set(),
      ...(overrides.guard || {}),
    },
    [dependencyPaths.speech]: {
      speakMessage: async () => {},
      ...(overrides.speech || {}),
    },
  };

  for (const [modulePath, moduleExports] of Object.entries(mockedModules)) {
    savedEntries.set(modulePath, nodeRequire.cache[modulePath]);
    (nodeRequire.cache as any)[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports: moduleExports,
    };
  }

  const previousRouter = nodeRequire.cache[routerModulePath];
  delete nodeRequire.cache[routerModulePath];

  return {
    router: nodeRequire(routerModulePath),
    restore: () => {
      delete nodeRequire.cache[routerModulePath];
      if (previousRouter) {
        nodeRequire.cache[routerModulePath] = previousRouter;
      }

      for (const [modulePath, previousEntry] of savedEntries.entries()) {
        if (previousEntry) {
          nodeRequire.cache[modulePath] = previousEntry;
        } else {
          delete nodeRequire.cache[modulePath];
        }
      }
    },
  };
}

function createOutputChannel() {
  const lines: string[] = [];
  return {
    lines,
    appendLine: (text: string) => lines.push(text),
  };
}

function captureWindowMessages() {
  const infoMessages: string[] = [];
  const errorMessages: string[] = [];
  const originalInfo = vscode.window.showInformationMessage;
  const originalError = vscode.window.showErrorMessage;

  vscode.window.showInformationMessage = (message: string) => {
    infoMessages.push(message);
    return Promise.resolve(undefined);
  };

  vscode.window.showErrorMessage = (message: string) => {
    errorMessages.push(message);
    return Promise.resolve(undefined);
  };

  return {
    infoMessages,
    errorMessages,
    restore: () => {
      vscode.window.showInformationMessage = originalInfo;
      vscode.window.showErrorMessage = originalError;
    },
  };
}

function captureCommandExecution() {
  const executed: string[] = [];
  const originalExecute = vscode.commands.executeCommand;

  vscode.commands.executeCommand = async (id: string) => {
    executed.push(id);
    return undefined;
  };

  return {
    executed,
    restore: () => {
      vscode.commands.executeCommand = originalExecute;
    },
  };
}

function stubVoiceCommands(
  commands: Array<{ id: string; keywords: string[] }>,
) {
  fs.readFileSync = (() =>
    JSON.stringify(commands)) as unknown as typeof fs.readFileSync;
}

suite("EchoCode – Voice Command Router", () => {
  test("maps friendly language names and falls back for unknown ids", () => {
    const { router, restore } = loadVoiceRouter();

    try {
      assert.equal(router.getFriendlyLanguageName("cpp"), "C++");
      assert.equal(
        router.getFriendlyLanguageName("unknown-lang"),
        "unknown-lang",
      );
    } finally {
      restore();
    }
  });

  test("ignores empty or no-speech transcripts", async () => {
    const { router, restore } = loadVoiceRouter();
    const outputChannel = createOutputChannel();

    try {
      const result = await router.tryExecuteVoiceCommand(
        "no speech detected from microphone",
        outputChannel,
      );

      assert.deepEqual(result, { handled: true });
      assert.ok(outputChannel.lines[0].includes("Ignored empty/error input"));
    } finally {
      restore();
    }
  });

  test("executes matching internal commands", async () => {
    const originalReadFileSync = fs.readFileSync;
    const outputChannel = createOutputChannel();
    const commands = captureCommandExecution();
    const { router, restore } = loadVoiceRouter();

    stubVoiceCommands([
      { id: "echocode.readCurrentLine", keywords: ["read current line"] },
    ]);

    try {
      const result = await router.tryExecuteVoiceCommand(
        "Please read current line",
        outputChannel,
      );

      assert.deepEqual(result, {
        handled: true,
        command: "echocode.readCurrentLine",
      });
      assert.deepEqual(commands.executed, ["echocode.readCurrentLine"]);
      assert.ok(
        outputChannel.lines.some((line) =>
          line.includes("Matched: echocode.readCurrentLine"),
        ),
      );
    } finally {
      fs.readFileSync = originalReadFileSync;
      commands.restore();
      restore();
    }
  });

  test("blocks locked internal commands in student mode", async () => {
    const originalReadFileSync = fs.readFileSync;
    const spokenMessages: string[] = [];
    const outputChannel = createOutputChannel();
    const commands = captureCommandExecution();
    const { router, restore } = loadVoiceRouter({
      mode: { getMode: () => "student" },
      guard: { STUDENT_LOCKED_COMMANDS: new Set(["echocode.locked"]) },
      speech: {
        speakMessage: async (message: string) => {
          spokenMessages.push(message);
        },
      },
    });

    stubVoiceCommands([{ id: "echocode.locked", keywords: ["danger"] }]);

    try {
      const result = await router.tryExecuteVoiceCommand(
        "danger",
        outputChannel,
      );

      assert.deepEqual(result, { handled: true });
      assert.deepEqual(spokenMessages, [
        "That command is disabled in student mode.",
      ]);
      assert.deepEqual(commands.executed, []);
    } finally {
      fs.readFileSync = originalReadFileSync;
      commands.restore();
      restore();
    }
  });

  test("executes matching external commands", async () => {
    const originalReadFileSync = fs.readFileSync;
    const outputChannel = createOutputChannel();
    const commands = captureCommandExecution();
    const messages = captureWindowMessages();
    const { router, restore } = loadVoiceRouter({
      externalIntentRouter: {
        matchExternalCommand: () => ({
          id: "echocode.external",
          title: "External Action",
        }),
      },
    });

    stubVoiceCommands([]);

    try {
      const result = await router.tryExecuteVoiceCommand(
        "run external action",
        outputChannel,
      );

      assert.deepEqual(result, {
        handled: true,
        command: "echocode.external",
      });
      assert.deepEqual(commands.executed, ["echocode.external"]);
      assert.deepEqual(messages.infoMessages, ["✅ External: External Action"]);
    } finally {
      fs.readFileSync = originalReadFileSync;
      messages.restore();
      commands.restore();
      restore();
    }
  });

  test("routes question-style prompts back to chat handling", async () => {
    const originalReadFileSync = fs.readFileSync;
    const outputChannel = createOutputChannel();
    const commands = captureCommandExecution();
    const { router, restore } = loadVoiceRouter();

    stubVoiceCommands([]);

    try {
      const result = await router.tryExecuteVoiceCommand(
        "What does this function do?",
        outputChannel,
      );

      assert.deepEqual(result, { handled: false });
      assert.deepEqual(commands.executed, []);
      assert.ok(
        outputChannel.lines.some((line) => line.includes("Detected Question")),
      );
    } finally {
      fs.readFileSync = originalReadFileSync;
      commands.restore();
      restore();
    }
  });

  test("generates code with editor context when no command matches", async () => {
    const originalReadFileSync = fs.readFileSync;
    const outputChannel = createOutputChannel();
    const messages = captureWindowMessages();
    const spokenMessages: string[] = [];
    const generateCalls: any[] = [];
    const insertedEdits: Array<{ line: number; text: string }> = [];
    const originalEditor = vscode.window.activeTextEditor;
    const editor = {
      selection: { active: { line: 5, character: 0 } },
      document: {
        languageId: "python",
        lineCount: 8,
        lineAt: (line: number) => ({
          text: line === 5 ? "    existing_call()" : `line-${line}`,
        }),
        getText: () => "surrounding context",
      },
      edit: async (
        callback: (editBuilder: {
          insert: (position: any, text: string) => void;
        }) => void,
      ) => {
        callback({
          insert: (position, text) => {
            insertedEdits.push({ line: position.line, text });
          },
        });
        return true;
      },
    };

    const { router, restore } = loadVoiceRouter({
      aiRequest: {
        generateCodeFromVoice: async (
          transcript: string,
          friendlyLanguage: string,
          indentation: string,
          contextCode: string,
        ) => {
          generateCalls.push({
            transcript,
            friendlyLanguage,
            indentation,
            contextCode,
          });
          return "print('generated')";
        },
      },
      speech: {
        speakMessage: async (message: string) => {
          spokenMessages.push(message);
        },
      },
    });

    stubVoiceCommands([]);
    vscode.window.activeTextEditor = editor;

    try {
      const result = await router.tryExecuteVoiceCommand(
        "create a print statement",
        outputChannel,
      );

      assert.deepEqual(result, { handled: true, command: "generateCode" });
      assert.deepEqual(generateCalls, [
        {
          transcript: "create a print statement",
          friendlyLanguage: "Python",
          indentation: "    ",
          contextCode: "surrounding context",
        },
      ]);
      assert.deepEqual(insertedEdits, [
        { line: 5, text: "print('generated')" },
      ]);
      assert.deepEqual(spokenMessages, [
        "Here is the code I generated: print('generated')",
      ]);
      assert.equal(
        messages.infoMessages[0],
        "EchoCode: Generating Python code...",
      );
    } finally {
      fs.readFileSync = originalReadFileSync;
      vscode.window.activeTextEditor = originalEditor;
      messages.restore();
      restore();
    }
  });

  test("reports generation failures without throwing", async () => {
    const originalReadFileSync = fs.readFileSync;
    const outputChannel = createOutputChannel();
    const messages = captureWindowMessages();
    const originalEditor = vscode.window.activeTextEditor;
    vscode.window.activeTextEditor = {
      selection: { active: { line: 0, character: 0 } },
      document: {
        languageId: "javascript",
        lineCount: 1,
        lineAt: () => ({ text: "const x = 1;" }),
        getText: () => "const x = 1;",
      },
      edit: async () => true,
    };

    const { router, restore } = loadVoiceRouter({
      aiRequest: {
        generateCodeFromVoice: async () => {
          throw new Error("generation offline");
        },
      },
    });

    stubVoiceCommands([]);

    try {
      const result = await router.tryExecuteVoiceCommand(
        "make code",
        outputChannel,
      );

      assert.deepEqual(result, { handled: false });
      assert.ok(
        outputChannel.lines.some((line) =>
          line.includes("Voice Generation Error"),
        ),
      );
      assert.deepEqual(messages.errorMessages, [
        "EchoCode Generation Fail: generation offline",
      ]);
    } finally {
      fs.readFileSync = originalReadFileSync;
      vscode.window.activeTextEditor = originalEditor;
      messages.restore();
      restore();
    }
  });
});
