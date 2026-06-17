const builtIn = require("../voiceCommandRouter");

module.exports = {
  // Customize behavior by wrapping these functions.
  getFriendlyLanguageName: (...args) =>
    builtIn.getFriendlyLanguageName(...args),
  tryExecuteVoiceCommand: (...args) => builtIn.tryExecuteVoiceCommand(...args),
};
