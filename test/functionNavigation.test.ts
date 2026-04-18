import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test, suiteSetup } from "mocha";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";
const vscode: any = VS;

// @ts-ignore
import * as ext from "../out/extension.js";

suite("EchoCode – Function Navigation", () => {
  suiteSetup(async () => {
    const ctx = vscode.__createMockContext();
    await ext.activate(ctx);
  });

  function setupEditor(lines: string[], startLine: number) {
    const editor = {
      selection: {
        active: { line: startLine },
      },
      document: {
        lineAt: (i: number) => ({ text: lines[i] }),
        lineCount: lines.length,
      },
    };
    vscode.window.activeTextEditor = editor;
    return editor;
  }

  function captureLastInfoMessage() {
    let lastMessage: string | undefined;
    const originalShowInfo = vscode.window.showInformationMessage;
    vscode.window.showInformationMessage = (msg: string) => {
      lastMessage = msg;
      return Promise.resolve(undefined);
    };
    return {
      get: () => lastMessage,
      restore: () => {
        vscode.window.showInformationMessage = originalShowInfo;
      },
    };
  }

  test("jumpToNextFunction moves cursor to next def line", async () => {
    const lines = [
      "print('start')",
      "def first(): pass",
      "def second(): pass",
    ];
    const editor = setupEditor(lines, 0);
    const cap = captureLastInfoMessage();

    try {
      await vscode.commands.executeCommand("echocode.jumpToNextFunction");
      assert.equal(editor.selection.active.line, 1);
      assert.ok(cap.get()?.includes("first"));
    } finally {
      cap.restore();
    }
  });

  test("jumpToPreviousFunction moves cursor to previous def line", async () => {
    const lines = [
      "def first(): pass",
      "print('middle')",
      "def second(): pass",
    ];
    const editor = setupEditor(lines, 2);
    const cap = captureLastInfoMessage();

    try {
      await vscode.commands.executeCommand("echocode.jumpToPreviousFunction");
      assert.equal(editor.selection.active.line, 0);
      assert.ok(cap.get()?.includes("first"));
    } finally {
      cap.restore();
    }
  });
});