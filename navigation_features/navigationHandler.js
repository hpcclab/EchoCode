// navigation_features/navigationHandler.js
const vscode = require("vscode");
const {
  speakMessage,
} = require("../Core/program_settings/speech_settings/speechHandler");

let lastTimeout = null;

function flattenSymbols(symbols, parent = []) {
  const out = [];
  for (const s of symbols || []) {
    out.push({ ...s, parent });
    if (s.children && s.children.length) {
      out.push(...flattenSymbols(s.children, parent.concat(s)));
    }
  }
  return out;
}

function isJumpableKind(kind) {
  const K = vscode.SymbolKind;
  return (
    kind === K.Function ||
    kind === K.Method ||
    kind === K.Constructor ||
    kind === K.Class ||
    kind === K.Struct
  );
}

function prettyName(sym) {
  // Build a breadcrumb like Class::method if parent exists
  const chain = (sym.parent || [])
    .map(p => (p.name || "").trim())
    .filter(Boolean);
  if (sym.name) chain.push(sym.name.trim());
  return chain.join("::") || "(unnamed)";
}

function getPositionFromRange(document, range) {
  // Some providers can return undefined ranges; guard it
  if (range && range.start) return range.start;
  try {
    // Fallback: use start of document
    return new vscode.Position(0, 0);
  } catch {
    return new vscode.Position(0, 0);
  }
}

async function getJumpTargets(document) {
  // Ask the language service for symbols
  /** @type {import('vscode').DocumentSymbol[]} */
  const symbols =
    (await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    )) || [];

  if (symbols.length > 0) {
    const flat = flattenSymbols(symbols)
      .filter(s => isJumpableKind(s.kind))
      .map(s => ({
        position: getPositionFromRange(document, s.range),
        name: prettyName(s),
      }))
      // sort by position in file
      .sort((a, b) =>
        a.position.line === b.position.line
          ? a.position.character - b.position.character
          : a.position.line - b.position.line
      );

    if (flat.length) return flat;
  }

  // Fallback: your Python-only regex (kept so it still works in minimal envs)
  const text = document.getText();
  const re = /^(def |class )(\w+)/gm;
  const positions = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    positions.push({
      position: document.positionAt(match.index),
      name: match[2],
    });
  }
  return positions;
}

async function moveCursorToSymbol(direction) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const targets = await getJumpTargets(document);

  if (!targets.length) {
    vscode.window.showInformationMessage("No symbols found to jump to.");
    return;
  }

  const current = editor.selection.active;
  let target = null;

  if (direction === "next") {
    for (const t of targets) {
      if (t.position.isAfter(current)) {
        target = t;
        break;
      }
    }
  } else {
    for (let i = targets.length - 1; i >= 0; i--) {
      if (targets[i].position.isBefore(current)) {
        target = targets[i];
        break;
      }
    }
  }

  if (!target) {
    vscode.window.showInformationMessage(
      `No ${direction === "next" ? "next" : "previous"} symbol.`
    );
    return;
  }

  editor.selection = new vscode.Selection(target.position, target.position);
  editor.revealRange(new vscode.Range(target.position, target.position));

  if (lastTimeout) clearTimeout(lastTimeout);
  lastTimeout = setTimeout(() => {
    speakMessage(
      `Moved ${direction === "next" ? "next" : "previous"} to ${target.name}.`
    );
  }, 300);
}

function registerMoveCursor(context) {
  const nextCmd = vscode.commands.registerCommand(
    "echocode.jumpToNextFunction",
    () => moveCursorToSymbol("next")
  );
  const prevCmd = vscode.commands.registerCommand(
    "echocode.jumpToPreviousFunction",
    () => moveCursorToSymbol("previous")
  );
  context.subscriptions.push(nextCmd, prevCmd);
}

module.exports = { registerMoveCursor };
