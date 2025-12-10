// Core/diagnostics/diagnosticManager.js
const vscode = require("vscode");
const { pickAdapter } = require("../../Language/registry");

async function collectDiagnostics(doc) {
  const core = vscode.languages.getDiagnostics(doc.uri);
  const adapter = pickAdapter(doc.languageId);
  const extras = adapter?.extraDiagnostics ? await adapter.extraDiagnostics(doc) : [];
  return [...core, ...extras];
}

module.exports = { collectDiagnostics };
