const builtIn = require("../CPP_Error_Parser");

function compileCurrentCppFile(filePath) {
  // Customize behavior here before/after built-in logic.
  return builtIn.compileCurrentCppFile(filePath);
}

module.exports = {
  compileCurrentCppFile,
};
