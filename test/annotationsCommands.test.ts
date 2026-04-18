import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test, suiteSetup } from "mocha";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";
const vscode: any = VS;

// @ts-ignore
import * as ext from "../out/extension.js";

suite("EchoCode - Annotation Commands", () => {
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

  test("echocode.annotate shows an annotation-related message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.annotate");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from echocode.annotate");
      // From extension.ts: "[Test] Toggle annotations" / "Toggling EchoCode annotations..."
      assert.ok(
        msg!.toLowerCase().includes("toggle annotations") ||
        msg!.toLowerCase().includes("toggling echocode annotations"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.readAllAnnotations shows a read-all message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.readAllAnnotations");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from echocode.readAllAnnotations");
      // From extension.ts: "[Test] Read all annotations" / "Reading all annotations aloud..."
      assert.ok(
        msg!.toLowerCase().includes("read all annotations") ||
        msg!.toLowerCase().includes("reading all annotations aloud"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.speakNextAnnotation shows a next-annotation message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.speakNextAnnotation");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from echocode.speakNextAnnotation");
      // From extension.ts: "[Test] Speak next annotation" / "Speaking next annotation..."
      assert.ok(
        msg!.toLowerCase().includes("speak next annotation") ||
        msg!.toLowerCase().includes("speaking next annotation"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });
});