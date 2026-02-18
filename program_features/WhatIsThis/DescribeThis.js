const vscode = require("vscode");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");
const {
  analyzeAI,
} = require("../../Core/program_settings/program_settings/AIrequest");

/**
 * Parses and describes Python code locally without AI
 */
function describePythonLine(lineText, lineNumber, document) {
  const trimmed = lineText.trim();

  // Class definition
  if (trimmed.match(/^class\s+(\w+)/)) {
    const className = trimmed.match(/^class\s+(\w+)/)[1];
    return `This is a class called ${className}`;
  }

  // Function/Method definition
  if (trimmed.match(/^def\s+(\w+)/)) {
    const funcName = trimmed.match(/^def\s+(\w+)/)[1];
    const params = trimmed.match(/\(([^)]*)\)/);
    if (params && params[1].trim()) {
      return `This is a function called ${funcName} that takes parameters: ${params[1]}`;
    }
    return `This is a function called ${funcName}`;
  }

  // Variable assignment with arithmetic operations
  const arithmeticMatch = trimmed.match(
    /^(\w+)\s*=\s*(\w+)\s*([\+\-\*\/])\s*(\w+)/
  );
  if (arithmeticMatch) {
    const [, result, left, op, right] = arithmeticMatch;
    const operations = {
      "+": "adds",
      "-": "subtracts",
      "*": "multiplies",
      "/": "divides",
    };
    const verb = operations[op];
    if (op === "-") {
      return `This line subtracts ${right} from ${left} and stores it in ${result}`;
    } else if (op === "/") {
      return `This line divides ${left} by ${right} and stores it in ${result}`;
    } else {
      return `This line ${verb} ${left} and ${right} and stores it in ${result}`;
    }
  }

  // Simple variable assignment
  const assignmentMatch = trimmed.match(/^(\w+)\s*=\s*(.+)/);
  if (assignmentMatch) {
    const [, varName, value] = assignmentMatch;
    return `This line assigns the value ${value.trim()} to the variable ${varName}`;
  }

  // Return statement
  if (trimmed.match(/^return\s+(.+)/)) {
    const returnValue = trimmed.match(/^return\s+(.+)/)[1];
    return `This line returns ${returnValue}`;
  }

  // If statement
  if (trimmed.match(/^if\s+(.+):/)) {
    const condition = trimmed.match(/^if\s+(.+):/)[1];
    return `This is an if statement checking if ${condition}`;
  }

  // For loop
  if (trimmed.match(/^for\s+(\w+)\s+in\s+(.+):/)) {
    const [, varName, iterable] = trimmed.match(/^for\s+(\w+)\s+in\s+(.+):/);
    return `This is a for loop that iterates over ${iterable} using ${varName}`;
  }

  // While loop
  if (trimmed.match(/^while\s+(.+):/)) {
    const condition = trimmed.match(/^while\s+(.+):/)[1];
    return `This is a while loop that runs while ${condition}`;
  }

  // Import statement
  if (trimmed.match(/^import\s+(.+)/)) {
    const module = trimmed.match(/^import\s+(.+)/)[1];
    return `This line imports the module ${module}`;
  }

  // From import
  if (trimmed.match(/^from\s+(.+)\s+import\s+(.+)/)) {
    const [, module, items] = trimmed.match(/^from\s+(.+)\s+import\s+(.+)/);
    return `This line imports ${items} from the module ${module}`;
  }

  // Print statement
  if (trimmed.match(/^print\(/)) {
    const printMatch = trimmed.match(/^print\((.+)\)/);
    if (printMatch) {
      const content = printMatch[1].trim();

      // Check if it's a string literal
      if (content.match(/^["']/)) {
        const stringContent = content.replace(/^["']|["']$/g, "");
        return `This line prints the text: ${stringContent}`;
      }

      // Check if it's a variable
      if (content.match(/^\w+$/)) {
        return `This line prints the value of the variable ${content}`;
      }

      // Check if it's an f-string
      if (content.startsWith('f"') || content.startsWith("f'")) {
        return `This line prints a formatted string with embedded variables`;
      }

      // Check if it's a function call
      if (content.match(/\w+\(/)) {
        const funcName = content.match(/(\w+)\(/)[1];
        return `This line prints the result of calling the function ${funcName}`;
      }

      // Multiple items
      if (content.includes(",")) {
        const items = content.split(",").length;
        return `This line prints ${items} items: ${content}`;
      }

      // Generic fallback
      return `This line prints: ${content}`;
    }
    return `This line prints output to the console`;
  }

  // Comment
  if (trimmed.startsWith("#")) {
    return `This is a comment that says: ${trimmed.substring(1).trim()}`;
  }

  // Could not parse - return null to trigger AI
  return null;
}

/**
 * Describes the content of the current line using either local parsing or AI
 */
async function describeCurrentLine() {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage("No active editor found.");
    return;
  }

  const cursorPosition = editor.selection.active;
  const currentLine = editor.document.lineAt(cursorPosition.line);
  const lineText = currentLine.text.trim();
  const languageId = editor.document.languageId;

  if (lineText === "") {
    vscode.window.showInformationMessage("The current line is empty.");
    await speakMessage("The current line is empty.");
    return;
  }

  vscode.window.showInformationMessage(`Analyzing line: ${lineText}`);
  await speakMessage("Analyzing the current line...");

  try {
    let description = null;

    // Only try local parsing for Python
    if (languageId === "python") {
      description = describePythonLine(
        lineText,
        cursorPosition.line,
        editor.document
      );
    }

    // If local parsing failed or language is C++, use AI
    if (!description) {
      const instructionPrompt =
        "Describe what this line of code does in one concise sentence.";
      description = await analyzeAI(lineText, instructionPrompt);
    }

    if (description) {
      vscode.window.showInformationMessage(`Description: ${description}`);
      await speakMessage(description);
    } else {
      vscode.window.showInformationMessage(
        "Could not generate a description for this line."
      );
      await speakMessage("Could not generate a description for this line.");
    }
  } catch (error) {
    console.error("Error analyzing line:", error);
    vscode.window.showErrorMessage(
      "An error occurred while analyzing the line."
    );
    await speakMessage("An error occurred while analyzing the line.");
  }
}

/**
 * Registers the command to describe the current line.
 */
function registerDescribeCurrentLineCommand(context) {
  const describeCurrentLineCommand = vscode.commands.registerCommand(
    "echocode.describeCurrentLine",
    async () => {
      await describeCurrentLine();
    }
  );

  context.subscriptions.push(describeCurrentLineCommand);
}

module.exports = { registerDescribeCurrentLineCommand };
