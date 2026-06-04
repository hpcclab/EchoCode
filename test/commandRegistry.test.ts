import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";
// @ts-ignore
import { registerExtensionCommands } from "../out/commandRegistry.js";

const vscode: any = VS;

type RegisteredCommands = Map<string, (...args: any[]) => any>;

function setupLocalRegistry() {
  const registeredCommands: RegisteredCommands = new Map();
  const originalRegister = vscode.commands.registerCommand;

  vscode.commands.registerCommand = (
    id: string,
    handler: (...args: any[]) => any,
  ) => {
    registeredCommands.set(id, handler);
    return { dispose: () => registeredCommands.delete(id) };
  };

  const context = vscode.__createMockContext();

  return {
    context,
    registeredCommands,
    restore: () => {
      vscode.commands.registerCommand = originalRegister;
    },
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

suite("EchoCode – Command Registry", () => {
  test("readCurrentLine reports a missing active editor", async () => {
    const registry = setupLocalRegistry();
    const messages = captureWindowMessages();
    const originalEditor = vscode.window.activeTextEditor;

    try {
      vscode.window.activeTextEditor = undefined;
      registerExtensionCommands(registry.context, true);

      await registry.registeredCommands.get("echocode.readCurrentLine")?.();

      assert.deepEqual(messages.errorMessages, ["No active editor"]);
      assert.equal(messages.infoMessages.length, 0);
    } finally {
      vscode.window.activeTextEditor = originalEditor;
      messages.restore();
      registry.restore();
    }
  });

  test("non-test static commands use the live message", async () => {
    const registry = setupLocalRegistry();
    const messages = captureWindowMessages();

    try {
      registerExtensionCommands(registry.context, false);

      await registry.registeredCommands.get("echocode.increaseSpeechSpeed")?.();

      assert.deepEqual(messages.infoMessages, ["Increasing speech speed."]);
      assert.equal(messages.errorMessages.length, 0);
    } finally {
      messages.restore();
      registry.restore();
    }
  });

  test("non-test navigation updates the selection with VS Code types", async () => {
    const registry = setupLocalRegistry();
    const messages = captureWindowMessages();
    const originalEditor = vscode.window.activeTextEditor;
    const editor = {
      selection: { active: { line: 0 } },
      document: {
        lineCount: 3,
        lineAt: (line: number) => ({
          text: ["print('start')", "def target(): pass", "print('end')"][line],
        }),
      },
    };

    try {
      vscode.window.activeTextEditor = editor;
      registerExtensionCommands(registry.context, false);

      await registry.registeredCommands.get("echocode.jumpToNextFunction")?.();

      assert.equal(editor.selection.active.line, 1);
      assert.ok(editor.selection instanceof vscode.Selection);
      assert.equal(messages.infoMessages[0], "Navigated to def target(): pass");
    } finally {
      vscode.window.activeTextEditor = originalEditor;
      messages.restore();
      registry.restore();
    }
  });

  test("jumpToNextFunction reports when no function is found", async () => {
    const registry = setupLocalRegistry();
    const messages = captureWindowMessages();
    const originalEditor = vscode.window.activeTextEditor;
    const editor = {
      selection: { active: { line: 0 } },
      document: {
        lineCount: 2,
        lineAt: (line: number) => ({
          text: ["print('a')", "print('b')"][line],
        }),
      },
    };

    try {
      vscode.window.activeTextEditor = editor;
      registerExtensionCommands(registry.context, true);

      await registry.registeredCommands.get("echocode.jumpToNextFunction")?.();

      assert.equal(
        messages.infoMessages[0],
        "[Test Navigation] No next function",
      );
    } finally {
      vscode.window.activeTextEditor = originalEditor;
      messages.restore();
      registry.restore();
    }
  });
});
