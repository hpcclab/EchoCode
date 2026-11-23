const vscode = require("vscode");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");
const path = require("path");
const { getCurrentFolder } = require("./folder_navigator");

// Hidden files and folders (.git, .venv, .DS_Store), dependencies, and Python caches
// are never worth stepping through or announcing.
const SKIPPED_FILES_GLOB =
  "{**/node_modules/**,**/__pycache__/**,**/.*,**/.*/**}";

function isSkippedPath(relativePath) {
  return relativePath
    .split(/[\\/]/)
    .some(
      (segment) =>
        segment.startsWith(".") ||
        segment === "node_modules" ||
        segment === "__pycache__",
    );
}

// A folder's own files come first, then each subfolder's, alphabetically
function compareFilePaths(a, b) {
  const options = { numeric: true, sensitivity: "base" };
  return (
    path.dirname(a).localeCompare(path.dirname(b), undefined, options) ||
    path.basename(a).localeCompare(path.basename(b), undefined, options)
  );
}

/**
 * Opens the file after the current one in the folder picked with the folder
 * navigator (the whole project until another folder is picked) and announces it.
 */
async function navigateToNextFile() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    await speakMessage("No workspace folder is open.");
    return;
  }

  const folder = getCurrentFolder() || workspaceFolders[0].uri.fsPath;

  // Refresh the list every time so new and deleted files are picked up
  const files = (
    await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/*"),
      SKIPPED_FILES_GLOB,
    )
  )
    .map((uri) => uri.fsPath)
    .sort(compareFilePaths);

  if (files.length === 0) {
    vscode.window.showErrorMessage("No files found in this folder.");
    await speakMessage("No files found in this folder.");
    return;
  }

  // Start after the file that is open now; if it isn't in this folder, indexOf is -1
  // and we start at the first file
  const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  const startIndex = files.indexOf(activePath) + 1;

  for (let step = 0; step < files.length; step++) {
    const nextFile = files[(startIndex + step) % files.length];

    try {
      const document = await vscode.workspace.openTextDocument(nextFile);
      await vscode.window.showTextDocument(document);
    } catch {
      // Images, audio and other binary or very large files can't be opened as text
      continue;
    }

    const fileName = path.basename(nextFile);
    vscode.window.showInformationMessage(`Navigated to file: ${fileName}`);
    await speakMessage(`Navigated to file: ${fileName}`);
    return;
  }

  vscode.window.showErrorMessage("No text files found in this folder.");
  await speakMessage("No text files found in this folder.");
}

/**
 * Announces files that appear in the workspace. Files that are already open are
 * skipped: the user just created them (EchoCode's file creator announces its own).
 */
function watchWorkspaceForFileChanges(context) {
  // Only creations; VS Code's watcher reports a save as a change, not a new file
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/*",
    false,
    true,
    true,
  );

  watcher.onDidCreate(async (uri) => {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    if (isSkippedPath(relativePath)) return;

    const isOpen = vscode.workspace.textDocuments.some(
      (document) => document.uri.fsPath === uri.fsPath,
    );
    if (isOpen) return;

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (!(stat.type & vscode.FileType.File)) return;
    } catch {
      return; // Already gone again (temp file)
    }

    vscode.window.showInformationMessage(`New file detected: ${relativePath}`);
    await speakMessage(`New file detected: ${relativePath}`);
  });

  context.subscriptions.push(watcher);
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
  watchWorkspaceForFileChanges(context);
}

module.exports = { registerFileNavigatorCommand };
