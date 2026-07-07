const builtIn = require("../Chat_Tutor");

function registerChatCommands(context, outputChannel) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerChatCommands(context, outputChannel);
}

module.exports = {
  registerChatCommands,
};
