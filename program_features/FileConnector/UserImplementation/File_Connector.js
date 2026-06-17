const builtIn = require("../File_Connector");

function registerFileConnectorCommands(context, vscode) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerFileConnectorCommands(context, vscode);
}

module.exports = {
  registerFileConnectorCommands,
};
