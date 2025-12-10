// Core/Summarizer/codeParser.js
const vscode = require('vscode');

class Selection {
  firstLine = null;
  lastLine = null;
  cursorInSelection = true;
  blockType; // 'class' | 'function'
  name = '';
  text = '';
  selectionInClass = false;

  constructor(blockType) {
    this.blockType = blockType; // 'class' or 'function'
  }

  async detectCurrentBlock(editor) {
    const doc = editor.document;
    const cursor = editor.selection.active;

    // 1) Ask the language server for symbols (works across languages)
    const symbols = await vscode.commands.executeCommand(
      'vscode.executeDocumentSymbolProvider',
      doc.uri
    ) || [];

    // 2) Flatten recursive symbol tree
    const flat = [];
    (function walk(list, parents = []) {
      for (const s of list || []) {
        flat.push({ sym: s, parents });
        if (s.children && s.children.length) walk(s.children, parents.concat(s));
      }
    })(symbols);

    // 3) Map desired kinds
    const wantKind = this.blockType === 'class'
      ? vscode.SymbolKind.Class
      : [vscode.SymbolKind.Function, vscode.SymbolKind.Method];

    // 4) Find the *innermost* symbol at cursor of the desired kind
    const containing = flat
      .filter(({ sym }) => inRange(cursor, sym.range))
      .filter(({ sym }) =>
        Array.isArray(wantKind) ? wantKind.includes(sym.kind) : sym.kind === wantKind
      )
      .sort((a, b) => rangeSize(a.sym.range) - rangeSize(b.sym.range))[0];

    if (!containing) {
      this.cursorInSelection = false;
      return;
    }

    const { sym, parents } = containing;
    this.name = sym.name;
    this.firstLine = doc.lineAt(sym.range.start.line);
    this.lastLine  = doc.lineAt(sym.range.end.line);
    this.text = doc.getText(sym.range);

    // optional: mark whether this symbol sits inside a class
    this.selectionInClass = parents.some(p => p.kind === vscode.SymbolKind.Class);
  }
}

// helpers
function inRange(pos, range) {
  const s = range.start, e = range.end;
  if (pos.line < s.line || pos.line > e.line) return false;
  if (pos.line === s.line && pos.character < s.character) return false;
  if (pos.line === e.line && pos.character > e.character) return false;
  return true;
}
function rangeSize(range) {
  return (range.end.line - range.start.line) * 10000 + (range.end.character - range.start.character);
}

module.exports = { Selection };
