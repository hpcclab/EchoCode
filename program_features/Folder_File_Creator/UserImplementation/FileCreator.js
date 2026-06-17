const builtIn = require("../FileCreator");

function registerFileCreatorCommand(context) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerFileCreatorCommand(context);
}

module.exports = {
  registerFileCreatorCommand,
};
