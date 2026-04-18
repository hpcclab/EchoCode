const vscode = require("vscode");

function getMode() {
  return vscode.workspace
    .getConfiguration("echocode")
    .get("mode", "student");
}

async function refreshModeContext() {
  const mode = getMode();
  const isDev = mode === "dev";

  await vscode.commands.executeCommand("setContext", "echocode:isDev", isDev);
  await vscode.commands.executeCommand("setContext", "echocode:isStudent", !isDev);

  return mode;
}

function onModeChange(handler) {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("echocode.mode")) {
      handler();
    }
  });
}

module.exports = {
  getMode,
  refreshModeContext,
  onModeChange,
};
