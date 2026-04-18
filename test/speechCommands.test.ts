import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test, suiteSetup } from "mocha";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";
const vscode: any = VS;

// @ts-ignore
import * as ext from "../out/extension.js";

suite("EchoCode – Speech Commands", () => {
  suiteSetup(async () => {
    const ctx = vscode.__createMockContext();
    await ext.activate(ctx);
  });

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

  test("echocode.increaseSpeechSpeed shows a test-mode message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.increaseSpeechSpeed");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from increaseSpeechSpeed");
      assert.ok(
        msg!.includes("Increase speech speed") || msg!.includes("increase speech speed"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.decreaseSpeechSpeed shows a test-mode message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.decreaseSpeechSpeed");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from decreaseSpeechSpeed");
      assert.ok(
        msg!.includes("Decrease speech speed") || msg!.includes("decrease speech speed"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.stopSpeech shows a test-mode message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.stopSpeech");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from stopSpeech");
      assert.ok(
        msg!.toLowerCase().includes("stop speech") ||
          msg!.toLowerCase().includes("stopping"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });
});