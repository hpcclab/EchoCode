const vscode = require("vscode");
const {
  speakMessage,
} = require("../../program_settings/speech_settings/speechHandler");
const fs = require("fs");
const path = require("path");

/**
 * Creates a new folder in the workspace and announces its creation.
 */
async function createFolder() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    await speakMessage("No workspace folder is open.");
    return;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;

  // Speak the prompt before showing the input box
  await speakMessage("What would you like to name the new folder?");

  // Prompt the user for the folder name
  const folderName = await vscode.window.showInputBox({
    prompt: "Enter the name of the new folder:",
  });

  if (!folderName) {
    vscode.window.showInformationMessage("Folder creation canceled.");
    await speakMessage("Folder creation canceled.");
    return;
  }

  const folderPath = path.join(workspacePath, folderName);

  // Check if the folder already exists
  if (fs.existsSync(folderPath)) {
    vscode.window.showErrorMessage(`Folder "${folderName}" already exists.`);
    await speakMessage(`Folder "${folderName}" already exists.`);
    return;
  }

  // Create the folder
  fs.mkdirSync(folderPath);

  // Announce the folder creation
  vscode.window.showInformationMessage(
    `Folder "${folderName}" has been created.`
  );
  await speakMessage(`Folder "${folderName}" has been created.`);
}

/**
 * Registers the command to create a folder.
 */
function registerFolderCreatorCommand(context) {
  const createFolderCommand = vscode.commands.registerCommand(
    "echocode.createFolder",
    createFolder
  );

  context.subscriptions.push(createFolderCommand);
}

module.exports = { registerFolderCreatorCommand };
