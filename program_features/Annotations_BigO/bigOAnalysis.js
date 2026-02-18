const vscode = require("vscode");
const Queue = require("./queue_system");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");
const { annotationQueue } = require("./annotations");

const bigOQueue = new Queue();

// Track lines we have already analyzed locally so we don't ask AI about them
let analyzedLines = new Set();

const ANNOTATION_PROMPT = `
You are a Big O complexity analyzer. For each code pattern that causes performance issues, provide a single concise sentence. Just one sentence. that explains the issue and suggests an improvement. Format each suggestion as a single JSON object without any formatting:

{ "line": <line_number>, "suggestion": "<brief, one-sentence explanation of the issue and how to fix it>" }
`;

/**
 * ENTRY POINT: Analyzes the code for Big O problems using Hybrid (Local + AI) approach.
 */
async function analyzeBigO(editor) {
  const document = editor.document;
  analyzedLines.clear(); // Reset tracking

  // Temporary array to hold all findings so we can sort them later
  let collectedIssues = [];

  // 1. Run Local Static Analysis (Logic-based)
  // We pass collectedIssues so it can add findings there instead of the queue directly
  const localIssuesCount = checkLocalBigORules(editor, collectedIssues);

  if (localIssuesCount > 0) {
    vscode.window.showInformationMessage(
      `Detected ${localIssuesCount} Big O issues via static analysis.`
    );
  }

  // 2. Identify remaining loops that need AI analysis
  const loops = detectLoops(document);
  const remainingLoops = loops.filter(
    (loop) => !analyzedLines.has(loop.startLine)
  );

  // If no loops need AI, just finalize the local issues
  if (remainingLoops.length === 0) {
    finalizeQueue(collectedIssues); // Sort and enqueue headers

    if (localIssuesCount === 0) {
      vscode.window.showInformationMessage("No loops detected in the file.");
    } else {
      vscode.window.showInformationMessage("Analysis complete (Local only).");
    }
    return;
  }

  vscode.window.showInformationMessage(
    `Analyzing ${remainingLoops.length} remaining complex loop(s) with AI...`
  );

  // 3. Analyze the remaining, complex loops with AI
  // Pass collectedIssues so AI can append to it
  await analyzeLoops(editor, remainingLoops, collectedIssues);

  // 4. Finally, sort everything and put it in the queue
  finalizeQueue(collectedIssues);

  vscode.window.showInformationMessage("Big O Analysis Complete.");
}

/**
 * Sorts issues by line number and adds them to the Queues
 */
function finalizeQueue(issues) {
  // Sort by line number ascending
  issues.sort((a, b) => a.line - b.line);

  // Add to queues
  issues.forEach((item) => {
    annotationQueue.enqueue(item);
    bigOQueue.enqueue(item);
  });
}

/**
 * NEW: Checks for common Big O pitfalls locally without AI
 */
function checkLocalBigORules(editor, collectedIssues) {
  const document = editor.document;
  const lines = document.getText().split("\n");
  let issuesFound = 0;

  // Stack to track loop indentation levels: { indent: number, line: number }
  let loopStack = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();
    const currentIndent = lineText.search(/\S|$/); // Find number of spaces
    const lineNumber = i + 1; // 1-based line number for display

    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // 1. POP stack if we exited a loop (indentation is less than or equal to last loop)
    while (
      loopStack.length > 0 &&
      currentIndent <= loopStack[loopStack.length - 1].indent
    ) {
      loopStack.pop();
    }

    const isLoop = trimmed.startsWith("for ") || trimmed.startsWith("while ");

    if (isLoop) {
      // 2. CHECK: Nested Loops (O(N^2))
      if (loopStack.length > 0) {
        const message =
          "O(N²) Detected: Nested loop found. Consider optimizing logic to avoid nesting.";
        addBigOIssue(editor, lineNumber, message, collectedIssues);
        issuesFound++;
      }
      // Push specific loop to stack
      loopStack.push({ indent: currentIndent, line: lineNumber });
    } else if (loopStack.length > 0) {
      // We are INSIDE a loop. Check for expensive operations.

      // 3. CHECK: Linear operations inside loop (O(N^2))
      if (
        trimmed.includes(".count(") ||
        trimmed.includes(".index(") ||
        trimmed.includes(".remove(")
      ) {
        const message =
          "O(N²) Detected: Calling .count(), .index(), or .remove() inside a loop causes a linear scan every iteration.";
        addBigOIssue(editor, lineNumber, message, collectedIssues);
        issuesFound++;
      }

      // 4. CHECK: Membership test in list (O(N^2))
      // Heuristic: "something in something" prevents flagging "for x in y"
      if (
        trimmed.includes(" in ") &&
        !trimmed.startsWith("for ") &&
        !trimmed.startsWith("if ")
      ) {
        // This is a weak check, but effective for things like "if x in my_list:"
        if (trimmed.match(/if\s+.+\s+in\s+/)) {
          const message =
            "Potential O(N²): Checking 'in' list inside a loop is slow. Use a set() for O(1) lookups.";
          addBigOIssue(editor, lineNumber, message, collectedIssues);
          issuesFound++;
        }
      }

      // 5. CHECK: Sorting inside loop (O(N^2 log N))
      if (trimmed.includes(".sort(") || trimmed.includes("sorted(")) {
        const message =
          "Major Inefficiency: Sorting inside a loop is extremely expensive (O(N² log N)). Sort outside the loop.";
        addBigOIssue(editor, lineNumber, message, collectedIssues);
        issuesFound++;
      }
    }
  }

  return issuesFound;
}

/**
 * Helper to add issue to collection and apply decoration
 */
function addBigOIssue(editor, line, suggestion, collectedIssues) {
  // Mark line as handled so AI ignores it
  analyzedLines.add(line);

  // Apply decoration immediately so user sees it
  applyDecoration(editor, line, suggestion);

  // Add to temporary collection (DO NOT Enqueue yet)
  collectedIssues.push({ line, suggestion });

  console.log(`[Local BigO] Added issue at line ${line}: ${suggestion}`);
}

/**
 * Parses the chat response and applies decorations.
 */
async function parseChatResponse(chatResponse, textEditor, collectedIssues) {
  let accumulatedResponse = "";
  for await (const fragment of chatResponse.text) {
    accumulatedResponse += fragment;

    // Check if the accumulated response contains a complete JSON array
    if (accumulatedResponse.trim().endsWith("]")) {
      try {
        const annotations = JSON.parse(cleanResponse(accumulatedResponse));

        annotations.forEach((annotation) => {
          const line = annotation.line;

          // Skip if we already found an issue here locally
          if (analyzedLines.has(line)) return;

          // Apply decoration immediately
          applyDecoration(textEditor, line, annotation.suggestion);

          // Add to temporary collection (DO NOT Enqueue yet)
          collectedIssues.push({
            line: line,
            suggestion: annotation.suggestion,
          });

          analyzedLines.add(line); // Mark as handled
        });

        accumulatedResponse = "";
      } catch (error) {
        console.error("Failed to parse annotation:", error.message);
      }
    }
  }
}

/**
 * Cleans the raw response from the language model.
 */
function cleanResponse(rawResponse) {
  return rawResponse
    .replace(/```json/g, "") // Remove ```json
    .replace(/```/g, "") // Remove ```
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Applies decorations to the editor.
 */
function applyDecoration(editor, line, suggestion) {
  const document = editor.document;

  // Make sure the line number is valid
  if (line - 1 < 0 || line - 1 >= document.lineCount) {
    console.warn(`Line ${line} is outside of document range`);
    return;
  }

  // Get the line object
  const lineObj = document.lineAt(line - 1);

  // Skip lines that are comments or empty
  const lineText = lineObj.text.trim();
  if (lineText.startsWith("#") || lineText === "") {
    console.warn(
      `Skipping annotation on line ${line}: Line is a comment or empty.`
    );
    return;
  }

  // Create decoration type with styling that matches the annotation style
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` ${suggestion.substring(0, 25) + "..."}`,
      color: "grey",
    },
  });

  // Get the length of the line to position the decoration at the end
  const lineLength = lineObj.text.length;

  // Create a range at the end of the line
  const range = new vscode.Range(
    new vscode.Position(line - 1, lineLength),
    new vscode.Position(line - 1, lineLength)
  );

  // Apply the decoration with hover message for the full suggestion
  editor.setDecorations(decorationType, [
    { range: range, hoverMessage: suggestion },
  ]);
}

/**
 * Detects loops in the Python file.
 */
function detectLoops(document) {
  const loops = [];
  const lines = document.getText().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("for ") || line.startsWith("while ")) {
      loops.push({ startLine: i + 1, code: line });
    }
  }
  return loops;
}

/**
 * Analyzes loops for potential O(N) inefficiencies using Copilot.
 */
async function analyzeLoops(editor, loops, collectedIssues) {
  const document = editor.document;

  for (const loop of loops) {
    const { startLine, code } = loop;

    // PREVENT DUPLICATES: Check if this line was already handled by local Check
    if (analyzedLines.has(startLine)) {
      console.log(
        `Skipping AI analysis for line ${startLine} (handled locally).`
      );
      continue;
    }

    const prompt = `
      You are a code analysis assistant. Analyze the following Python loop and identify any potential O(N) inefficiencies. The code includes line numbers. Use these line numbers when identifying inefficiencies. Provide suggestions in JSON format, with each suggestion containing the line number and a brief explanation of the issue. Do not include any additional formatting like \`\`\`json or \`\`\`. Use the following format:
      [
        { "line": <line_number>, "suggestion": "<description of the inefficiency>" }
      ]
      Here is the code context:
      Line ${startLine}: ${code}
    `;

    try {
      const [model] = await vscode.lm.selectChatModels({
        vendor: "copilot",
        family: "gpt-4o",
      });

      if (!model) {
        vscode.window.showErrorMessage(
          "No language model available. Please ensure Copilot is enabled."
        );
        return;
      }

      const messages = [new vscode.LanguageModelChatMessage(0, prompt)];
      const chatResponse = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );

      await parseChatResponse(chatResponse, editor, collectedIssues);
    } catch (error) {
      console.error("Error analyzing loop:", error);
    }
  }
}

function iterateBigOQueue() {
  if (!bigOQueue.isEmpty()) {
    const nextProblem = bigOQueue.dequeue();
    const message = `Big O problem on line ${nextProblem.line}: ${nextProblem.suggestion}`;
    vscode.window.showInformationMessage(message);
    speakMessage(message);
  } else {
    const noMoreProblemsMessage = "No more Big O problems.";
    vscode.window.showInformationMessage(noMoreProblemsMessage);
    speakMessage(noMoreProblemsMessage);
  }
}

async function readEntireBigOQueue() {
  if (!bigOQueue.isEmpty()) {
    const queueCopy = [...bigOQueue.items];
    for (const problem of queueCopy) {
      const message = `Big O problem on line ${problem.line}: ${problem.suggestion}`;
      vscode.window.showInformationMessage(message);
      await speakMessage(message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else {
    const noProblemsMessage = "No Big O problems detected.";
    vscode.window.showInformationMessage(noProblemsMessage);
    await speakMessage(noProblemsMessage);
  }
}

function registerBigOCommand(context) {
  const analyzeBigOCommand = vscode.commands.registerCommand(
    "code-tutor.analyzeBigO",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "python") {
        analyzeBigO(editor);
      } else {
        vscode.window.showWarningMessage(
          "Please open a Python file to analyze Big O practices."
        );
      }
    }
  );

  const iterateBigOCommand = vscode.commands.registerCommand(
    "code-tutor.iterateBigOQueue",
    () => {
      iterateBigOQueue();
    }
  );

  const readNextAnnotationCommand = vscode.commands.registerCommand(
    "echocode.readNextAnnotation",
    async () => {
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

  const readEntireBigOQueueCommand = vscode.commands.registerCommand(
    "code-tutor.readEntireBigOQueue",
    async () => {
      await readEntireBigOQueue();
    }
  );

  context.subscriptions.push(
    analyzeBigOCommand,
    iterateBigOCommand,
    readNextAnnotationCommand,
    readEntireBigOQueueCommand
  );
}

module.exports = {
  registerBigOCommand,
};
