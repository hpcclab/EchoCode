const builtIn = require("../annotations");

function registerAnnotationCommands(context, outputChannel) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerAnnotationCommands(context, outputChannel);
}

module.exports = {
  registerAnnotationCommands,
};
