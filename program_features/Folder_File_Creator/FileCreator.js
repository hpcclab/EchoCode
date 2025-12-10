const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");
const {
  getCurrentFolder,
} = require("../../navigation_features/Folder_File_Navigator/folder_navigator");

/**
 * Creates a new file in the currently selected folder.
 */
async function createFile() {
  const currentFolder = getCurrentFolder();

  if (!currentFolder) {
    vscode.window.showErrorMessage("No folder selected to create a file.");
    await speakMessage("No folder selected to create a file.");
    return;
  }

  // Announce the file name prompt
  await speakMessage("Enter file name.");

  // Prompt the user for the file name
  const fileName = await vscode.window.showInputBox({
    prompt: "Enter the name of the new file (e.g., newFile.js):",
  });

  if (!fileName) {
    vscode.window.showInformationMessage("File creation canceled.");
    await speakMessage("File creation canceled.");
    return;
  }

  const filePath = path.join(currentFolder, fileName);

  // Check if the file already exists
  if (fs.existsSync(filePath)) {
    vscode.window.showErrorMessage(`File "${fileName}" already exists.`);
    await speakMessage(`File "${fileName}" already exists.`);
    return;
  }

  // Create the file
  fs.writeFileSync(filePath, "", "utf8");

  // Open the file in the editor
  const document = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(document);

  // Announce the file creation
  vscode.window.showInformationMessage(`File "${fileName}" has been created.`);
  await speakMessage(`File "${fileName}" has been created.`);
}

/**
 * Registers the command to create a file.
 */
function registerFileCreatorCommand(context) {
  const createFileCommand = vscode.commands.registerCommand(
    "echocode.createFile",
    createFile
  );

  context.subscriptions.push(createFileCommand);
}

module.exports = { registerFileCreatorCommand };
