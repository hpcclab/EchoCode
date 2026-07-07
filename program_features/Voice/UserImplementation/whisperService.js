const builtIn = require("../whisperService");

module.exports = {
  // Customize behavior by wrapping these functions.
  startRecording: (...args) => builtIn.startRecording(...args),
  stopAndTranscribe: (...args) => builtIn.stopAndTranscribe(...args),
  selectMicrophone: (...args) => builtIn.selectMicrophone(...args),
  isRecording: (...args) => builtIn.isRecording(...args),
};
