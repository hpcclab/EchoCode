const vscode = require("vscode");
const {
  runPylint,
  isPylintAvailable,
  promptToInstallPylint,
  PYLINT_NOT_INSTALLED,
  PYTHON_NOT_FOUND,
} = require("./pylintHandler");
const { speakMessage } = require("../../Core/program_settings/speech_settings/speechHandler");

let outputChannel;
let isRunning = false;

// Coalesces bursts of saves into one lint run. Save-all across a project, or editors
// with auto-save on, otherwise spawn one Python interpreter per file per keystroke-ish
// interval — and pylint's startup dominates its runtime.
const SAVE_DEBOUNCE_MS = 400;
const pendingLints = new Map();

// Last document version linted per file. A save that changes nothing (Ctrl+S out of
// habit, or a formatter save with no edits) does not need a fresh run.
const lastLintedVersion = new Map();

// Identifies the current spoken readout. A newer lint bumps it so an in-progress
// readout of stale results stops instead of narrating findings that no longer apply.
let readoutId = 0;

// Latches so a missing toolchain is reported once per session rather than on every save.
let notifiedMissingPylint = false;
let notifiedMissingPython = false;

function initializeErrorHandling(channel) {
  outputChannel = channel;
}

/**
 * Reads the critical findings aloud, one after another.
 *
 * Deliberately runs outside the lint lock. Speech is slow — several seconds per finding
 * — and holding `isRunning` across it meant every save during the readout was silently
 * dropped: the user saved, heard nothing, and had no way to know why.
 */
async function announceErrors(errors) {
  const id = (readoutId += 1);

  for (const error of errors) {
    // A newer lint has produced newer results; this readout is now stale.
    if (id !== readoutId) return;
    if (error.critical) {
      await speakMessage(`Line ${error.line}: ${error.message}`);
    }
  }
}

function reportLintFailure(err) {
  const code = err && err.code;

  if (code === PYLINT_NOT_INSTALLED) {
    outputChannel?.appendLine("Pylint is not installed; skipping error checks.");
    if (!notifiedMissingPylint) {
      notifiedMissingPylint = true;
      promptToInstallPylint();
    }
    return;
  }

  if (code === PYTHON_NOT_FOUND) {
    outputChannel?.appendLine(`Python not found: ${err.message}`);
    if (!notifiedMissingPython) {
      notifiedMissingPython = true;
      vscode.window.showWarningMessage(`EchoCode: ${err.message}`);
    }
    return;
  }

  // A real failure from a working toolchain is worth surfacing each time.
  vscode.window.showErrorMessage(
    `Failed to run Pylint: ${err && err.message ? err.message : err}`
  );
}

async function handlePythonErrorsOnSave(filePath) {
  if (isRunning) return;
  isRunning = true;

  let errors;
  try {
    errors = await runPylint(filePath, outputChannel);
  } catch (err) {
    reportLintFailure(err);
    return;
  } finally {
    // Released before the readout below, so a save during it is still linted.
    isRunning = false;
  }

  if (errors.length === 0) {
    vscode.window.showInformationMessage("✅ No issues detected!");
    return;
  }

  outputChannel.appendLine(`📢 Found ${errors.length} Pylint error(s):`);
  for (const error of errors) {
    outputChannel.appendLine(`Line ${error.line}: ${error.message}`);
  }
  outputChannel.show();

  await announceErrors(errors);
}

/**
 * Queues a lint for a saved document, skipping work that would tell the user nothing
 * new. Both guards exist because a pylint run costs a fresh interpreter start.
 */
// True once a save-triggered run has proved the toolchain is missing. Further automatic
// runs would each spawn an interpreter to rediscover the same thing, so they stop; the
// explicit "read errors" command clears this to retry after the user installs.
function toolchainUnavailable() {
  return notifiedMissingPylint || notifiedMissingPython;
}

function scheduleLint(document) {
  const key = document.uri.toString();

  if (toolchainUnavailable()) return;

  if (lastLintedVersion.get(key) === document.version) {
    outputChannel?.appendLine(
      `Skipping Pylint on ${document.uri.fsPath}: unchanged since last run.`
    );
    return;
  }

  clearTimeout(pendingLints.get(key));
  pendingLints.set(
    key,
    setTimeout(() => {
      pendingLints.delete(key);
      // Re-checked at fire time: a run scheduled before an in-flight run reported a
      // missing toolchain would otherwise spawn an interpreter to learn the same thing.
      if (toolchainUnavailable()) return;
      lastLintedVersion.set(key, document.version);
      handlePythonErrorsOnSave(document.uri.fsPath);
    }, SAVE_DEBOUNCE_MS)
  );
}

function registerErrorHandlingCommands(context) {
  // Command to read errors aloud
  const readErrors = vscode.commands.registerCommand(
    "echocode.readErrors",
    () => {
      outputChannel.appendLine("echocode.readErrors command triggered");
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "python") {
        // Explicit user request: run it now, and do not let the unchanged-file guard
        // swallow it — asking to hear the errors should always read them. Clearing the
        // missing-toolchain latches also makes this the way to retry after installing.
        lastLintedVersion.delete(editor.document.uri.toString());
        notifiedMissingPylint = false;
        notifiedMissingPython = false;
        handlePythonErrorsOnSave(editor.document.uri.fsPath);
      } else {
        vscode.window.showWarningMessage(
          "Please open a Python file to read errors."
        );
      }
    }
  );

  // Automatically trigger on save
  const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.languageId === "python") {
      scheduleLint(document);
    }
  });

  const cleanup = new vscode.Disposable(() => {
    pendingLints.forEach((timer) => clearTimeout(timer));
    pendingLints.clear();
    lastLintedVersion.clear();
  });

  context.subscriptions.push(readErrors, saveListener, cleanup);
}

module.exports = {
  initializeErrorHandling,
  handlePythonErrorsOnSave,
  registerErrorHandlingCommands,
  isPylintAvailable,
};
