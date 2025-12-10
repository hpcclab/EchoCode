const vscode = require("vscode");
const { runPylint } = require("./pylintHandler");
const { speakMessage } = require("../../Core/program_settings/speech_settings/speechHandler");

let outputChannel;
let isRunning = false;

function initializeErrorHandling(channel) {
  outputChannel = channel;
}

async function handlePythonErrorsOnSave(filePath) {
  if (isRunning) return;
  isRunning = true;

  try {
    const errors = await runPylint(filePath, outputChannel);
    if (errors.length === 0) {
      vscode.window.showInformationMessage("✅ No issues detected!");
      return;
    }

    outputChannel.appendLine(`📢 Found ${errors.length} Pylint error(s):`);
    for (const error of errors) {
      const message = `Line ${error.line}: ${error.message}`;
      outputChannel.appendLine(message);
      if (error.critical) {
        await speakMessage(message);
      }
    }

    outputChannel.show();
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to run Pylint: ${err}`);
  } finally {
    isRunning = false;
  }
}

function registerErrorHandlingCommands(context) {
  // Command to read errors aloud
  const readErrors = vscode.commands.registerCommand(
    "echocode.readErrors",
    () => {
      outputChannel.appendLine("echocode.readErrors command triggered");
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "python") {
        handlePythonErrorsOnSave(editor.document.uri.fsPath);
      } else {
        vscode.window.showWarningMessage(
          "Please open a Python file to read errors."
        );
      }
    }
  );

  // Automatically trigger on save
  const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.languageId === "python") {
      handlePythonErrorsOnSave(document.uri.fsPath);
    }
  });

  context.subscriptions.push(readErrors, saveListener);
}


module.exports = {
  initializeErrorHandling,
  handlePythonErrorsOnSave,
  registerErrorHandlingCommands,
};