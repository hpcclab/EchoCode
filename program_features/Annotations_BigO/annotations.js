const vscode = require("vscode");
const Queue = require("./queue_system");
const fs = require("fs");
const path = require("path");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

let activeDecorations = [];
const annotationQueue = new Queue();
let annotationsVisible = false;
let annotatedLines = new Set(); // Track which lines already have annotations

const ANNOTATION_PROMPT = `You are an EchoCode tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you. You will then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;

function getEntireFileWithLineNumbers(textEditor) {
  const documentLineCount = textEditor.document.lineCount;
  let code = "";
  for (let lineNumber = 0; lineNumber < documentLineCount; lineNumber++) {
    code += `${lineNumber + 1}: ${
      textEditor.document.lineAt(lineNumber).text
    }\n`;
  }
  return code;
}

// Load annotation settings from JSON
function loadAnnotationSettings() {
  const settingsPath = path.join(
    __dirname,
    "../../Core/program_settings/JSON_files/Annotation_Settings.json"
  );
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error loading Annotation_Settings.json", err);
  }
  return null;
}

// Check code against local JSON rules
function checkLocalRules(textEditor, outputChannel) {
  const settings = loadAnnotationSettings();
  if (!settings) {
    outputChannel.appendLine("No annotation settings found.");
    return false;
  }

  const doc = textEditor.document;
  const langId = doc.languageId;
  let foundLocalIssues = false;
  let rules = [];

  if (langId === "python") rules = settings.python || [];
  else if (langId === "cpp") rules = settings.cpp || [];
  else {
    outputChannel.appendLine(
      `Language '${langId}' not supported for local checks.`
    );
    return false;
  }

  const lines = doc.getText().split("\n");

  lines.forEach((lineText, lineIndex) => {
    rules.forEach((rule) => {
      if (lineText.includes(rule.pattern)) {
        foundLocalIssues = true;
        const lineNumber = lineIndex + 1;
        const message = rule.message;

        // Mark this line as annotated
        annotatedLines.add(lineNumber);

        applyDecoration(textEditor, lineNumber, message);
        annotationQueue.enqueue({ line: lineNumber, suggestion: message });

        outputChannel.appendLine(`[Local Rule] Line ${lineNumber}: ${message}`);
      }
    });
  });

  return foundLocalIssues;
}

async function parseChatResponse(chatResponse, textEditor, outputChannel) {
  let accumulatedResponse = "";
  for await (const fragment of chatResponse.text) {
    accumulatedResponse += fragment;
    if (fragment.includes("}")) {
      try {
        const matches = accumulatedResponse.match(/{.*?}/g);
        if (matches) {
          matches.forEach((jsonStr) => {
            try {
              const annotation = JSON.parse(jsonStr);

              // Check if this line already has an annotation from JSON rules
              if (annotatedLines.has(annotation.line)) {
                outputChannel.appendLine(
                  `[AI Skip] Line ${annotation.line} already annotated by local rules`
                );
                return; // Skip this annotation
              }

              // Mark this line as annotated and apply decoration
              annotatedLines.add(annotation.line);
              applyDecoration(
                textEditor,
                annotation.line,
                annotation.suggestion
              );

              const annotationData = {
                line: annotation.line,
                suggestion: annotation.suggestion,
              };
              annotationQueue.enqueue(annotationData);

              outputChannel.appendLine(
                `[AI] Line ${annotation.line}: ${annotation.suggestion}`
              );

              accumulatedResponse = accumulatedResponse.replace(jsonStr, "");
            } catch (e) {
              // partial json, wait for more
            }
          });
        }
      } catch (error) {
        console.error("Failed to parse annotation:", error.message);
      }
    }
  }
}

function applyDecoration(editor, line, suggestion) {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` // ${suggestion.substring(0, 50)}...`,
      color: "grey",
    },
  });
  const lineLength = editor.document.lineAt(line - 1).text.length;
  const range = new vscode.Range(
    new vscode.Position(line - 1, lineLength),
    new vscode.Position(line - 1, lineLength)
  );
  editor.setDecorations(decorationType, [
    { range: range, hoverMessage: suggestion },
  ]);

  activeDecorations.push({
    decorationType,
    editor,
  });
}

function clearDecorations() {
  for (const decoration of activeDecorations) {
    decoration.editor.setDecorations(decoration.decorationType, []);
  }
  activeDecorations = [];
  annotatedLines.clear(); // Clear the tracking set
}

function getVisibleCodeWithLineNumbers(textEditor) {
  let currentLine = textEditor.visibleRanges[0].start.line;
  const endLine = textEditor.visibleRanges[0].end.line;
  let code = "";
  while (currentLine < endLine) {
    code += `${currentLine + 1}: ${
      textEditor.document.lineAt(currentLine).text
    }\n`;
    currentLine++;
  }
  return code;
}

// Consolidated function to register all annotation-related commands
function registerAnnotationCommands(context, outputChannel) {
  // Command to create annotations
  const annotateCommand = vscode.commands.registerTextEditorCommand(
    "echocode.annotate",
    async (textEditor) => {
      outputChannel.appendLine("echocode.annotate command triggered");

      if (annotationsVisible) {
        clearDecorations();
        annotationQueue.clear();
        annotationsVisible = false;
        vscode.window.showInformationMessage("Annotations cleared");
        return;
      }

      try {
        // Clear previous annotations tracking
        annotatedLines.clear();

        // Step 1: Check local JSON rules first
        outputChannel.appendLine("Step 1: Checking local JSON rules...");
        const foundLocalIssues = checkLocalRules(textEditor, outputChannel);

        if (foundLocalIssues) {
          outputChannel.appendLine(
            `Local rules found ${annotatedLines.size} issue(s). Proceeding to AI check...`
          );
        } else {
          outputChannel.appendLine(
            "No local issues found. Proceeding to AI check..."
          );
        }

        // Step 2: Always query AI (it will skip lines already annotated)
        // REMOVED the early return - AI check now always runs
        outputChannel.appendLine(
          "Step 2: Querying AI for additional suggestions..."
        );
        const codeWithLineNumbers = getEntireFileWithLineNumbers(textEditor);

        const statusBarMessage = vscode.window.setStatusBarMessage(
          "$(loading~spin) EchoCode is analyzing your file with AI..."
        );

        const [model] = await vscode.lm.selectChatModels({
          vendor: "copilot",
          family: "gpt-4o",
        });

        if (!model) {
          statusBarMessage.dispose();

          // If AI fails but we have local annotations, still mark as visible
          if (foundLocalIssues) {
            annotationsVisible = true;
            vscode.window.showInformationMessage(
              "Local annotations applied. AI unavailable - please ensure Copilot is enabled."
            );
          } else {
            vscode.window.showErrorMessage(
              "No language model available. Please ensure Copilot is enabled."
            );
          }
          outputChannel.appendLine("No language model available");
          return;
        }

        const messages = [
          new vscode.LanguageModelChatMessage(0, ANNOTATION_PROMPT),
          new vscode.LanguageModelChatMessage(0, codeWithLineNumbers),
        ];

        const chatResponse = await model.sendRequest(
          messages,
          {},
          new vscode.CancellationTokenSource().token
        );

        await parseChatResponse(chatResponse, textEditor, outputChannel);
        annotationsVisible = true;

        statusBarMessage.dispose();
        vscode.window.setStatusBarMessage(
          "EchoCode finished analyzing your code",
          3000
        );
        outputChannel.appendLine(
          `Analysis complete. Total annotations: ${annotatedLines.size}`
        );
      } catch (error) {
        outputChannel.appendLine("Error in annotate command: " + error.message);
        vscode.window.showErrorMessage(
          "Failed to annotate code: " + error.message
        );
      }
    }
  );

  // Command to speak the next annotation
  const speakNextAnnotationCommand = vscode.commands.registerCommand(
    "echocode.speakNextAnnotation",
    async () => {
      outputChannel.appendLine(
        "echocode.speakNextAnnotation command triggered"
      );
      if (!annotationQueue.isEmpty()) {
        const nextAnnotation = annotationQueue.dequeue();
        const message = `Annotation on line ${nextAnnotation.line}: ${nextAnnotation.suggestion}`;
        vscode.window.showInformationMessage(message);
        await speakMessage(message);
      } else {
        vscode.window.showInformationMessage("No more annotations to read.");
        await speakMessage("No more annotations to read.");
      }
    }
  );

  // Command to read all annotations
  const readAllAnnotationsCommand = vscode.commands.registerCommand(
    "echocode.readAllAnnotations",
    async () => {
      outputChannel.appendLine("Reading all annotations aloud...");
      const annotations = annotationQueue.items;
      if (annotations.length === 0) {
        vscode.window.showInformationMessage(
          "No annotations available to read."
        );
        return;
      }
      for (const annotation of annotations) {
        await speakMessage(
          `Annotation on line ${annotation.line}: ${annotation.suggestion}`
        );
      }
    }
  );

  context.subscriptions.push(
    annotateCommand,
    speakNextAnnotationCommand,
    readAllAnnotationsCommand
  );
}

module.exports = {
  annotationQueue,
  parseChatResponse,
  applyDecoration,
  clearDecorations,
  getVisibleCodeWithLineNumbers,
  getEntireFileWithLineNumbers,
  registerAnnotationCommands,
  ANNOTATION_PROMPT,
};
