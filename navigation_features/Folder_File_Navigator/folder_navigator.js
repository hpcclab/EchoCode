const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const {
  speakMessage,
  startSpeaking,
} = require("../../program_settings/speech_settings/speechHandler");
const { navigateToNextFile } = require("./file_navigator");

let folderList = []; // Array to store the project folder and subfolders
let currentFolderIndex = 0; // Tracks the current folder index

/**
 * Initializes the folder list with the project folder and its subfolders.
 */
async function initializeFolderList() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder is open.");
    await speakMessage("No workspace folder is open.");
    return;
  }

  // Use the first workspace folder as the project folder
  const projectFolder = workspaceFolders[0].uri.fsPath;

  try {
    // Get all subfolders in the project folder
    const subfolders = fs
      .readdirSync(projectFolder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(projectFolder, entry.name));

    console.log("Detected subfolders:", subfolders);

    // Populate the folder list with the project folder and its subfolders
    folderList = [projectFolder, ...subfolders];
    currentFolderIndex = 0;

    vscode.window.showInformationMessage(
      `Initialized folder list with ${folderList.length} folders.`
    );
    await speakMessage(
      `Initialized folder list with ${folderList.length} folders.`
    );
    console.log("Initialized folder list:", folderList);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to initialize folder list: ${error.message}`
    );
    await speakMessage(`Failed to initialize folder list: ${error.message}`);
    console.error("Error initializing folder list:", error);
  }
}

/**
 * Moves to the next folder in the folder list, prioritizes files in the folder, and announces the folder and first file.
 */
async function moveToNextFolder() {
  if (folderList.length === 0) {
    vscode.window.showErrorMessage("No folders available to navigate.");
    await speakMessage("No folders available to navigate.");
    return;
  }

  currentFolderIndex = (currentFolderIndex + 1) % folderList.length;
  const currentFolder = folderList[currentFolderIndex];
  const folderName = path.basename(currentFolder); // Extract only the folder name

  // Collapse all folders, then reveal and expand the new one
  await vscode.commands.executeCommand(
    "workbench.files.action.collapseExplorerFolders"
  );
  await vscode.commands.executeCommand(
    "revealInExplorer",
    vscode.Uri.file(currentFolder)
  );
  await vscode.commands.executeCommand("list.expand"); // This will expand the selected folder

  vscode.window.showInformationMessage(`Moved to folder: ${folderName}`);
  await speakMessage(`Moved to folder: ${folderName}`);

  // Get files in the current folder
  const files = fs
    .readdirSync(currentFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(currentFolder, entry.name));

  if (files.length > 0) {
    const firstFile = path.basename(files[0]); // Extract only the file name
    vscode.window.showInformationMessage(`First file in folder: ${firstFile}`);
    await speakMessage(`First file in folder: ${firstFile}`);
  } else {
    vscode.window.showInformationMessage(`Folder is empty: ${folderName}`);
    await speakMessage(`Folder is empty: ${folderName}`);
  }
}

/**
 * Moves to the previous folder in the folder list, prioritizes files in the folder, and announces the folder and first file.
 */
async function moveToPreviousFolder() {
  if (folderList.length === 0) {
    vscode.window.showErrorMessage("No folders available to navigate.");
    await speakMessage("No folders available to navigate.");
    return;
  }

  currentFolderIndex =
    (currentFolderIndex - 1 + folderList.length) % folderList.length;
  const currentFolder = folderList[currentFolderIndex];
  const folderName = path.basename(currentFolder); // Extract only the folder name

  // Collapse all folders, then reveal and expand the new one
  await vscode.commands.executeCommand(
    "workbench.files.action.collapseExplorerFolders"
  );
  await vscode.commands.executeCommand(
    "revealInExplorer",
    vscode.Uri.file(currentFolder)
  );
  await vscode.commands.executeCommand("list.expand"); // This will expand the selected folder

  vscode.window.showInformationMessage(`Moved to folder: ${folderName}`);
  await speakMessage(`Moved to folder: ${folderName}`);

  // Get files in the current folder
  const files = fs
    .readdirSync(currentFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(currentFolder, entry.name));

  if (files.length > 0) {
    const firstFile = path.basename(files[0]); // Extract only the file name
    vscode.window.showInformationMessage(`First file in folder: ${firstFile}`);
    await speakMessage(`First file in folder: ${firstFile}`);
  } else {
    vscode.window.showInformationMessage(`Folder is empty: ${folderName}`);
    await speakMessage(`Folder is empty: ${folderName}`);
  }
}

/**
 * Dynamically updates the folder contents when a file is created.
 */
async function watchFolderForChanges() {
  const currentFolder = folderList[currentFolderIndex];

  if (!currentFolder) {
    vscode.window.showErrorMessage("No folder selected to watch for changes.");
    await speakMessage("No folder selected to watch for changes.");
    return;
  }

  fs.watch(currentFolder, (eventType, filename) => {
    if (eventType === "rename" && filename) {
      const filePath = path.join(currentFolder, filename);
      if (fs.existsSync(filePath)) {
        vscode.window.showInformationMessage(`New file created: ${filePath}`);
        speakMessage(`New file created: ${filePath}`);
      }
    }
  });

  vscode.window.showInformationMessage(
    `Watching folder for changes: ${currentFolder}`
  );
  await speakMessage(`Watching folder for changes: ${currentFolder}`);
}

/**
 * Registers folder navigation commands.
 */
function registerFolderNavigatorCommands(context) {
  const initializeCommand = vscode.commands.registerCommand(
    "echocode.initializeFolderList",
    initializeFolderList
  );

  const nextFolderCommand = vscode.commands.registerCommand(
    "echocode.moveToNextFolder",
    moveToNextFolder
  );

  const previousFolderCommand = vscode.commands.registerCommand(
    "echocode.moveToPreviousFolder",
    moveToPreviousFolder
  );

  const watchFolderCommand = vscode.commands.registerCommand(
    "echocode.watchFolderForChanges",
    watchFolderForChanges
  );

  context.subscriptions.push(
    initializeCommand,
    nextFolderCommand,
    previousFolderCommand,
    watchFolderCommand
  );
}

/**
 * Gets the current folder from the folder list.
 * @returns {string|null} The current folder path, or null if no folder is selected.
 */
function getCurrentFolder() {
  if (folderList.length === 0) {
    return null;
  }
  return folderList[currentFolderIndex];
}

module.exports = {
  initializeFolderList,
  registerFolderNavigatorCommands,
  getCurrentFolder,
};
