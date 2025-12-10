const vscode = require("vscode");
const say = require("say");

let speechSpeed = 1.0;
let isSpeaking = false;
let currentSpeechProcess = null;

// Load saved speech speed from VS Code settings
function loadSavedSpeechSpeed() {
  const config = vscode.workspace.getConfiguration("echocode");
  speechSpeed = config.get("speechSpeed") || 1.0;
}

// Save speech speed to VS Code settings
function saveSpeechSpeed() {
  const config = vscode.workspace.getConfiguration("echocode");
  config.update("speechSpeed", speechSpeed, true);
}

// Increase speech speed
function increaseSpeechSpeed() {
  speechSpeed = Math.min(2.0, speechSpeed + 0.1);
  saveSpeechSpeed();
  return speechSpeed;
}

// Decrease speech speed
function decreaseSpeechSpeed() {
  speechSpeed = Math.max(0.5, speechSpeed - 0.1);
  saveSpeechSpeed();
  return speechSpeed;
}

// Get current speech speed
function getSpeechSpeed() {
  return speechSpeed;
}

// Speak a message aloud
function speakMessage(message) {
  return new Promise((resolve, reject) => {
    if (isSpeaking) {
      stopSpeaking();
    }

    isSpeaking = true;

    // Get the configured voice from settings
    const config = vscode.workspace.getConfiguration("echocode");
    const voice = config.get("voice") || null; // Use default if not specified

    // Use say.js to speak the message with the configured voice
    say.speak(message, voice, speechSpeed, (err) => {
      isSpeaking = false;
      currentSpeechProcess = null;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });

    // Store the speech process
    currentSpeechProcess = say;
  });
}

// Stop speaking
function stopSpeaking() {
  if (isSpeaking && currentSpeechProcess) {
    currentSpeechProcess.stop();
    isSpeaking = false;
    currentSpeechProcess = null;
    return true;
  }
  return false;
}

// Register speech-related commands
function registerSpeechCommands(context, outputChannel) {
  // Register speech speed control commands
  const increaseSpeechSpeedCmd = vscode.commands.registerCommand(
    "echocode.increaseSpeechSpeed",
    () => {
      const newSpeed = increaseSpeechSpeed();
      const message = `Speech speed increased to ${newSpeed.toFixed(1)}x`;
      vscode.window.showInformationMessage(message);
      outputChannel.appendLine(message);
      // Optionally announce it verbally
      speakMessage(`Speed set to ${newSpeed.toFixed(1)} times normal.`);
    }
  );

  const decreaseSpeechSpeedCmd = vscode.commands.registerCommand(
    "echocode.decreaseSpeechSpeed",
    () => {
      const newSpeed = decreaseSpeechSpeed();
      const message = `Speech speed decreased to ${newSpeed.toFixed(1)}x`;
      vscode.window.showInformationMessage(message);
      outputChannel.appendLine(message);
      // Optionally announce it verbally
      speakMessage(`Speed set to ${newSpeed.toFixed(1)} times normal.`);
    }
  );

  // Register command to stop speech
  const stopSpeechCmd = vscode.commands.registerCommand(
    "echocode.stopSpeech",
    async () => {
      const wasSpeaking = stopSpeaking();
      if (wasSpeaking) {
        vscode.window.showInformationMessage("Speech stopped");
        outputChannel.appendLine("Speech stopped by user");
      }
    }
  );

  // Add the commands to subscriptions
  context.subscriptions.push(
    increaseSpeechSpeedCmd,
    decreaseSpeechSpeedCmd,
    stopSpeechCmd
  );
}

module.exports = {
  speakMessage,
  stopSpeaking,
  increaseSpeechSpeed,
  decreaseSpeechSpeed,
  getSpeechSpeed,
  loadSavedSpeechSpeed,
  registerSpeechCommands,
};
