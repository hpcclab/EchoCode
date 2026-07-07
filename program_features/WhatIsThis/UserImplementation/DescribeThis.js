const builtIn = require("../DescribeThis");

function registerDescribeCurrentLineCommand(context) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerDescribeCurrentLineCommand(context);
}

module.exports = {
  registerDescribeCurrentLineCommand,
};
