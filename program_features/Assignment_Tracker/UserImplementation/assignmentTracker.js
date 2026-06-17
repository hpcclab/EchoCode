const builtIn = require("../assignmentTracker");

function registerAssignmentTrackerCommands(context) {
  // Customize behavior here before/after built-in registration.
  return builtIn.registerAssignmentTrackerCommands(context);
}

module.exports = {
  registerAssignmentTrackerCommands,
};
