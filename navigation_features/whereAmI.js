const vscode = require("vscode"); // VSCode API
const {
  speakMessage,
} = require("../Core/program_settings/speech_settings/speechHandler");
const { analyzeAI } = require("../Core/program_settings/program_settings/AIrequest");

async function describeCursorPosition(editor) {
  const document = editor.document;
  const cursorPos = editor.selection.active;
  const cursorLineNo = cursorPos.line;
  const cursorColNo = cursorPos.character;

  const symbols = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    document.uri
  );

  // Collect nested symbols from outermost to innermost
  function getSymbolAncestry(symbols, position, ancestry = []) {
    for (const symbol of symbols) {
      const contains = symbol.range.contains(position);
      const isOnHeaderLine = position.line === symbol.range.start.line;

      if (contains || isOnHeaderLine) {
        ancestry.push(symbol);
        return getSymbolAncestry(symbol.children || [], position, ancestry);
      }
    }
    return ancestry;
  }

  const ancestry = getSymbolAncestry(symbols || [], cursorPos);

  if (ancestry.length > 0) {
    // Format: innermost first, outermost last
    const levels = ancestry
      .map((symbol) => {
        const kind = vscode.SymbolKind[symbol.kind].toLowerCase();
        return `${kind} "${symbol.name}"`;
      })
      .reverse();

    const context = levels.join(", inside ");
    const message = `You are inside ${context}, at line ${
      cursorLineNo + 1
    }, column ${cursorColNo + 1}.`;

    console.log(message);
    await speakMessage(message);
  } else {
    // Assume the user is in global scope
    const message = `You are inside global scope, at line ${cursorLineNo + 1}`;
    console.log(message);
    await speakMessage(message);
  }
}

function registerWhereAmICommand(context) {
  const whereAmI = vscode.commands.registerCommand("echocode.whereAmI", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === "python") {
      describeCursorPosition(editor);
    }
  });

  context.subscriptions.push(whereAmI);
}

module.exports = { registerWhereAmICommand };
