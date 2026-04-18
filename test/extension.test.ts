import "./helpers/vscodeMock.js"; // must be first
import { strict as assert } from "assert";
import { suite, test, suiteSetup } from "mocha";

// Import the mock vscode shim
// @ts-ignore
import * as VS from "./helpers/vscodeMock.js";
const vscode: any = VS;

// Import the compiled extension (from out/)
// @ts-ignore
import * as ext from "../out/extension.js";

suite("EchoCode – Activation & Command Registration", () => {
  // Activate once before all tests in this suite
  suiteSetup(async () => {
    const ctx = vscode.__createMockContext();
    await ext.activate(ctx);
  });

  test("activates the extension in test mode", async () => {
    // If we got here without throwing in suiteSetup, activation worked
    assert.ok(true, "Extension activated without throwing");
  });

  test("registers helloWorld command via mock", async () => {
    const cmds = await vscode.commands.getCommands();
    console.log("Registered commands:", cmds);
    assert.ok(
      cmds.includes("echolint.helloWorld"),
      "echolint.helloWorld should be registered"
    );
  });

  test("executes helloWorld command without throwing", async () => {
    await assert.doesNotReject(() =>
      vscode.commands.executeCommand("echolint.helloWorld")
    );
  });

  // NEXT: when extension.ts registers more commands, add a test like this:
  test("registers core EchoCode commands", async () => {
    const cmds = await vscode.commands.getCommands();

    const expected = [
      "echocode.readCurrentLine",
      "echocode.describeCurrentLine",
      "echocode.increaseSpeechSpeed",
      "echocode.decreaseSpeechSpeed",
      "echocode.stopSpeech",
      "echocode.jumpToNextFunction",
      "echocode.jumpToPreviousFunction",
      "echocode.summarizeClass",
      "echocode.summarizeFunction",
      "echocode.summarizeProgram",
      "echocode.whereAmI",

      //Group 2: Annotations + Big-O
      "echocode.annotate",
      "echocode.readAllAnnotations",
      "echocode.speakNextAnnotation",
      "code-tutor.analyzeBigO",
      "code-tutor.iterateBigOQueue",
      "code-tutor.readEntireBigOQueue", 

      // Group 3: Assignment Tracker
      "echocode.loadAssignmentFile",
      "echocode.rescanUserCode",
      "echocode.readNextSequentialTask",
      "echocode.readNextTask",
      "echocode.markTaskComplete", 

      // Group 4: File / Folder / Import / Character Reader
      "echocode.createFile",
      "echocode.createFolder",
      "echocode.navigateToNextFile",
      "echocode.initializeFolderList",
      "echocode.moveToNextFolder",
      "echocode.moveToPreviousFolder",
      "echocode.navigateFilesInCurrentFolder",
      "echocode.toggleCharacterReadOut",
      "echocode.copyFileNameForImport",
      "echocode.pasteImportAtCursor",

      // Group 5: Hotkey Guide / Errors / Chat / Voice Input
      "echocode.readHotkeyGuide",
      "echocode.readErrors",
      "echocode.openChat",
      "echocode.startVoiceInput",
            
    ];

    for (const id of expected) {
      assert.ok(cmds.includes(id), `${id} should be registered`);
    }
  });
});