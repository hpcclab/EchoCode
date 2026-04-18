import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test, suiteSetup } from "mocha";

// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";
const vscode: any = VS;

// @ts-ignore
import * as ext from "../out/extension.js";

suite("EchoCode – Assignment Tracker Commands", () => {
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

  test("echocode.loadAssignmentFile shows a load-assignment message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.loadAssignmentFile");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from loadAssignmentFile");
      assert.ok(
        msg!.toLowerCase().includes("load assignment file") ||
          msg!.toLowerCase().includes("loading assignment file"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.rescanUserCode shows a rescan message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.rescanUserCode");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from rescanUserCode");
      assert.ok(
        msg!.toLowerCase().includes("rescan user code") ||
          msg!.toLowerCase().includes("rescanning code for completed tasks"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.readNextSequentialTask shows a next-sequential-task message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.readNextSequentialTask");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from readNextSequentialTask");
      assert.ok(
        msg!.toLowerCase().includes("next sequential task") ||
          msg!.toLowerCase().includes("reading next sequential task"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.readNextTask shows a next-task message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.readNextTask");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from readNextTask");
      assert.ok(
        msg!.toLowerCase().includes("read next task") ||
          msg!.toLowerCase().includes("reading next task"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });

  test("echocode.markTaskComplete shows a mark-complete message", async () => {
    const cap = captureLastInfoMessage();
    try {
      await vscode.commands.executeCommand("echocode.markTaskComplete");
      const msg = cap.get();
      assert.ok(msg, "Expected a message from markTaskComplete");
      assert.ok(
        msg!.toLowerCase().includes("mark task complete") ||
          msg!.toLowerCase().includes("marking task as complete"),
        `Unexpected message: ${msg}`
      );
    } finally {
      cap.restore();
    }
  });
});