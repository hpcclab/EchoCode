const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");
const path = require("path");
const vscode = require("vscode");
const fs = require("fs");

let copiedSymbol = null; // Will store { filePath, functionName, extension, functionSignature }

function _baseFunctionName(name) {
  return name.replace(/\(.*$/, "").trim();
}

/**
 * Generates an absolute import statement for a Python function from the workspace root.
 */
function _generatePythonImport(sourcePath, functionName) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(sourcePath)
  );
  if (!workspaceFolder) {
    // Cannot determine absolute path without a workspace
    return `# Could not determine workspace root. Please add manually.\nfrom ${path.basename(
      sourcePath,
      ".py"
    )} import ${functionName}`;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const relativePathFromRoot = path.relative(workspaceRoot, sourcePath);

  // Convert the file path to Python's dot-separated module path
  const modulePath = relativePathFromRoot
    .replace(/\.py$/, "")
    .replace(/[\\/]/g, ".");

  return `from ${modulePath} import ${functionName}`;
}

/**
 * Extracts the function signature from the source C++ file.
 * Produces something like: "void greet(std::string)" (no trailing extra "()").
 */
function _extractCppFunctionSignature(sourcePath, functionName) {
  try {
    const fileContent = fs.readFileSync(sourcePath, "utf8");
    const lines = fileContent.split("\n");
    const targetName = _baseFunctionName(functionName);

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Skip non-candidates quickly
      if (
        !line.includes(targetName) ||
        line.startsWith("//") ||
        line.startsWith("#")
      ) {
        continue;
      }

      // Must look like a definition (has "(" and not a mere declaration end with ";")
      if (!line.includes("(") || line.endsWith(";")) continue;

      // Accumulate until we see "{"
      let signature = line;
      let j = i;
      while (!signature.includes("{") && j < lines.length - 1) {
        j++;
        signature += " " + lines[j].trim();
      }

      // Trim after "{"
      signature = signature.split("{")[0].trim();

      // Find the '(' that belongs to the function name occurrence
      const nameIdx = signature.lastIndexOf(targetName);
      if (nameIdx === -1) continue;

      const openIdx = signature.indexOf("(", nameIdx);
      if (openIdx === -1) continue;

      // Walk to the matching ')'
      let depth = 0;
      let closeIdx = -1;
      for (let k = openIdx; k < signature.length; k++) {
        const ch = signature[k];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            closeIdx = k;
            break;
          }
        }
      }
      if (closeIdx === -1) continue;

      // Keep everything up to the closing ')'
      let cleaned = signature.substring(0, closeIdx + 1).trim();

      // Remove accidental trailing ")()"
      cleaned = cleaned.replace(/\)\s*\(\s*\)\s*$/, ")");

      // Optional: collapse multiple spaces
      cleaned = cleaned.replace(/\s+/g, " ").trim();

      return cleaned;
    }

    // Fallback
    return `void ${_baseFunctionName(functionName)}()`;
  } catch (err) {
    console.error("Error extracting function signature:", err);
    return `void ${_baseFunctionName(functionName)}()`;
  }
}

/**
 * Extracts necessary #include statements from the source C++ file
 */
function _extractCppIncludes(sourcePath) {
  try {
    const fileContent = fs.readFileSync(sourcePath, "utf8");
    const lines = fileContent.split("\n");
    const includes = [];

    // Extract all #include statements from the source file
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#include")) {
        includes.push(trimmed);
      }
    }

    return includes;
  } catch (error) {
    console.error("Error extracting includes:", error);
    return [];
  }
}

/**
 * Creates or updates a .h file with the function declaration
 */
function _ensureCppHeader(sourcePath, functionName, functionSignature) {
  const headerPath = sourcePath.replace(/\.cpp$/, ".h");
  const headerFileName = path.basename(headerPath);
  const includeGuard = headerFileName
    .toUpperCase()
    .replace(/\./g, "_")
    .replace(/-/g, "_");

  try {
    let headerContent;
    const declaration = `${functionSignature};`;
    const includes = _extractCppIncludes(sourcePath);

    if (!fs.existsSync(headerPath)) {
      // Create new header file with include guards and necessary includes
      let includesSection = "";
      if (includes.length > 0) {
        includesSection = includes.join("\n") + "\n\n";
      }

      headerContent = `#ifndef ${includeGuard}\n#define ${includeGuard}\n\n${includesSection}${declaration}\n\n#endif // ${includeGuard}\n`;
      fs.writeFileSync(headerPath, headerContent, "utf8");
      console.log(`Created header file: ${headerPath}`);
    } else {
      // Add to existing header file
      headerContent = fs.readFileSync(headerPath, "utf8");

      // Add missing includes
      let modifiedContent = headerContent;
      let includesAdded = false;

      for (const include of includes) {
        if (!modifiedContent.includes(include)) {
          // Find position after #define to insert includes
          const defineMatch = modifiedContent.match(/#define\s+\w+\s*\n/);
          if (defineMatch) {
            const insertPos =
              modifiedContent.indexOf(defineMatch[0]) + defineMatch[0].length;
            modifiedContent =
              modifiedContent.slice(0, insertPos) +
              `${include}\n` +
              modifiedContent.slice(insertPos);
            includesAdded = true;
          }
        }
      }

      // Check if declaration already exists
      if (!modifiedContent.includes(declaration)) {
        // Insert before the #endif
        const endifIndex = modifiedContent.lastIndexOf("#endif");
        if (endifIndex !== -1) {
          modifiedContent =
            modifiedContent.slice(0, endifIndex) +
            `${declaration}\n\n` +
            modifiedContent.slice(endifIndex);
        }
      }

      // Write if any changes were made
      if (includesAdded || !headerContent.includes(declaration)) {
        fs.writeFileSync(headerPath, modifiedContent, "utf8");
        console.log(`Updated header file: ${headerPath}`);
      } else {
        console.log(`Declaration already exists in header: ${headerPath}`);
      }
    }

    return headerPath;
  } catch (error) {
    console.error("Error creating/updating header file:", error);
    throw error;
  }
}

/**
 * Generates a C++ include directive for the header file
 */
function _generateCppImport(
  sourcePath,
  destPath,
  functionName,
  functionSignature
) {
  // First, ensure the header file exists and contains the function declaration
  const headerPath = _ensureCppHeader(
    sourcePath,
    functionName,
    functionSignature
  );

  // Generate relative path from destination to header
  const relativePath = path.relative(path.dirname(destPath), headerPath);
  const normalizedPath = relativePath.replace(/\\/g, "/");

  return `#include "${normalizedPath}"`;
}

/**
 * Generates a C++ include directive for a header file (.h)
 */
function _generateCppHeaderInclude(sourcePath, destPath) {
  const relativePath = path.relative(path.dirname(destPath), sourcePath);
  const normalizedPath = relativePath.replace(/\\/g, "/");
  return `#include "${normalizedPath}"`;
}

/**
 * Generates an import statement by dispatching to a language-specific function.
 */
function connectFunction(
  sourcePath,
  destPath,
  functionName,
  extension,
  functionSignature
) {
  if (extension === ".py") {
    return _generatePythonImport(sourcePath, functionName);
  }
  if (extension === ".cpp") {
    return _generateCppImport(
      sourcePath,
      destPath,
      functionName,
      functionSignature
    );
  }
  if (extension === ".h" && destPath.endsWith(".cpp")) {
    // Importing a header into a cpp file
    return _generateCppHeaderInclude(sourcePath, destPath);
  }
  throw new Error(`Unsupported file type: ${extension}`);
}

/**
 * Finds the function symbol at the given cursor position.
 */
function findFunctionAtPosition(symbols, position) {
  for (const symbol of symbols) {
    if (symbol.range.contains(position)) {
      if (symbol.kind === vscode.SymbolKind.Function) {
        // Recurse to find the most specific nested function
        return findFunctionAtPosition(symbol.children, position) || symbol;
      }
      const childSymbol = findFunctionAtPosition(symbol.children, position);
      if (childSymbol) return childSymbol;
    }
  }
  return null;
}

function areExtensionsCompatible(source, dest) {
  const sourceExt = source.split(".").pop().toLowerCase();
  const destExt = dest.split(".").pop().toLowerCase();

  // Allow .h into .cpp, .cpp into .cpp, .py into .py
  if ((sourceExt === "h" && destExt === "cpp") || sourceExt === destExt) {
    return true;
  }
  return false;
}

function registerFileConnectorCommands(context, vscode) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "echocode.copyFileNameForImport",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("No active editor.");
          return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        const extension = path.extname(document.uri.fsPath).toLowerCase();
        const symbols = await vscode.commands.executeCommand(
          "vscode.executeDocumentSymbolProvider",
          document.uri
        );

        if (!symbols || symbols.length === 0) {
          vscode.window.showWarningMessage("Could not analyze file structure.");
          return;
        }

        const funcSymbol = findFunctionAtPosition(symbols, position);

        if (funcSymbol) {
          copiedSymbol = {
            filePath: document.uri.fsPath,
            functionName: funcSymbol.name,
            extension: extension,
          };

          // For C++, extract the function signature
          if (extension === ".cpp") {
            copiedSymbol.functionSignature = _extractCppFunctionSignature(
              document.uri.fsPath,
              funcSymbol.name
            );
          }

          const message = `Copied function "${
            funcSymbol.name
          }" from ${path.basename(document.uri.fsPath)}`;
          vscode.window.showInformationMessage(message);
          await speakMessage(message);
        } else {
          const message = "No function found at the current cursor position.";
          vscode.window.showWarningMessage(message);
          await speakMessage(message);
        }
      }
    ),
    vscode.commands.registerCommand(
      "echocode.pasteImportAtCursor",
      async () => {
        if (!copiedSymbol) {
          vscode.window.showWarningMessage("No function copied.");
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("No active editor.");
          return;
        }
        const document = editor.document;
        const destinationFilePath = document.uri.fsPath;
        const destinationFile = path.basename(destinationFilePath);
        const sourceFile = path.basename(copiedSymbol.filePath);

        if (!areExtensionsCompatible(sourceFile, destinationFile)) {
          const errorMsg = `Cannot import from ${sourceFile} into ${destinationFile}: incompatible file types.`;
          vscode.window.showWarningMessage(errorMsg);
          await speakMessage(errorMsg);
          return;
        }

        await editor.edit(async (editBuilder) => {
          const importStatement = connectFunction(
            copiedSymbol.filePath,
            destinationFilePath,
            copiedSymbol.functionName,
            copiedSymbol.extension,
            copiedSymbol.functionSignature
          );

          // Special handling for Python sys.path
          if (copiedSymbol.extension === ".py") {
            const fileContent = document.getText();
            const lines = fileContent.split("\n");
            const preambleLines = [
              "import sys",
              "import os",
              "sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))",
            ];

            // Find and delete any existing preamble lines to avoid duplication
            for (let i = 0; i < lines.length; i++) {
              const lineText = lines[i].trim();
              if (
                preambleLines.some((preambleLine) =>
                  lineText.includes(preambleLine.trim())
                )
              ) {
                const range = new vscode.Range(i, 0, i + 1, 0);
                editBuilder.delete(range);
              }
            }

            // Insert the full, correctly-ordered preamble at the top of the file
            const fullPreamble = preambleLines.join("\n") + "\n\n";
            editBuilder.insert(new vscode.Position(0, 0), fullPreamble);
          }

          // For C++, check if include already exists
          if (copiedSymbol.extension === ".cpp") {
            const fileContent = document.getText();
            if (!fileContent.includes(importStatement)) {
              // Insert at the top of the file with other includes
              editBuilder.insert(
                new vscode.Position(0, 0),
                importStatement + "\n"
              );
            }
          } else {
            // For Python, insert at cursor
            editBuilder.insert(editor.selection.active, importStatement + "\n");
          }
        });

        const message = `Imported function "${copiedSymbol.functionName}" into ${destinationFile}`;
        vscode.window.showInformationMessage(message);
        await speakMessage(message);
      }
    )
  );
}

module.exports = {
  registerFileConnectorCommands,
};
