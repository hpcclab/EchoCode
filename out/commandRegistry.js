"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerExtensionCommands = registerExtensionCommands;
const vscode = __importStar(require("vscode"));
function logAndShow(message) {
    vscode.window.showInformationMessage(message);
    console.log(message);
}
function getModeMessage(isTest, testMessage, liveMessage) {
    return isTest ? testMessage : liveMessage;
}
function registerStaticCommands(register, isTest, definitions) {
    for (const definition of definitions) {
        register(definition.id, () => {
            logAndShow(getModeMessage(isTest, definition.testMessage, definition.liveMessage));
        });
    }
}
function getActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor");
    }
    return editor;
}
function updateSelection(editor, targetLine, isTest) {
    if (isTest) {
        const mockEditor = editor;
        mockEditor.selection.active.line = targetLine;
        return;
    }
    const position = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(position, position);
}
function navigateToFunction(direction, isTest) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const currentLine = editor.selection.active.line;
    const document = editor.document;
    let targetLine = currentLine + direction;
    while (targetLine >= 0 && targetLine < document.lineCount) {
        const text = document.lineAt(targetLine).text.trim();
        if (text.startsWith("def ")) {
            updateSelection(editor, targetLine, isTest);
            logAndShow(getModeMessage(isTest, `[Test Navigation] Jumped to ${text}`, `Navigated to ${text}`));
            return;
        }
        targetLine += direction;
    }
    logAndShow(getModeMessage(isTest, direction > 0
        ? "[Test Navigation] No next function"
        : "[Test Navigation] No previous function", direction > 0 ? "No next function found." : "No previous function found."));
}
function registerEditorCommands(register, isTest) {
    register("echocode.readCurrentLine", () => {
        const editor = getActiveEditor();
        if (!editor) {
            return;
        }
        const line = editor.selection.active.line;
        const text = editor.document.lineAt(line).text;
        const prefix = isTest ? "[Test Line]" : "Current line:";
        logAndShow(`${prefix} ${text}`);
    });
    register("echocode.describeCurrentLine", () => {
        const editor = getActiveEditor();
        if (!editor) {
            return;
        }
        const line = editor.selection.active.line;
        const text = editor.document.lineAt(line).text;
        logAndShow(getModeMessage(isTest, `[Test Describe] ${text}`, `Describing current line: ${text}`));
    });
    register("echocode.jumpToNextFunction", () => {
        navigateToFunction(1, isTest);
    });
    register("echocode.jumpToPreviousFunction", () => {
        navigateToFunction(-1, isTest);
    });
}
function registerExtensionCommands(context, isTest) {
    const register = (id, handler) => {
        context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    };
    register("echolint.helloWorld", () => {
        const message = isTest
            ? "[Test] Hello World simulated!"
            : "Hello World from EchoLint!";
        vscode.window.showInformationMessage(message);
    });
    registerEditorCommands(register, isTest);
    registerStaticCommands(register, isTest, [
        {
            id: "echocode.increaseSpeechSpeed",
            testMessage: "[Test] Increase speech speed",
            liveMessage: "Increasing speech speed.",
        },
        {
            id: "echocode.decreaseSpeechSpeed",
            testMessage: "[Test] Decrease speech speed",
            liveMessage: "Decreasing speech speed.",
        },
        {
            id: "echocode.stopSpeech",
            testMessage: "[Test] Stop speech",
            liveMessage: "Stopping speech.",
        },
        {
            id: "echocode.summarizeClass",
            testMessage: "[Test] Summarize current class",
            liveMessage: "Summarizing current class (placeholder).",
        },
        {
            id: "echocode.summarizeFunction",
            testMessage: "[Test] Summarize current function",
            liveMessage: "Summarizing current function (placeholder).",
        },
        {
            id: "echocode.summarizeProgram",
            testMessage: "[Test] Summarize current program",
            liveMessage: "Summarizing current program (placeholder).",
        },
        {
            id: "echocode.whereAmI",
            testMessage: "[Test] Where am I",
            liveMessage: "Describing current scope (placeholder).",
        },
        {
            id: "echocode.annotate",
            testMessage: "[Test] Toggle annotations",
            liveMessage: "Toggling EchoCode annotations (placeholder).",
        },
        {
            id: "echocode.readAllAnnotations",
            testMessage: "[Test] Read all annotations",
            liveMessage: "Reading all annotations aloud (placeholder).",
        },
        {
            id: "echocode.speakNextAnnotation",
            testMessage: "[Test] Speak next annotation",
            liveMessage: "Speaking next annotation (placeholder).",
        },
        {
            id: "code-tutor.analyzeBigO",
            testMessage: "[Test] Analyze Big O",
            liveMessage: "Analyzing Big O (placeholder).",
        },
        {
            id: "code-tutor.iterateBigOQueue",
            testMessage: "[Test] Read next Big O recommendation",
            liveMessage: "Reading next Big O recommendation (placeholder).",
        },
        {
            id: "code-tutor.readEntireBigOQueue",
            testMessage: "[Test] Read all Big O recommendations",
            liveMessage: "Reading all Big O recommendations (placeholder).",
        },
        {
            id: "echocode.loadAssignmentFile",
            testMessage: "[Test] Load assignment file",
            liveMessage: "Loading assignment file (placeholder).",
        },
        {
            id: "echocode.rescanUserCode",
            testMessage: "[Test] Rescan user code for completed tasks",
            liveMessage: "Rescanning code for completed tasks (placeholder).",
        },
        {
            id: "echocode.readNextSequentialTask",
            testMessage: "[Test] Read next sequential task",
            liveMessage: "Reading next sequential task (placeholder).",
        },
        {
            id: "echocode.readNextTask",
            testMessage: "[Test] Read next task",
            liveMessage: "Reading next task (placeholder).",
        },
        {
            id: "echocode.markTaskComplete",
            testMessage: "[Test] Mark task complete",
            liveMessage: "Marking task as complete (placeholder).",
        },
        {
            id: "echocode.createFile",
            testMessage: "[Test] Create file",
            liveMessage: "Creating new file (placeholder).",
        },
        {
            id: "echocode.createFolder",
            testMessage: "[Test] Create folder",
            liveMessage: "Creating new folder (placeholder).",
        },
        {
            id: "echocode.navigateToNextFile",
            testMessage: "[Test] Navigate to next file",
            liveMessage: "Navigating to next file (placeholder).",
        },
        {
            id: "echocode.initializeFolderList",
            testMessage: "[Test] Initialize folder list",
            liveMessage: "Initializing folder list (placeholder).",
        },
        {
            id: "echocode.moveToNextFolder",
            testMessage: "[Test] Move to next folder",
            liveMessage: "Moving to next folder (placeholder).",
        },
        {
            id: "echocode.moveToPreviousFolder",
            testMessage: "[Test] Move to previous folder",
            liveMessage: "Moving to previous folder (placeholder).",
        },
        {
            id: "echocode.navigateFilesInCurrentFolder",
            testMessage: "[Test] Navigate files in folder",
            liveMessage: "Navigating files in current folder (placeholder).",
        },
        {
            id: "echocode.toggleCharacterReadOut",
            testMessage: "[Test] Toggle character read-out",
            liveMessage: "Toggling character read-out (placeholder).",
        },
        {
            id: "echocode.copyFileNameForImport",
            testMessage: "[Test] Copy file name for import",
            liveMessage: "Copying file name for import (placeholder).",
        },
        {
            id: "echocode.pasteImportAtCursor",
            testMessage: "[Test] Paste import statement",
            liveMessage: "Pasting import statement at cursor (placeholder).",
        },
        {
            id: "echocode.readHotkeyGuide",
            testMessage: "[Test] Read hotkey guide",
            liveMessage: "Reading EchoCode hotkey guide (placeholder).",
        },
        {
            id: "echocode.readErrors",
            testMessage: "[Test] Read Python errors",
            liveMessage: "Reading Python errors aloud (placeholder).",
        },
        {
            id: "echocode.openChat",
            testMessage: "[Test] Open EchoCode chat",
            liveMessage: "Opening EchoCode Tutor chat (placeholder).",
        },
        {
            id: "echocode.startVoiceInput",
            testMessage: "[Test] Start voice input",
            liveMessage: "Starting voice input (placeholder).",
        },
    ]);
}
//# sourceMappingURL=commandRegistry.js.map