const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// We create a hidden venv folder within the extension
const VENV_NAME = "echo_venv";

// Guards the venv against concurrent setup. Every VS Code window runs its own extension
// host, so without this two windows will run `python -m venv` into the same directory,
// or two pip installs into the same site-packages, at the same time.
const LOCK_NAME = "echo_venv.setup.lock";

// A lock older than this is treated as abandoned — a window that crashed mid-install
// must not leave voice features permanently wedged.
const LOCK_STALE_MS = 20 * 60 * 1000;

// Records whether setup succeeded or failed, so a failing install is not repeated in
// full on every single activation.
const INSTALL_STATE_KEY = "echoCode.voiceDependencyState";

// After this many consecutive failures EchoCode stops retrying automatically and asks.
// Re-running a multi-hundred-megabyte pip install on every window open — when it has
// already failed twice for the same reason — is the difference between "slow once" and
// "slow forever".
const MAX_INSTALL_ATTEMPTS = 2;

// Every shell-out is bounded. `exec` has no default timeout, and on Windows
// `python --version` can hang indefinitely on the Microsoft Store App Execution Alias,
// which is indistinguishable from the extension simply never finishing.
const PROBE_TIMEOUT_MS = 15 * 1000;
const VENV_CREATE_TIMEOUT_MS = 3 * 60 * 1000;
const PIP_INSTALL_TIMEOUT_MS = 20 * 60 * 1000;

// pip is chatty. exec's default maxBuffer is 1 MB, and overrunning it kills the child
// with ENOBUFS — which surfaces as a failed install that then retries forever.
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

/**
 * One setup attempt per extension host, shared across every DependencyManager instance.
 *
 * This has to be module-level, not per-instance: extension.js constructs a brand new
 * manager on activation *and* on every feature reload (a UserImplementation file change
 * or a featureImplementation setting change both trigger one). Instance state cannot
 * stop those from each re-entering the prompt-and-create path, which is what produced a
 * loop of repeated "Creating isolated Python environment..." notifications.
 *
 * Only the slow path is memoised. The cheap "is everything already here" check still
 * runs on every call, so a setup that succeeds is picked up immediately afterwards.
 */
let sharedSetupRun = null;

class DependencyManager {
  constructor(context, outputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.extensionUri = context.extensionUri;
    // Path to the virtual environment folder
    this.venvPath = path.join(context.globalStorageUri.fsPath, VENV_NAME);
    this.lockPath = path.join(context.globalStorageUri.fsPath, LOCK_NAME);
  }

  /**
   * Main entry point: Ensures Python and packages are ready.
   * Returns the path to the python executable to use, or null.
   */
  async ensureDependencies() {
    this.log("Checking voice dependencies...");

    const storageDir = this.context.globalStorageUri.fsPath;
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const venvPythonPath = this.venvPythonPath();

    // Fast path, and the common one: everything is already in place. Costs two stats
    // and no process launches, so a warm activation pays essentially nothing.
    if (fs.existsSync(venvPythonPath) && this.packagesPresentOnDisk()) {
      await this.context.globalState.update(
        "echoCodePythonPath",
        venvPythonPath,
      );
      await this.recordState({ status: "ok", attempts: 0 });
      this.log(`Voice dependencies ready. Using: ${venvPythonPath}`);
      return venvPythonPath;
    }

    // Something is missing, so the slow path has to run — but at most once per session.
    if (sharedSetupRun) {
      this.log(
        "Voice dependency setup already ran in this session; not repeating.",
      );
      return sharedSetupRun;
    }

    sharedSetupRun = (async () => {
      const lock = await this.acquireLock();
      if (!lock) {
        this.log(
          "Another window is setting up voice dependencies; skipping this run.",
        );
        return fs.existsSync(venvPythonPath) ? venvPythonPath : null;
      }

      try {
        return await this.runSetup(venvPythonPath);
      } finally {
        this.releaseLock();
      }
    })();

    return sharedSetupRun;
  }

  /**
   * The slow path, always under the lock: create the venv if needed, then install.
   */
  async runSetup(venvPythonPath) {
    let state = this.readState();

    // Gate the *whole* slow path, not just the pip install. Creating the venv is itself
    // expensive and can itself keep failing — an unguarded retry there is exactly the
    // loop of "Creating isolated Python environment..." this is meant to end.
    if (!(await this.shouldAttemptSetup(state))) {
      this.log(
        `Skipping setup: ${state.attempts} previous attempt(s) failed ` +
          `(${state.lastError || "unknown error"}). Use the prompt's Retry action.`,
      );
      return null;
    }
    state = this.readState();

    if (!fs.existsSync(venvPythonPath)) {
      if (!(await this.confirmFirstRun(state))) return null;

      const created = await this.setupVirtualEnvironment();
      if (!created) {
        await this.recordFailure(state, "venv creation failed");
        return null;
      }

      // `python -m venv` can exit 0 and still not produce the interpreter we expect
      // (a layout difference, or a half-written directory from an earlier crash).
      // Without this check that state loops forever: the path stays missing, nothing
      // records a failure, and every activation tries to create it again.
      if (!fs.existsSync(venvPythonPath)) {
        await this.recordFailure(
          state,
          `venv created but ${path.basename(venvPythonPath)} is missing`,
        );
        this.log(`Expected interpreter at: ${venvPythonPath}`);
        this.log(`Actually present: ${this.describeVenvContents()}`);
        vscode.window.showErrorMessage(
          "EchoCode: the Python environment was created but its interpreter is missing. See the EchoCode output channel.",
        );
        return null;
      }

      // A fresh venv seeds its own pip, so this is the only moment an upgrade is worth
      // a network round trip.
      await this.upgradePip(venvPythonPath);
    }

    if (await this.checkPackages(venvPythonPath)) {
      await this.context.globalState.update(
        "echoCodePythonPath",
        venvPythonPath,
      );
      await this.recordState({ status: "ok", attempts: 0 });
      this.log(`Voice dependencies ready. Using: ${venvPythonPath}`);
      return venvPythonPath;
    }

    const installed = await this.installPackages(venvPythonPath);
    if (!installed) {
      await this.recordFailure(state, this.lastInstallError || "install failed");
      return null;
    }

    await this.context.globalState.update("echoCodePythonPath", venvPythonPath);
    await this.recordState({ status: "ok", attempts: 0 });
    this.log(`Voice dependencies ready. Using: ${venvPythonPath}`);
    return venvPythonPath;
  }

  /* ---------------------------------------------------------------- *
   * Paths
   * ---------------------------------------------------------------- */

  venvPythonPath() {
    const isWin = process.platform === "win32";
    return path.join(
      this.venvPath,
      isWin ? "Scripts" : "bin",
      isWin ? "python.exe" : "python3",
    );
  }

  /**
   * Resolves the venv's site-packages directory. Windows keeps it at a fixed path;
   * POSIX nests it under a version-specific folder, so that one has to be discovered.
   */
  sitePackagesDir() {
    if (process.platform === "win32") {
      return path.join(this.venvPath, "Lib", "site-packages");
    }

    const libDir = path.join(this.venvPath, "lib");
    try {
      const pythonDir = fs
        .readdirSync(libDir)
        .find((entry) => entry.startsWith("python3"));
      return pythonDir ? path.join(libDir, pythonDir, "site-packages") : null;
    } catch {
      return null;
    }
  }

  /**
   * Whether faster-whisper's package directory is on disk.
   *
   * Spawning Python to `import faster_whisper` costs an interpreter start plus loading
   * ctranslate2 and onnxruntime — measured at over a second cold, and worse on Windows
   * where each DLL is scanned. A stat answers the same question for free.
   *
   * Deliberately not cached in globalState: a stale "ready" flag would survive the user
   * removing the package and break voice at runtime, whereas this re-checks reality on
   * every launch and still costs nothing.
   */
  packagesPresentOnDisk() {
    const sitePackages = this.sitePackagesDir();
    return Boolean(
      sitePackages && fs.existsSync(path.join(sitePackages, "faster_whisper")),
    );
  }

  /* ---------------------------------------------------------------- *
   * Cross-window lock
   * ---------------------------------------------------------------- */

  /**
   * Takes an exclusive setup lock, or returns false if another window holds it.
   * Uses an O_EXCL create, which is atomic, rather than an exists-then-write race.
   */
  async acquireLock() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await fs.promises.writeFile(
          this.lockPath,
          JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
          { flag: "wx" },
        );
        return true;
      } catch (err) {
        if (err.code !== "EEXIST") {
          // Cannot even create a lock file; proceed unlocked rather than disabling
          // voice entirely, since the single-window case is the common one.
          this.log(`Could not create setup lock (${err.code}); continuing.`);
          return true;
        }

        // Held. Steal it only if it is old enough to be certainly abandoned.
        let age = 0;
        try {
          age = Date.now() - (await fs.promises.stat(this.lockPath)).mtimeMs;
        } catch {
          // Vanished between the failed create and the stat: retry the create.
          continue;
        }

        if (age < LOCK_STALE_MS) return false;

        this.log(
          `Clearing stale setup lock (${Math.round(age / 1000)}s old).`,
        );
        await fs.promises.rm(this.lockPath, { force: true });
      }
    }
    return false;
  }

  releaseLock() {
    try {
      fs.rmSync(this.lockPath, { force: true });
    } catch (err) {
      this.log(`Could not remove setup lock: ${err.message}`);
    }
  }

  /* ---------------------------------------------------------------- *
   * Attempt bookkeeping
   * ---------------------------------------------------------------- */

  readState() {
    const stored = this.context.globalState.get(INSTALL_STATE_KEY);
    return {
      status: stored?.status || "unknown",
      attempts: Number(stored?.attempts) || 0,
      lastError: stored?.lastError || "",
      declined: Boolean(stored?.declined),
    };
  }

  async recordState(patch) {
    const next = { ...this.readState(), ...patch };
    await this.context.globalState.update(INSTALL_STATE_KEY, next);
    return next;
  }

  async recordFailure(state, reason) {
    const attempts = state.attempts + 1;
    await this.recordState({
      status: "failed",
      attempts,
      lastError: String(reason).slice(0, 500),
    });
    this.log(`Setup failed (attempt ${attempts}): ${reason}`);
  }

  /**
   * First-run consent. A previous decline is remembered so the prompt does not reappear
   * on every window open; the user can still opt in later from the same prompt path.
   */
  async confirmFirstRun(state) {
    if (state.declined) {
      this.log("Voice setup was previously declined; skipping.");
      return false;
    }

    const selection = await vscode.window.showInformationMessage(
      "EchoCode requires a one-time setup for Voice features. Install AI dependencies?",
      "Yes",
      "Not now",
      "Don't ask again",
    );

    if (selection === "Yes") return true;

    if (selection === "Don't ask again") {
      await this.recordState({ declined: true });
    }
    this.log(`User declined dependency installation (${selection || "dismissed"}).`);
    return false;
  }

  /**
   * Whether to spend another full setup. Past the attempt limit we ask instead of
   * silently redoing it, because a repeat failure is almost always a persistent cause
   * (no compiler, no network, unsupported Python) that retrying will not fix.
   */
  async shouldAttemptSetup(state) {
    if (state.attempts < MAX_INSTALL_ATTEMPTS) return true;

    const selection = await vscode.window.showWarningMessage(
      `EchoCode Voice setup has failed ${state.attempts} times (${state.lastError || "unknown error"}). Retry?`,
      "Retry Setup",
      "Not now",
    );

    if (selection !== "Retry Setup") return false;

    await this.recordState({ attempts: 0, status: "unknown" });
    return true;
  }

  /**
   * One-line summary of what the venv directory actually contains. Logged only when the
   * expected interpreter is missing — that is the moment the contents are the whole
   * diagnostic, and guessing from the outside is hopeless.
   */
  describeVenvContents() {
    const binDir = path.join(
      this.venvPath,
      process.platform === "win32" ? "Scripts" : "bin",
    );
    try {
      const entries = fs.readdirSync(binDir);
      return entries.length
        ? `${binDir} -> ${entries.slice(0, 12).join(", ")}`
        : `${binDir} is empty`;
    } catch (err) {
      try {
        return `${binDir} unreadable (${err.code}); venv root -> ${fs.readdirSync(this.venvPath).join(", ")}`;
      } catch {
        return `${this.venvPath} does not exist or is unreadable`;
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Setup steps
   * ---------------------------------------------------------------- */

  async setupVirtualEnvironment() {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "EchoCode: Creating isolated Python environment...",
        cancellable: false,
      },
      async () => {
        try {
          const systemPython = await this.findSystemPython();
          if (!systemPython) {
            vscode.window.showErrorMessage(
              "Could not find Python installed on your system. Please install Python 3.10 or newer.",
            );
            return false;
          }

          this.log(`Creating venv at ${this.venvPath} using ${systemPython}...`);
          await this.runCommand(
            `${systemPython} -m venv "${this.venvPath}"`,
            VENV_CREATE_TIMEOUT_MS,
          );
          return true;
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create python environment: ${error.message}`,
          );
          return false;
        }
      },
    );
  }

  /**
   * Best-effort only. An old pip can break a wheel install, but a failed *upgrade* is
   * no reason to abandon setup — so this never propagates.
   */
  async upgradePip(pythonPath) {
    try {
      await this.runCommand(
        `"${pythonPath}" -m pip install --upgrade pip --disable-pip-version-check --no-input`,
        PIP_INSTALL_TIMEOUT_MS,
      );
    } catch (err) {
      this.log(`pip self-upgrade failed (continuing anyway): ${err.message}`);
    }
  }

  async installPackages(pythonPath) {
    this.lastInstallError = "";

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "EchoCode: Installing Faster-Whisper (this can take several minutes)...",
        cancellable: false,
      },
      async () => {
        try {
          this.log("Installing faster-whisper and packages...");
          await this.runCommand(
            `"${pythonPath}" -m pip install faster-whisper --disable-pip-version-check --no-input`,
            PIP_INSTALL_TIMEOUT_MS,
          );

          // Trust the filesystem over pip's exit code: a partially-installed wheel can
          // still exit 0, and shipping a broken venv is worse than reporting a failure.
          if (!this.packagesPresentOnDisk()) {
            this.lastInstallError =
              "pip reported success but faster_whisper is not in site-packages";
            vscode.window.showErrorMessage(
              `EchoCode: voice setup did not complete — ${this.lastInstallError}.`,
            );
            return false;
          }

          vscode.window.showInformationMessage("EchoCode Voice setup complete!");
          return true;
        } catch (error) {
          this.lastInstallError = error.message;
          vscode.window.showErrorMessage(
            `Failed to install packages: ${error.message}`,
          );
          return false;
        }
      },
    );
  }

  /**
   * Authoritative package check: the on-disk stat first, falling back to an import only
   * when the stat is inconclusive.
   */
  async checkPackages(pythonPath) {
    if (this.packagesPresentOnDisk()) {
      this.log("faster-whisper found in site-packages; skipping import check.");
      return true;
    }

    try {
      await this.runCommand(
        `"${pythonPath}" -c "import faster_whisper"`,
        PROBE_TIMEOUT_MS,
      );
      return true;
    } catch {
      return false;
    }
  }

  async findSystemPython() {
    // Newest first: faster-whisper's wheels track current Python, and macOS's bundled
    // python3 is an old Xcode build that should only ever be the last resort.
    const candidates =
      process.platform === "win32"
        ? ["py -3.12", "py -3.11", "py -3.10", "python"]
        : ["python3.12", "python3.11", "python3.10", "python3"];

    for (const cmd of candidates) {
      try {
        const version = await this.runCommand(
          `${cmd} --version`,
          PROBE_TIMEOUT_MS,
        );
        this.log(`Using ${cmd} (${version}).`);
        return cmd;
      } catch {
        // Not present, or it hung and was killed by the timeout. Try the next.
      }
    }
    return null;
  }

  /**
   * Runs a shell command with a hard timeout and a generous output buffer, logging how
   * long it took. The duration matters: it is what makes a slow activation diagnosable
   * from the output channel instead of a guess.
   */
  runCommand(cmd, timeoutMs = PROBE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      this.log(`> ${cmd}`);
      const startedAt = Date.now();

      exec(
        cmd,
        {
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: MAX_OUTPUT_BYTES,
        },
        (error, stdout, stderr) => {
          const elapsed = Date.now() - startedAt;

          if (error) {
            // `killed` is how exec reports both its own timeout and an ENOBUFS kill.
            const detail = error.killed
              ? `timed out or was killed after ${timeoutMs}ms`
              : (stderr || error.message || "").trim().split("\n")[0];
            this.log(`  failed in ${elapsed}ms: ${detail}`);
            reject(new Error(detail || `Command failed: ${cmd}`));
            return;
          }

          this.log(`  ok in ${elapsed}ms`);
          resolve(String(stdout || "").trim());
        },
      );
    });
  }

  log(msg) {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[DependencyManager] ${msg}`);
    } else {
      console.log(`[DependencyManager] ${msg}`);
    }
  }
}

module.exports = DependencyManager;
