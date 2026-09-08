const vscode = require("vscode");
const { spawn, exec } = require("child_process");

/**
 * Why a lint run failed. The caller needs to tell these apart: a missing toolchain is a
 * one-time setup problem to prompt about once, whereas a genuine pylint failure is worth
 * reporting every time. Previously every failure looked the same, so a user without
 * pylint got an error toast on every single save.
 */
const PYLINT_NOT_INSTALLED = "pylint-not-installed";
const PYTHON_NOT_FOUND = "python-not-found";
const PYLINT_TIMED_OUT = "pylint-timed-out";
const PYLINT_FAILED = "pylint-failed";

// Interpreter to invoke. Windows installs it as `python`; elsewhere `python` may be a
// Python 2 stub or absent, so `python3` is the safe name.
function pythonCommand() {
  return process.platform === "win32" ? "python" : "python3";
}

function lintError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Offers to install pylint. Callers are responsible for showing this at most once —
 * see the `notifiedMissingPylint` latch in errorHandler.
 */
function promptToInstallPylint() {
  return vscode.window
    .showWarningMessage(
      "EchoCode: Pylint is not installed, so Python errors cannot be read aloud.",
      "How do I install it?"
    )
    .then((selection) => {
      if (selection === "How do I install it?") {
        vscode.commands.executeCommand("workbench.action.terminal.new");
        vscode.window.showInformationMessage(
          `Run: ${pythonCommand()} -m pip install pylint`
        );
      }
    });
}

/**
 * Resolves true when pylint can actually be run. Cached after the first probe: this
 * spawns an interpreter, and re-checking on every save is exactly the cost we are
 * trying to avoid. Call `resetPylintAvailability()` after the user installs it.
 */
let availabilityProbe = null;

function isPylintAvailable() {
  if (availabilityProbe) return availabilityProbe;

  availabilityProbe = new Promise((resolve) => {
    exec(`${pythonCommand()} -m pylint --version`, (error) => {
      resolve(!error);
    });
  });

  return availabilityProbe;
}

function resetPylintAvailability() {
  availabilityProbe = null;
}

/**
 * Kept for backwards compatibility with callers that just want the prompt behaviour.
 * Resolves true when pylint is present, false when the user was prompted instead.
 */
async function ensurePylintInstalled() {
  if (await isPylintAvailable()) return true;
  await promptToInstallPylint();
  return false;
}

/**
 * Runs Pylint on the given file and parses the output.
 * @param {string} filePath - The path of the Python file to analyze.
 * @param {object} [outputChannel] - Optional output channel for logging.
 * @returns {Promise<Array>} - A promise resolving to an array of errors.
 */
function runPylint(filePath, outputChannel) {
  if (outputChannel) {
    outputChannel.appendLine(`Running Pylint on ${filePath}...`);
  }

  return new Promise((resolve, reject) => {
    const pythonCmd = pythonCommand();
    const command = ["-m", "pylint", filePath, "--output-format=json"];

    if (outputChannel) {
      outputChannel.appendLine(
        `Pylint command: ${pythonCmd} ${command.join(" ")}`
      );
    }

    const pylint = spawn(pythonCmd, command);
    let stdoutData = "";
    let stderrData = "";
    let settled = false;

    // Cleared on every exit path. Left running, it fired ten seconds after a successful
    // run and killed an already-dead process, and kept the timer alive for that long.
    const timeout = setTimeout(() => {
      finish(() =>
        reject(lintError(PYLINT_TIMED_OUT, "Pylint took too long to respond."))
      );
      pylint.kill();
    }, 10000);

    function finish(action) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      action();
    }

    pylint.stdout.on("data", (data) => (stdoutData += data.toString()));
    pylint.stderr.on("data", (data) => (stderrData += data.toString()));

    // Previously unhandled: when the interpreter itself is missing, spawn emits 'error'
    // and never emits 'close', so the promise hung until the timeout fired.
    pylint.on("error", (err) => {
      finish(() =>
        reject(
          err.code === "ENOENT"
            ? lintError(
                PYTHON_NOT_FOUND,
                `Could not run "${pythonCmd}". Is Python installed and on your PATH?`
              )
            : lintError(PYLINT_FAILED, err.message)
        )
      );
    });

    pylint.on("close", (code) => {
      if (code !== 0 && !stdoutData) {
        const stderr = stderrData.trim();
        // Python reports a missing module on stderr and exits non-zero. Recognising it
        // is what lets the caller prompt once instead of erroring on every save.
        const missing = /No module named pylint/i.test(stderr);
        finish(() =>
          reject(
            missing
              ? lintError(PYLINT_NOT_INSTALLED, "Pylint is not installed.")
              : lintError(
                  PYLINT_FAILED,
                  `Pylint error: ${stderr || `Exited with code ${code}`}`
                )
          )
        );
        return;
      }

      let results;
      try {
        results = JSON.parse(stdoutData.trim() || "[]");
      } catch (parseError) {
        finish(() =>
          reject(lintError(PYLINT_FAILED, "Error parsing Pylint output."))
        );
        return;
      }

      finish(() =>
        resolve(
          results.map((error) => ({
            line: error.line,
            message: simplifyError(error.symbol, error.message),
            type: error.type,
            critical: isCriticalError(error.symbol),
          }))
        )
      );
    });
  });
}

/**
 * Determines if an error is critical (should be read aloud immediately).
 * @param {string} symbol - The Pylint error symbol.
 * @returns {boolean} - True if the error is critical.
 */
function isCriticalError(symbol) {
  const criticalErrors = new Set([
    "undefined-variable",
    "syntax-error",
    "indentation-error",
    "attribute-defined-outside-init",
    "assignment-from-none",
  ]);
  return criticalErrors.has(symbol);
}

/**
 * Simplifies error messages to be more beginner-friendly.
 * @param {string} symbol - The Pylint error symbol.
 * @param {string} message - The original error message.
 * @returns {string} - A simplified version of the error message.
 */
function simplifyError(symbol, message) {
  const explanations = {
    "undefined-variable":
      "This variable is not defined. Did you forget to create it?",
    "syntax-error":
      "There's a syntax error. Check for missing colons, quotes, or brackets.",
    "unused-import": "This import is not used. You can remove it.",
    "indentation-error": "Your indentation is incorrect. Check your spacing.",
    "missing-docstring":
      "This function or class is missing a description. Consider adding one.",
  };
  return explanations[symbol] || message;
}

module.exports = {
  ensurePylintInstalled,
  runPylint,
  isPylintAvailable,
  resetPylintAvailability,
  promptToInstallPylint,
  PYLINT_NOT_INSTALLED,
  PYTHON_NOT_FOUND,
  PYLINT_TIMED_OUT,
  PYLINT_FAILED,
};
