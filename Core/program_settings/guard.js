const vscode = require("vscode");
const { getMode } = require("./mode");
const { speakMessage } = require("./speech_settings/speechHandler");

// Commands that are DISABLED in Student Mode
const STUDENT_LOCKED_COMMANDS = new Set([
  // Chat / Voice (AI entry points)
  "echocode.openChat",
  "echocode.startVoiceInput",
  "echocode.voiceInput",

  // Summarizers
  "echocode.summarizeClass",
  "echocode.summarizeFunction",
  "echocode.summarizeProgram",


  

  // Big-O (LOCK in student mode)
  "code-tutor.analyzeBigO",
  "code-tutor.iterateBigOQueue",
  "code-tutor.readEntireBigOQueue",

  // “Describe this” (explanations = cheat risk)
  "echocode.describeCurrentLine",

  // File connector helpers (automation)
  "echocode.copyFileNameForImport",
  "echocode.pasteImportAtCursor",

  // Debugging / error parsers (can effectively “solve”)
  "echocode.compileAndParseCpp",
  "echocode.checkPythonErrors",

  // ✅ Assignment Tracker (LOCK in student mode)
  "echocode.loadAssignmentFile",
  "echocode.readNextTask",
  "echocode.markTaskComplete",
  "echocode.rescanUserCode",
"echocode.readNextSequentialTask",
]);

function isStudentMode() {
  return getMode() !== "dev";
}

function isAllowed(commandId) {
  if (!isStudentMode()) return true;
  return !STUDENT_LOCKED_COMMANDS.has(commandId);
}

/**
 * Wrap a command handler so it is blocked in Student Mode if commandId is locked.
 * Usage:
 *   vscode.commands.registerCommand("some.command", guard("some.command", () => {...}))
 */
function guard(commandId, handler) {
  return async (...args) => {
    if (!isAllowed(commandId)) {
      // visible popup (nice for sighted devs/testing)
      vscode.window.showWarningMessage(
        "EchoCode: This feature is locked in Student Mode."
      );

      // spoken feedback (nice for accessibility)
      try {
        // If your speakMessage expects (text, outputChannel), this still works:
        // it will receive undefined for outputChannel, which most implementations handle.
        await speakMessage("Error. This feature is currently locked.");
      } catch (e) {
        // don't crash the extension if speech fails
      }
      return;
    }

    return handler(...args);
  };
}

module.exports = {
  STUDENT_LOCKED_COMMANDS,
  isAllowed,
  guard,
};
