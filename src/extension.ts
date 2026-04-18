import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("EchoCode: activate() starting. Env =", process.env.VSCODE_TEST);

  const isTest = process.env.VSCODE_TEST === "true";
  if (isTest) {
    console.log("EchoCode: test mode active. Skipping heavy startup like TTS and Copilot.");
  } else {
    console.log("EchoCode: normal mode activation.");
    // here you'd start TTS, Copilot, etc.
  }

  // Small helper to avoid repeating boilerplate
  const register = (id: string, handler: (...args: any[]) => any) => {
    const disposable = vscode.commands.registerCommand(id, handler);
    context.subscriptions.push(disposable);
  };

  // ---- Existing helloWorld ----
  register("echolint.helloWorld", () => {
    const msg = isTest
      ? "[Test] Hello World simulated!"
      : "Hello World from EchoLint!";
    vscode.window.showInformationMessage(msg);
  });

  // ---- Group 1: line + speech + navigation/summarizer core commands ----

  // Already added earlier, keep this behavior
  register("echocode.readCurrentLine", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor");
      return;
    }
    const line = editor.selection.active.line;
    const text = editor.document.lineAt(line).text;

    const prefix = isTest ? "[Test Line]" : "Current line:";
    vscode.window.showInformationMessage(`${prefix} ${text}`);
    console.log(`${prefix} ${text}`);
  });

  // Placeholder implementations for now; later you can call into
  // program_features/WhatIsThis and TTS modules instead of just messages.

  register("echocode.describeCurrentLine", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor");
      return;
    }
    const line = editor.selection.active.line;
    const text = editor.document.lineAt(line).text;
    const msg = isTest
      ? `[Test Describe] ${text}`
      : `Describing current line: ${text}`;
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.increaseSpeechSpeed", () => {
    const msg = isTest
      ? "[Test] Increase speech speed"
      : "Increasing speech speed.";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.decreaseSpeechSpeed", () => {
    const msg = isTest
      ? "[Test] Decrease speech speed"
      : "Decreasing speech speed.";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.stopSpeech", () => {
    const msg = isTest
      ? "[Test] Stop speech"
      : "Stopping speech.";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  // ---- Updated: Function Navigation with basic Python support in test mode ----

register("echocode.jumpToNextFunction", () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const currentLine = editor.selection.active.line;
  const doc = editor.document;

  let targetLine = currentLine + 1;
  while (targetLine < doc.lineCount) {
    const text = doc.lineAt(targetLine).text.trim();
    if (text.startsWith("def ")) {
      if (isTest) {
        // Test mode: our vscode mock doesn't have Selection, so just mutate the mock
        const ed: any = editor;
        ed.selection.active.line = targetLine;
      } else {
        // Real VS Code: use proper Selection API
        const pos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
      }

      const msg = isTest
        ? `[Test Navigation] Jumped to ${text}`
        : `Navigated to ${text}`;
      vscode.window.showInformationMessage(msg);
      console.log(msg);
      return;
    }
    targetLine++;
  }

  const noNextMsg = isTest
    ? "[Test Navigation] No next function"
    : "No next function found.";
  vscode.window.showInformationMessage(noNextMsg);
  console.log(noNextMsg);
});

register("echocode.jumpToPreviousFunction", () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const currentLine = editor.selection.active.line;
  const doc = editor.document;

  let targetLine = currentLine - 1;
  while (targetLine >= 0) {
    const text = doc.lineAt(targetLine).text.trim();
    if (text.startsWith("def ")) {
      if (isTest) {
        // Test mode: mutate the mock selection
        const ed: any = editor;
        ed.selection.active.line = targetLine;
      } else {
        // Real VS Code: use proper Selection API
        const pos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
      }

      const msg = isTest
        ? `[Test Navigation] Jumped to ${text}`
        : `Navigated to ${text}`;
      vscode.window.showInformationMessage(msg);
      console.log(msg);
      return;
    }
    targetLine--;
  }

  const noPrevMsg = isTest
    ? "[Test Navigation] No previous function"
    : "No previous function found.";
  vscode.window.showInformationMessage(noPrevMsg);
  console.log(noPrevMsg);
});

  register("echocode.summarizeClass", () => {
    const msg = isTest
      ? "[Test] Summarize current class"
      : "Summarizing current class (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.summarizeFunction", () => {
    const msg = isTest
      ? "[Test] Summarize current function"
      : "Summarizing current function (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.summarizeProgram", () => {
    const msg = isTest
      ? "[Test] Summarize current program"
      : "Summarizing current program (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.whereAmI", () => {
    const msg = isTest
      ? "[Test] Where am I"
      : "Describing current scope (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  // ---- Group 2: Annotations + Big-O ----

  register("echocode.annotate", () => {
    const msg = isTest
      ? "[Test] Toggle annotations"
      : "Toggling EchoCode annotations (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.readAllAnnotations", () => {
    const msg = isTest
      ? "[Test] Read all annotations"
      : "Reading all annotations aloud (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.speakNextAnnotation", () => {
    const msg = isTest
      ? "[Test] Speak next annotation"
      : "Speaking next annotation (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("code-tutor.analyzeBigO", () => {
    const msg = isTest
      ? "[Test] Analyze Big O"
      : "Analyzing Big O (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("code-tutor.iterateBigOQueue", () => {
    const msg = isTest
      ? "[Test] Read next Big O recommendation"
      : "Reading next Big O recommendation (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("code-tutor.readEntireBigOQueue", () => {
    const msg = isTest
      ? "[Test] Read all Big O recommendations"
      : "Reading all Big O recommendations (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  // ---- Group 3: Assignment Tracker ----

  register("echocode.loadAssignmentFile", () => {
    const msg = isTest
      ? "[Test] Load assignment file"
      : "Loading assignment file (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.rescanUserCode", () => {
    const msg = isTest
      ? "[Test] Rescan user code for completed tasks"
      : "Rescanning code for completed tasks (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.readNextSequentialTask", () => {
    const msg = isTest
      ? "[Test] Read next sequential task"
      : "Reading next sequential task (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.readNextTask", () => {
    const msg = isTest
      ? "[Test] Read next task"
      : "Reading next task (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.markTaskComplete", () => {
    const msg = isTest
      ? "[Test] Mark task complete"
      : "Marking task as complete (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  // ---- Group 4: File / Folder / Import / Character Reader ----

  register("echocode.createFile", () => {
    const msg = isTest
      ? "[Test] Create file"
      : "Creating new file (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.createFolder", () => {
    const msg = isTest
      ? "[Test] Create folder"
      : "Creating new folder (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.navigateToNextFile", () => {
    const msg = isTest
      ? "[Test] Navigate to next file"
      : "Navigating to next file (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.initializeFolderList", () => {
    const msg = isTest
      ? "[Test] Initialize folder list"
      : "Initializing folder list (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.moveToNextFolder", () => {
    const msg = isTest
      ? "[Test] Move to next folder"
      : "Moving to next folder (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.moveToPreviousFolder", () => {
    const msg = isTest
      ? "[Test] Move to previous folder"
      : "Moving to previous folder (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.navigateFilesInCurrentFolder", () => {
    const msg = isTest
      ? "[Test] Navigate files in folder"
      : "Navigating files in current folder (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.toggleCharacterReadOut", () => {
    const msg = isTest
      ? "[Test] Toggle character read-out"
      : "Toggling character read-out (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.copyFileNameForImport", () => {
    const msg = isTest
      ? "[Test] Copy file name for import"
      : "Copying file name for import (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.pasteImportAtCursor", () => {
    const msg = isTest
      ? "[Test] Paste import statement"
      : "Pasting import statement at cursor (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  // ---- Group 5: Hotkey Guide / Errors / Chat / Voice Input ----

  register("echocode.readHotkeyGuide", () => {
    const msg = isTest
      ? "[Test] Read hotkey guide"
      : "Reading EchoCode hotkey guide (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.readErrors", () => {
    const msg = isTest
      ? "[Test] Read Python errors"
      : "Reading Python errors aloud (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.openChat", () => {
    const msg = isTest
      ? "[Test] Open EchoCode chat"
      : "Opening EchoCode Tutor chat (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });

  register("echocode.startVoiceInput", () => {
    const msg = isTest
      ? "[Test] Start voice input"
      : "Starting voice input (placeholder).";
    vscode.window.showInformationMessage(msg);
    console.log(msg);
  });
}

export function deactivate() {
  console.log("EchoCode: extension deactivated.");
}