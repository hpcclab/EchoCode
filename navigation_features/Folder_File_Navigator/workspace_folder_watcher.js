const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

/**
 * Watches the workspace root for new folders and reinitializes the folder list if a new folder is created.
 * @param {Function} initializeFolderList - Function to reinitialize the folder list.
 */
function watchWorkspaceForNewFolders(initializeFolderList) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }
  const projectFolder = workspaceFolders[0].uri.fsPath;

  fs.watch(projectFolder, { persistent: true }, (eventType, filename) => {
    if (eventType === "rename" && filename) {
      const fullPath = path.join(projectFolder, filename);
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
        vscode.window.showInformationMessage(
          `New folder detected: ${filename}. Updating folder list.`
        );
        speakMessage(`New folder detected: ${filename}. Updating folder list.`);
        initializeFolderList();
      }
    }
  });
}

module.exports = { watchWorkspaceForNewFolders };
