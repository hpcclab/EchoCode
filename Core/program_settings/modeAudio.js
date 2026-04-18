const vscode = require("vscode");
const { spawn } = require("child_process");
const { speakMessage } = require("./speech_settings/speechHandler");

// Simple promise chain = queue
let audioQueue = Promise.resolve();

function enqueue(fn) {
  audioQueue = audioQueue.then(fn).catch(() => {});
  return audioQueue;
}

function pingOnce() {
  return new Promise((resolve) => {
    try {
      const platform = process.platform;

      // Best-effort beep across OSes
      if (platform === "win32") {
        // SystemSounds.Asterisk
        const ps = spawn("powershell.exe", [
          "-NoProfile",
          "-Command",
          "[console]::beep(880,120)",
        ]);
        ps.on("close", () => resolve());
        ps.on("error", () => resolve());
        return;
      }

      if (platform === "darwin") {
        // macOS beep
        const p = spawn("osascript", ["-e", "beep 1"]);
        p.on("close", () => resolve());
        p.on("error", () => resolve());
        return;
      }

      // linux/others: terminal bell fallback (may or may not make sound)
      process.stdout.write("\x07");
      resolve();
    } catch {
      resolve();
    }
  });
}

function announceMode(mode, outputChannel) {
  const label = mode === "dev" ? "Developer mode" : "Student mode";

  return enqueue(async () => {
    await pingOnce();

    // Use your existing TTS pipeline
    try {
      await speakMessage(`EchoCode is in ${label}.`, outputChannel);
    } catch {
      // If TTS fails, at least show a notification
      vscode.window.showInformationMessage(`EchoCode: ${label}`);
    }
  });
}

module.exports = { announceMode };