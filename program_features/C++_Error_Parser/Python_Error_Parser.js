const path = require("path");
const { exec } = require("child_process");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

// Function to parse terminal output for Python errors
function parsePythonErrors(terminalOutput) {
  const errorPatterns = [
    {
      regex: /IndentationError: (.*)/,
      explanation:
        "Python relies on indentation to define blocks of code. This error means your spacing is inconsistent.",
      fix: "Check your tabs and spaces. Ensure all code blocks inside loops, functions, or if-statements are indented equally.",
    },
    {
      regex: /SyntaxError: (.*)/,
      explanation:
        "This is a grammatical error in your code. You might be missing a colon, parenthesis, or quote.",
      fix: "Check the line mentioned for missing colons ':', unmatched parentheses '()', or unclosed strings.",
    },
    {
      regex: /NameError: name '(.*)' is not defined/,
      explanation:
        "You are trying to use a variable or function that hasn't been created yet.",
      fix: "Ensure the variable is defined before you use it, and check for spelling mistakes.",
    },
    {
      regex: /TypeError: (.*)/,
      explanation:
        "You are trying to perform an operation on a data type that doesn't support it (e.g., adding a number to a string).",
      fix: "Check the data types of your variables. You may need to cast one variable to match the other (e.g., str(number)).",
    },
    {
      regex: /ImportError: cannot import name '(.*)'/,
      explanation:
        "Python cannot find the specific function or class you are trying to import.",
      fix: "Check the spelling of the import and ensure the library is installed and supports that specific name.",
    },
    {
      regex: /ModuleNotFoundError: No module named '(.*)'/,
      explanation:
        "The library you are trying to import is not installed or the name is incorrect.",
      fix: "Run 'pip install <module_name>' in your terminal to install the missing library.",
    },
  ];

  const errors = [];
  const lines = terminalOutput.split("\n");

  // Updated regex: Captures filename (group 1) and line number (group 2)
  const fileLineRegex = /File\s+["']?(.*?)["']?,\s+line\s+(\d+)/;
  let currentLineNumber = "unknown";
  let currentFile = "unknown file";

  lines.forEach((line) => {
    const cleanLine = line.trim(); // Remove leading/trailing whitespace

    // 1. Try to find the file and line number context first
    const lineMatch = cleanLine.match(fileLineRegex);
    if (lineMatch) {
      currentFile = lineMatch[1]; // Capture the filename
      currentLineNumber = lineMatch[2]; // Capture the line number
      return;
    }

    // 2. Try to match specific error patterns
    errorPatterns.forEach((pattern) => {
      const match = cleanLine.match(pattern.regex);
      if (match) {
        errors.push({
          file: currentFile, // Store the file where the error occurred
          line: currentLineNumber,
          error: match[0],
          explanation: pattern.explanation,
          fix: pattern.fix,
        });
      }
    });
  });

  return errors;
}

// Function to analyze Python execution/compilation errors
function analyzePythonExecution(command) {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      // Python writes errors to stderr
      const errors = parsePythonErrors(stderr);

      if (errors.length === 0) {
        const errorMessage = "Python script failed with an unknown error.";
        console.log(errorMessage);
        speakMessage(errorMessage);
        console.log(stderr);
      } else {
        console.log("Python Errors Found:");
        let speechOutput = "Python Errors Found. ";

        errors.forEach((err) => {
          // Get the full filename for the console (e.g., "script.py")
          const fileName = path.basename(err.file);

          // For speech, remove the extension so it reads the name naturally (e.g., "script")
          // This prevents it from spelling out "s-c-r-i-p-t" or saying "dot p y"
          const spokenFileName = path.basename(
            err.file,
            path.extname(err.file)
          );

          const errorLocation = `In file ${fileName}, `;
          const spokenErrorLocation = `In file ${spokenFileName}, `;

          const errorLine = `Line ${err.line}: ${err.error}.`;
          const explanation = `Explanation: ${err.explanation}.`;
          const fix = `Potential Fix: ${err.fix}.`;

          console.log(errorLocation + errorLine);
          console.log(explanation);
          console.log(fix);
          console.log("---");

          // Use the cleaner spokenFileName for the audio output
          speechOutput += `${spokenErrorLocation} ${errorLine} ${explanation} ${fix} `;
        });

        speakMessage(speechOutput);
      }
    } else {
      const successMessage = "No syntax or runtime errors found.";
      console.log(successMessage);
      speakMessage(successMessage);
    }
  });
}

// Function to determine the current Python file and check it
function checkCurrentPythonFile(currentFilePath) {
  const fileExtension = path.extname(currentFilePath);

  if (fileExtension !== ".py") {
    const message = "This command can only be run from a Python file (.py).";
    console.error(message);
    speakMessage(message);
    return;
  }

  try {
    const fileName = path.basename(currentFilePath);

    // Command: python "file.py" (Runs code, catches runtime errors)
    const checkCommand = `python "${currentFilePath}"`;

    console.log(`Checking for errors in: ${fileName}`);
    analyzePythonExecution(checkCommand);
  } catch (e) {
    const errorMessage = "Failed to construct the python check command.";
    console.error(errorMessage, e);
    speakMessage(errorMessage);
  }
}

module.exports = {
  checkCurrentPythonFile,
};
