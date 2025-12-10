const vscode = require("vscode");
const Queue = require("./queue_system"); // Import the Queue system
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler"); // Import the speakMessage function
const { annotationQueue } = require("./annotations");

const bigOQueue = new Queue(); // Queue for Big O notation problems

const ANNOTATION_PROMPT = `
You are a Big O complexity analyzer. For each code pattern that causes performance issues, provide a single concise sentence. Just one sentence. that explains the issue and suggests an improvement. Format each suggestion as a single JSON object without any formatting:

{ "line": <line_number>, "suggestion": "<brief, one-sentence explanation of the issue and how to fix it>" }
`;

/**
 * Analyzes the code for Big O problems using Copilot or a language model.
 */
async function analyzeBigO(editor) {
  const document = editor.document;

  // Detect loops in the Python file
  const loops = detectLoops(document);

  if (loops.length === 0) {
    vscode.window.showInformationMessage("No loops detected in the file.");
    return;
  }

  vscode.window.showInformationMessage(
    `Detected ${loops.length} loop(s). Analyzing for potential O(N) issues...`
  );

  // Analyze the detected loops
  await analyzeLoops(editor, loops);
}

/**
 * Parses the chat response and applies decorations.
 */
async function parseChatResponse(chatResponse, textEditor) {
  let accumulatedResponse = "";
  for await (const fragment of chatResponse.text) {
    accumulatedResponse += fragment;

    // Check if the accumulated response contains a complete JSON array
    if (accumulatedResponse.trim().endsWith("]")) {
      try {
        const annotations = JSON.parse(cleanResponse(accumulatedResponse));

        annotations.forEach((annotation) => {
          const line = annotation.line; // Use the line number provided by the AI

          // Debugging log to verify the line number
          console.log(
            `Annotation line: ${line}, Suggestion: ${annotation.suggestion}`
          );

          // Apply decoration at the correct line
          applyDecoration(textEditor, line, annotation.suggestion);

          // Enqueue the annotation for playback
          annotationQueue.enqueue({
            line: line,
            suggestion: annotation.suggestion,
          });

          // Enqueue the Big O problem into the bigOQueue
          bigOQueue.enqueue({
            line: line,
            suggestion: annotation.suggestion,
          });

          console.log(
            `Annotation added to bigOQueue: Line ${line}, Suggestion: ${annotation.suggestion}`
          );

          // Enqueue a specific annotation for optimization
          annotationQueue.enqueue({
            line: line,
            suggestion: "Optimize this loop for better performance.",
          });
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
 * Detects loops in the Python file and identifies potential inefficiencies.
 */
function detectLoops(document) {
  const loops = [];
  const lines = document.getText().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect `for` and `while` loops
    if (line.startsWith("for ") || line.startsWith("while ")) {
      loops.push({ startLine: i + 1, code: line }); // Use 1-based line numbers
    }
  }

  console.log("Detected loops:", loops); // Debugging log
  return loops;
}

/**
 * Analyzes loops for potential O(N) inefficiencies using Copilot.
 */
async function analyzeLoops(editor, loops) {
  const document = editor.document;

  for (const loop of loops) {
    const { startLine, code } = loop;

    // Prepare the prompt for Copilot
    const prompt = `
      You are a code analysis assistant. Analyze the following Python loop and identify any potential O(N) inefficiencies. The code includes line numbers. Use these line numbers when identifying inefficiencies. Provide suggestions in JSON format, with each suggestion containing the line number and a brief explanation of the issue. Do not include any additional formatting like \`\`\`json or \`\`\`. Use the following format:
      [
        { "line": <line_number>, "suggestion": "<description of the inefficiency>" }
      ]
      Here is the code:
      Line ${startLine}: ${code}
    `;

    try {
      // Select the Copilot model
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

      // Send the prompt to Copilot
      const messages = [new vscode.LanguageModelChatMessage(0, prompt)];
      const chatResponse = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );

      // Parse and handle the Copilot response
      await parseChatResponse(chatResponse, editor);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to analyze loop starting at line ${startLine}: ${error.message}`
      );
      console.error("Error analyzing loop:", error);
    }
  }
}

/**
 * Command to iterate over the Big O queue and speak the problems.
 */
function iterateBigOQueue() {
  if (!bigOQueue.isEmpty()) {
    const nextProblem = bigOQueue.dequeue();
    const message = `Big O problem on line ${nextProblem.line}: ${nextProblem.suggestion}`;

    // Display the message in an information popup
    vscode.window.showInformationMessage(message);

    // Speak the message
    speakMessage(message);
  } else {
    const noMoreProblemsMessage = "No more Big O problems to read.";

    // Display the message in an information popup
    vscode.window.showInformationMessage(noMoreProblemsMessage);

    // Speak the message
    speakMessage(noMoreProblemsMessage);
  }
}

/**
 * Command to read over the entire Big O queue and speak the problems.
 */
async function readEntireBigOQueue() {
  if (!bigOQueue.isEmpty()) {
    const queueCopy = [...bigOQueue.items]; // Copy the queue to avoid modifying it
    for (const problem of queueCopy) {
      const message = `Big O problem on line ${problem.line}: ${problem.suggestion}`;

      // Display the message in an information popup
      vscode.window.showInformationMessage(message);

      // Speak the message
      await speakMessage(message);

      // Add a small delay between messages for better readability
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else {
    const noProblemsMessage = "The Big O queue is empty.";
    vscode.window.showInformationMessage(noProblemsMessage);
    await speakMessage(noProblemsMessage);
  }
}

/**
 * Registers the Big O analysis commands.
 */
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

        // Display the message in an information popup
        vscode.window.showInformationMessage(message);

        // Speak the message
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
    readEntireBigOQueueCommand // Register the new command
  );
}

module.exports = {
  registerBigOCommand,
};
