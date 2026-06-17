const builtIn = require("../bigOAnalysis");

function registerBigOCommand(context) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerBigOCommand(context);
}

module.exports = {
  registerBigOCommand,
};
