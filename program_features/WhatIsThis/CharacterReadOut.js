const vscode = require("vscode");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

let isCharacterReadOutEnabled = false; // Toggle state
let activeEditor = null;

// Map of symbols to their descriptive names
const symbolMap = {
  '"': "double quote",
  "'": "single quote",
  "(": "open parenthesis",
  ")": "close parenthesis",
  "{": "open curly brace",
  "}": "close curly brace",
  "[": "open square bracket",
  "]": "close square bracket",
  ":": "colon",
  ";": "semicolon",
  ",": "comma",
  ".": "period",
  "!": "exclamation mark",
  "?": "question mark",
  "-": "dash",
  _: "underscore",
  "=": "equals",
  "+": "plus",
  "*": "asterisk",
  "/": "slash",
  "\\": "backslash",
  "|": "pipe",
  "&": "ampersand",
  "^": "caret",
  "%": "percent",
  $: "dollar sign",
  "#": "hash",
  "@": "at symbol",
  "~": "tilde",
  "`": "backtick",
};

/**
 * Reads the character to the left of the cursor.
 */
async function readCharacterToLeft() {
  if (!activeEditor) return;

  const cursorPosition = activeEditor.selection.active;
  const lineText = activeEditor.document.lineAt(cursorPosition.line).text;

  if (cursorPosition.character > 0) {
    const char = lineText[cursorPosition.character - 1];
    const spokenChar = symbolMap[char] || char; // Use mapped name or the character itself
    await speakMessage(spokenChar);
  }
}

/**
 * Toggles the character read-out feature.
 */
function toggleCharacterReadOut() {
  isCharacterReadOutEnabled = !isCharacterReadOutEnabled;

  if (isCharacterReadOutEnabled) {
    vscode.window.showInformationMessage("Character Read-Out Enabled");
    startListeningForChanges();
  } else {
    vscode.window.showInformationMessage("Character Read-Out Disabled");
    stopListeningForChanges();
  }
}

/**
 * Starts listening for cursor movements.
 */
function startListeningForChanges() {
  activeEditor = vscode.window.activeTextEditor;

  if (!activeEditor) {
    vscode.window.showWarningMessage("No active editor found.");
    return;
  }

  // Listen for cursor movements
  vscode.window.onDidChangeTextEditorSelection((event) => {
    if (isCharacterReadOutEnabled && event.textEditor === activeEditor) {
      readCharacterToLeft(); // Always read the character to the left of the cursor
    }
  });
}

/**
 * Stops listening for cursor movements.
 */
function stopListeningForChanges() {
  activeEditor = null;
}

/**
 * Registers the toggle command for character read-out.
 */
function registerCharacterReadOutCommand(context) {
  const toggleCommand = vscode.commands.registerCommand(
    "echocode.toggleCharacterReadOut",
    toggleCharacterReadOut
  );

  context.subscriptions.push(toggleCommand);
}

module.exports = { registerCharacterReadOutCommand };
