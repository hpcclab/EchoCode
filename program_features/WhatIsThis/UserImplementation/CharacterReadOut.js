const builtIn = require("../CharacterReadOut");

function registerCharacterReadOutCommand(context) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerCharacterReadOutCommand(context);
}

module.exports = {
  registerCharacterReadOutCommand,
};
