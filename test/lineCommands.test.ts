import "./helpers/vscodeMock.js"; // ensure mock is loaded first
import { strict as assert } from "assert";
import { suite, test, suiteSetup } from "mocha";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";
const vscode: any = VS;

// Import compiled extension so commands are registered
// @ts-ignore
import * as ext from "../out/extension.js";

suite("EchoCode – Line Commands", () => {
  suiteSetup(async () => {
    const ctx = vscode.__createMockContext();
    await ext.activate(ctx);
  });

  test("echocode.readCurrentLine reads the correct line text", async () => {
    // Arrange: fake document with 3 lines
    const lines = ["first line", "second line", "third line"];

    // Minimal mock editor that satisfies what extension.ts uses:
    // editor.selection.active.line
    // editor.document.lineAt(line).text
    const mockEditor = {
      selection: {
        active: { line: 1 }, // line index 1 -> "second line"
      },
      document: {
        lineAt: (line: number) => ({ text: lines[line] }),
      },
    };

    // Inject into mocked vscode.window
    vscode.window.activeTextEditor = mockEditor;

    // Capture what showInformationMessage is called with
    let lastMessage: string | undefined;
    const originalShowInfo = vscode.window.showInformationMessage;

    vscode.window.showInformationMessage = (msg: string) => {
      lastMessage = msg;
      // keep behavior promise-like
      return Promise.resolve(undefined);
    };

    try {
      // Act
      await vscode.commands.executeCommand("echocode.readCurrentLine");

      // Assert
      // In test mode, the command prefixes with "[Test Line]"
      assert.ok(lastMessage, "showInformationMessage should have been called");
      assert.ok(
        lastMessage!.includes("second line"),
        `Expected message to include "second line", got: ${lastMessage}`
      );
    } finally {
      // Restore original function so other tests are not affected
      vscode.window.showInformationMessage = originalShowInfo;
    }
  });

  test("echocode.describeCurrentLine uses current line text in message", async () => {
    const lines = ["alpha", "beta", "gamma"];

    const mockEditor = {
      selection: {
        active: { line: 2 }, // index 2 -> "gamma"
      },
      document: {
        lineAt: (line: number) => ({ text: lines[line] }),
      },
    };

    vscode.window.activeTextEditor = mockEditor;

    let lastMessage: string | undefined;
    const originalShowInfo = vscode.window.showInformationMessage;

    vscode.window.showInformationMessage = (msg: string) => {
      lastMessage = msg;
      return Promise.resolve(undefined);
    };

    try {
      await vscode.commands.executeCommand("echocode.describeCurrentLine");

      assert.ok(lastMessage, "showInformationMessage should have been called");
      assert.ok(
        lastMessage!.includes("gamma"),
        `Expected message to include "gamma", got: ${lastMessage}`
      );
    } finally {
      vscode.window.showInformationMessage = originalShowInfo;
    }
  });
});