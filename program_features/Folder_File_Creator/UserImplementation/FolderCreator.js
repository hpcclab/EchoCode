const builtIn = require("../FolderCreator");

function registerFolderCreatorCommand(context) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerFolderCreatorCommand(context);
}

module.exports = {
  registerFolderCreatorCommand,
};
