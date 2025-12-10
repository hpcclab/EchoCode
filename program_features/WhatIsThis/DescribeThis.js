const vscode = require("vscode");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");
const {
  analyzeAI,
} = require("../../Core/program_settings/program_settings/AIrequest");

/**
 * Describes the content of the current line using AI and speaks it aloud.
 */
async function describeCurrentLine() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage("No active editor found.");
    return;
  }

  const cursorPosition = editor.selection.active;
  const currentLine = editor.document.lineAt(cursorPosition.line);

  const lineText = currentLine.text.trim();

  if (lineText === "") {
    vscode.window.showInformationMessage("The current line is empty.");
    await speakMessage("The current line is empty.");
    return;
  }

  vscode.window.showInformationMessage(`Analyzing line: ${lineText}`);
  await speakMessage("Analyzing the current line...");

  try {
    // Use AI to analyze the current line
    const instructionPrompt =
      "Describe what this line of code does in one concise sentence.";
    const aiResponse = await analyzeAI(lineText, instructionPrompt);

    if (aiResponse) {
      vscode.window.showInformationMessage(`AI Description: ${aiResponse}`);
      await speakMessage(aiResponse);
    } else {
      vscode.window.showInformationMessage(
        "The AI could not generate a description."
      );
      await speakMessage("The AI could not generate a description.");
    }
  } catch (error) {
    console.error("Error analyzing line:", error);
    vscode.window.showErrorMessage(
      "An error occurred while analyzing the line."
    );
    await speakMessage("An error occurred while analyzing the line.");
  }
}

/**
 * Registers the command to describe the current line.
 */
function registerDescribeCurrentLineCommand(context) {
  const describeCurrentLineCommand = vscode.commands.registerCommand(
    "echocode.describeCurrentLine",
    async () => {
      await describeCurrentLine();
    }
  );

  context.subscriptions.push(describeCurrentLineCommand);
}

module.exports = { registerDescribeCurrentLineCommand };
