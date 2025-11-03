const vscode = require("vscode");
const {
  speakMessage,
} = require("../../program_settings/speech_settings/speechHandler");
const fs = require("fs");
const path = require("path");

let currentFileIndex = 0;

/**
 * Navigates to the next file in the workspace and announces its name.
 */
async function navigateToNextFile() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    await speakMessage("No workspace folder is open.");
    return;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;

  // Refresh the list of files in the workspace
  const files = await vscode.workspace.findFiles("**/*", "**/node_modules/**");

  if (files.length === 0) {
    vscode.window.showErrorMessage("No files found in the workspace.");
    await speakMessage("No files found in the workspace.");
    return;
  }

  // Navigate to the next file
  currentFileIndex = (currentFileIndex + 1) % files.length;
  const nextFile = files[currentFileIndex];

  // Open the file in the editor
  const document = await vscode.workspace.openTextDocument(nextFile);
  await vscode.window.showTextDocument(document);

  // Announce the file name
  const fileName = nextFile.path.split("/").pop();
  vscode.window.showInformationMessage(`Navigated to file: ${fileName}`);
  await speakMessage(`Navigated to file: ${fileName}`);
}

/**
 * Watches the workspace for new files and updates the file index.
 */
function watchWorkspaceForFileChanges() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const workspacePath = workspaceFolders[0].uri.fsPath;

  fs.watch(workspacePath, { recursive: true }, async (eventType, filename) => {
    if (eventType === "rename" && filename) {
      const filePath = path.join(workspacePath, filename);
      if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
        vscode.window.showInformationMessage(`New file detected: ${filename}`);
        await speakMessage(`New file detected: ${filename}`);
        // Optionally refresh the file index here
      }
    }
  });
}

/**
 * Registers the command to navigate to the next file and starts the file watcher.
 */
function registerFileNavigatorCommand(context) {
  const navigateCommand = vscode.commands.registerCommand(
    "echocode.navigateToNextFile",
    navigateToNextFile
  );

  context.subscriptions.push(navigateCommand);

  // Start watching for file changes
  watchWorkspaceForFileChanges();
}

module.exports = { registerFileNavigatorCommand };
