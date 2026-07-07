const path = require("path");
const { exec } = require("child_process");
const sound = require("sound-play");
const {
  speakMessage,
} = require("../../../Core/program_settings/speech_settings/speechHandler");
const {
  formatHelpByGuidance,
} = require("../../../Core/program_settings/guide_settings/guidanceLevel");

function getPythonCommand() {
  return process.platform === "win32" ? "python" : "python3";
}

function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || "",
        stderr: stderr || "",
        error,
      });
    });
  });
}

function extractErrorDetails(stderrText, fallbackFile) {
  const lines = String(stderrText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let file = path.basename(fallbackFile);
  let line = "unknown";
  let summary = "Python execution failed.";
  let raw = lines.slice(-6).join(" | ");

  for (const value of lines) {
    const fileMatch = value.match(/File\s+"([^"]+)",\s+line\s+(\d+)/);
    if (fileMatch) {
      file = path.basename(fileMatch[1]);
      line = fileMatch[2];
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^[A-Za-z_]+(?:Error|Exception):/.test(lines[i])) {
      summary = lines[i];
      break;
    }
  }

  return {
    where: `Alternative parser in ${file}, line ${line}`,
    summary,
    raw,
  };
}

async function playAlternativePing() {
  const pingPath = path.resolve(__dirname, "../../../audio_pings/ping1.wav");

  try {
    await sound.play(pingPath);
  } catch (error) {
    console.error("[Alt Python Parser] Ping playback failed:", error.message);
  }
}

async function checkCurrentPythonFile(currentFilePath) {
  if (path.extname(currentFilePath) !== ".py") {
    const msg = "This alternative checker only runs on Python files.";
    console.error(msg);
    await speakMessage(msg);
    await playAlternativePing();
    return;
  }

  const pythonCmd = getPythonCommand();
  const escapedPath = currentFilePath.replace(/"/g, '\\"');

  try {
    // Alternative strategy: compile first (syntax-only), then execute (runtime).
    const syntaxResult = await runCommand(
      `${pythonCmd} -m py_compile "${escapedPath}"`,
    );

    if (!syntaxResult.ok) {
      const details = extractErrorDetails(syntaxResult.stderr, currentFilePath);
      const spoken = formatHelpByGuidance({
        where: details.where,
        summary: `[Alternative parser] ${details.summary}`,
        raw: details.raw,
        ruleHint:
          "Compilation failed before runtime, indicating a syntax-level issue.",
        suggestions: [
          "Fix syntax first, then rerun the checker.",
          "Check indentation, colons, and unmatched quotes or parentheses.",
        ],
      });

      console.error("[Alt Python Parser] Syntax check failed.");
      await speakMessage(spoken);
      return;
    }

    const runtimeResult = await runCommand(`${pythonCmd} "${escapedPath}"`);

    if (!runtimeResult.ok) {
      const details = extractErrorDetails(
        runtimeResult.stderr,
        currentFilePath,
      );
      const spoken = formatHelpByGuidance({
        where: details.where,
        summary: `[Alternative parser] ${details.summary}`,
        raw: details.raw,
        ruleHint:
          "Runtime execution failed after successful syntax compilation.",
        suggestions: [
          "Inspect variables and imports used near the reported line.",
          "Add temporary prints or use the debugger to inspect values.",
        ],
      });

      console.error("[Alt Python Parser] Runtime check failed.");
      await speakMessage(spoken);
      return;
    }

    const success =
      "Alternative parser: no syntax or runtime errors found in the current Python file.";
    console.log("[Alt Python Parser]", success);
    await speakMessage(success);
  } catch (error) {
    const failedMessage =
      "Alternative parser could not complete the Python check.";
    console.error("[Alt Python Parser]", error);
    await speakMessage(failedMessage);
  } finally {
    await playAlternativePing();
  }
}

module.exports = {
  checkCurrentPythonFile,
};
