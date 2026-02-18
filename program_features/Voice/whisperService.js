const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, exec } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const vscode = require("vscode");

// Platform checks
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

ffmpeg.setFfmpegPath(ffmpegPath);

let current = null;

function makeTmpWav() {
  return path.join(os.tmpdir(), `echocode-${Date.now()}.wav`);
}

/**
 * Helper: List available audio devices based on OS
 */
function listAudioDevices(outputChannel) {
  return new Promise((resolve) => {
    // 1. Determine Command based on OS
    let cmd;
    if (isWin) {
      cmd = `"${ffmpegPath}" -list_devices true -f dshow -i dummy`;
    } else if (isMac) {
      // macOS uses AVFoundation
      cmd = `"${ffmpegPath}" -f avfoundation -list_devices true -i ""`;
    } else {
      // Linux/Other (Fallback not fully implemented)
      return resolve([]);
    }

    if (outputChannel)
      outputChannel.appendLine(
        `[Voice] detecting devices (${process.platform}): ${cmd}`
      );

    exec(cmd, (err, stdout, stderr) => {
      const rawOutput = stderr.toString(); // FFmpeg logs to stderr
      const deviceMatches = [];
      let isAudioSection = false;

      const lines = rawOutput.split("\n");

      // --- Windows Parsing (DirectShow) ---
      if (isWin) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // Regex checking: Look for lines ending in "(audio)"
          // Example: [dshow @ ...] "Microphone Array" (audio) or just: "Microphone Array" (audio)
          const audioMatch = line.match(/"([^"]+)"\s+\(audio\)$/);
          if (audioMatch) {
            const deviceName = audioMatch[1];
            if (!deviceMatches.includes(deviceName)) {
              deviceMatches.push(deviceName);
            }
            continue;
          }

          // Legacy section-based fallback (if headers exist)
          if (line.includes("DirectShow audio devices")) {
            isAudioSection = true;
            continue;
          }
          if (line.includes("DirectShow video devices")) {
            isAudioSection = false;
            continue;
          }

          if (isAudioSection) {
            if (line.includes("Alternative name")) continue;
            const quoteMatch = line.match(/"([^"]+)"/);
            if (quoteMatch) {
              const deviceName = quoteMatch[1];
              if (!deviceMatches.includes(deviceName)) {
                deviceMatches.push(deviceName);
              }
            }
          }
        }
      }
      // --- macOS Parsing (AVFoundation) ---
      else if (isMac) {
        lines.forEach((line) => {
          // 1. Detect Section Headers
          // AVFoundation output typically looks like: 
          // [AVFoundation indev @ 0x...] AVFoundation video devices:
          // [AVFoundation indev @ 0x...] [0] FaceTime HD Camera
          // [AVFoundation indev @ 0x...] AVFoundation audio devices:
          // [AVFoundation indev @ 0x...] [0] MacBook Pro Microphone

          if (line.includes("AVFoundation video devices")) {
            isAudioSection = false;
            return; // Skip the header line itself
          }
          if (line.includes("AVFoundation audio devices")) {
            isAudioSection = true;
            return; // Skip the header line itself
          }

          // 2. Parse Devices (only if inside audio section)
          if (isAudioSection) {
            // Match lines like: [AVFoundation...] [1] Microphone Name
            const match = line.match(/\[(\d+)\]\s+(.+)$/);

            // Ensuring no log lines are matched
            if (match && !line.includes("AVFoundation")) {
              // Handles raw output if ffmpeg output format varies
              deviceMatches.push(match[2].trim());
            } else if (line.includes("AVFoundation") && match) {
              // Strict matching to avoid log lines
              const strictMatch = line.match(/\[\d+\]\s+([^\[\]]+)$/);
              if (strictMatch) {
                deviceMatches.push(strictMatch[1].trim());
              }
            }
          }
        });
      }

      resolve(deviceMatches);
    });
  });
}

/**
 * Configurable microphone selection
 */
async function getMicrophoneName(context, outputChannel) {
  let savedMic = context.globalState.get("echoCodeMicrophone");
  if (!savedMic) {
    const devices = await listAudioDevices(outputChannel);
    if (devices.length > 0) {
      savedMic = devices[0];
      await context.globalState.update("echoCodeMicrophone", savedMic);
      if (outputChannel)
        outputChannel.appendLine(`[Voice] Auto-selected mic: "${savedMic}"`);
    } else {
      // DEFAULT FALLBACKS by OS
      savedMic = "default";
      if (outputChannel)
        outputChannel.appendLine("[Voice] Using system default mic.");
    }
  }
  return savedMic;
}

/**
 * Command to allow user to change microphone
 */
async function selectMicrophone(context) {
  const devices = await listAudioDevices(null);
  const items = [
    ...devices,
    "Enter Device Name Manually...",
    "Reset to Default",
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Select Microphone (${process.platform})`,
  });

  if (selected === "Reset to Default") {
    await context.globalState.update("echoCodeMicrophone", undefined); // Clear setting
    vscode.window.showInformationMessage("Microphone reset to system default.");
  } else if (selected === "Enter Device Name Manually...") {
    const promptText = isMac
      ? "Enter device index (e.g. :0 or :1)"
      : "Microphone (Realtek Audio)";
    const manualName = await vscode.window.showInputBox({
      placeHolder: isMac ? ":0" : "Device Name",
      prompt: `Enter device identifier for ${process.platform}.`,
    });
    if (manualName) {
      await context.globalState.update("echoCodeMicrophone", manualName);
      vscode.window.showInformationMessage(`Microphone set to: ${manualName}`);
    }
  } else if (selected) {
    // For Mac, if they picked a name, we might ideally match it to an index,
    // but often using the name fails in ffmpeg mac unless mapped.
    // For now, we save the name. Windows uses names, Mac often needs ":Index".
    // If usage fails on Mac with names, we default to ":0" in startRecording.
    await context.globalState.update("echoCodeMicrophone", selected);
    vscode.window.showInformationMessage(`Microphone set to: ${selected}`);
  }
}

/**
 * Start recording mic audio.
 */
async function startRecording(outputChannel, context) {
  if (current && !current.stopped) {
    outputChannel.appendLine("⚠️ Recording already in progress.");
    return false;
  }

  const tmpWav = makeTmpWav();
  const micName = await getMicrophoneName(context, outputChannel);

  let ffmpegArgs = [];

  // --- Windows Configuration ---
  if (isWin) {
    if (micName === "default") {
      outputChannel.appendLine(`[Voice] Error: No microphone found.`);
      vscode.window.showErrorMessage("EchoCode: No microphone found. Please check your audio settings.");
      return false;
    } else {
      outputChannel.appendLine(`[Voice] Using Microphone: "${micName}"`);
      ffmpegArgs = [
        "-f",
        "dshow",
        "-i",
        `audio=${micName}`,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-y",
        tmpWav,
      ];
    }
  }
  // --- macOS Configuration ---
  else if (isMac) {
    // On Mac, ":0" is usually the default selected input device in System Settings
    // If micName is "default", use ":0".
    // If micName is a specific device name, AVFoundation sometimes accepts names like ":Built-in Microphone" or needs index.
    // Safest generic start is usually mapping index 0.

    let devInput = ":0";
    if (micName !== "default" && micName.startsWith(":")) {
      devInput = micName; // User manually entered ":1" etc
    }

    outputChannel.appendLine(`[Voice] Using AVFoundation input: "${devInput}"`);

    ffmpegArgs = [
      "-f",
      "avfoundation",
      "-i",
      devInput,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-y",
      tmpWav,
    ];
  }

  outputChannel.appendLine(
    `[ffmpeg] Spawning with args: ${ffmpegArgs.join(" ")}`
  );

  // CRITICAL: Stdio must be 'pipe' for stdin to work (so we can send 'q')
  const rec = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  rec.stderr.on("data", (d) => {
    const msg = d.toString();
    if (
      msg.toLowerCase().includes("error") ||
      msg.toLowerCase().includes("failed")
    ) {
      outputChannel.appendLine("[ffmpeg error] " + msg);
    }
  });

  let stopResolver;
  const stopPromise = new Promise((resolve) => {
    stopResolver = resolve;
  });

  rec.on("close", (code) => {
    outputChannel.appendLine(`[ffmpeg] Process exited with code ${code}`);
    stopResolver(code);
  });

  rec.on("error", (err) => {
    outputChannel.appendLine("[ffmpeg fatal] " + err.message);
    stopResolver(-1);
  });

  current = {
    rec,
    tmpWav,
    stopped: false,
    stopPromise,
  };

  outputChannel.appendLine("🎙️ Recording started… Click again to stop.");
  return true;
}

/**
 * Stop recording and run local Whisper
 */
function stopAndTranscribe(outputChannel, globalState) {
  if (!outputChannel || typeof outputChannel.appendLine !== "function") {
    outputChannel = { appendLine: console.log };
  }

  return new Promise(async (resolve, reject) => {
    if (!current) return reject(new Error("No recording in progress."));

    current.stopped = true;
    const { rec, tmpWav, stopPromise } = current;

    outputChannel.appendLine("[Voice] Stopping recording...");

    try {
      if (rec.stdin && !rec.stdin.destroyed) {
        rec.stdin.write("q");
        rec.stdin.end();
      }
    } catch (e) {
      outputChannel.appendLine("[Voice] Note: Could not send 'q' to ffmpeg.");
    }

    // Process kill fallback
    const killTimeout = setTimeout(() => {
      if (current && current.rec) {
        outputChannel.appendLine("[Voice] Force killing ffmpeg...");
        try {
          process.kill(rec.pid, "SIGINT");
          setTimeout(() => rec.kill(), 200);
        } catch (e) { }
      }
    }, 1500);

    await stopPromise;
    clearTimeout(killTimeout);

    current = null;

    if (!fs.existsSync(tmpWav)) {
      return reject(new Error("Recording failed: WAV file not created."));
    }

    await new Promise((r) => setTimeout(r, 200));

    const stats = await fs.promises.stat(tmpWav);
    outputChannel.appendLine(`[Voice] Wav file size: ${stats.size} bytes`);

    if (stats.size < 1000) {
      return reject(new Error("Recording too short/empty."));
    }

    const pythonPath = globalState
      ? globalState.get("echoCodePythonPath")
      : "python"; // Default if not found

    runLocalWhisper(tmpWav, outputChannel, pythonPath).then(resolve, reject);
  });
}

function runLocalWhisper(tmpWav, outputChannel, pythonCommand) {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine(
      `Running Whisper using interpreter: '${pythonCommand}'...`
    );
    const pythonScript = path.join(__dirname, "local_whisper_stt.py");

    const py = spawn(pythonCommand, [pythonScript, tmpWav], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let transcript = "";

    py.stdout.on("data", (data) => {
      transcript += data.toString();
    });

    py.stderr.on("data", (data) => {
      outputChannel.appendLine(`[Whisper Log] ${data.toString()}`);
    });

    py.on("close", (code) => {
      fs.unlink(tmpWav, () => { });

      if (code !== 0) {
        return reject(new Error(`Whisper process exited with code ${code}`));
      }
      const clean = transcript.trim();
      resolve(clean);
    });

    py.on("error", (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}

/**
 * Check if recording is in progress
 */
function isRecording() {
  return current && !current.stopped;
}

module.exports = { startRecording, stopAndTranscribe, selectMicrophone, isRecording };
