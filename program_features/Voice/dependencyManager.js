const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");

// We create a hidden venv folder within the extension
const VENV_NAME = "echo_venv";

class DependencyManager {
  constructor(context, outputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.extensionUri = context.extensionUri;
    // Path to the virtual environment folder
    this.venvPath = path.join(context.globalStorageUri.fsPath, VENV_NAME);
  }

  /**
   * Main entry point: Ensures Python and packages are ready.
   * Returns the path to the python executable to use.
   */
  async ensureDependencies() {
    this.log("Checking voice dependencies...");

    // 1. Ensure storage directory exists
    if (!fs.existsSync(this.context.globalStorageUri.fsPath)) {
      fs.mkdirSync(this.context.globalStorageUri.fsPath, { recursive: true });
    }

    // 2. Determine Python Executable Path inside venv
    const isWin = process.platform === "win32";
    const pythonName = isWin ? "python.exe" : "bin/python3";
    const venvPythonPath = path.join(
      this.venvPath,
      isWin ? "Scripts" : "",
      pythonName
    );

    // 3. Check if venv exists
    const venvExists = fs.existsSync(venvPythonPath);

    if (!venvExists) {
      const selection = await vscode.window.showInformationMessage(
        "EchoCode requires a one-time setup for Voice features. Install AI dependencies?",
        "Yes",
        "No"
      );

      if (selection !== "Yes") {
        this.log("User declined dependency installation.");
        return null;
      }

      const success = await this.setupVirtualEnvironment();
      if (!success) return null;
    }

    // 4. Check if packages are installed
    const packagesReady = await this.checkPackages(venvPythonPath);
    if (!packagesReady) {
      await this.installPackages(venvPythonPath);
    }

    // Save this path to global state so other files can easier access it
    await this.context.globalState.update("echoCodePythonPath", venvPythonPath);

    this.log(`Voice dependencies ready. Using: ${venvPythonPath}`);
    return venvPythonPath;
  }

  async setupVirtualEnvironment() {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "EchoCode: Creating isolated Python environment...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const systemPython = await this.findSystemPython();
          if (!systemPython) {
            vscode.window.showErrorMessage(
              "Could not find Python installed on your system. Please install Python 3.10 or 3.11."
            );
            return false;
          }

          this.log(
            `Creating venv at ${this.venvPath} using ${systemPython}...`
          );

          await this.runCommand(`${systemPython} -m venv "${this.venvPath}"`);
          return true;
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create python environment: ${error.message}`
          );
          return false;
        }
      }
    );
  }

  async installPackages(pythonPath) {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title:
          "EchoCode: Installing Faster-Whisper (This may take a minute)...",
        cancellable: false,
      },
      async (progress) => {
        try {
          this.log("Installing faster-whisper and packages...");

          // Upgrade pip first
          await this.runCommand(`"${pythonPath}" -m pip install --upgrade pip`);

          // FIX: Install 'faster-whisper' instead of 'openai-whisper'
          await this.runCommand(
            `"${pythonPath}" -m pip install faster-whisper`
          );

          vscode.window.showInformationMessage(
            "EchoCode Voice setup complete!"
          );
          return true;
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to install packages: ${error.message}`
          );
          return false;
        }
      }
    );
  }

  async checkPackages(pythonPath) {
    try {
      // FIX: Check for faster_whisper import
      await this.runCommand(`"${pythonPath}" -c "import faster_whisper"`);
      return true;
    } catch (e) {
      return false;
    }
  }

  async findSystemPython() {
    // Try specifically stable versions first
    const candidates =
      process.platform === "win32"
        ? ["py -3.11", "py -3.10", "python3.11", "python3.10", "python"]
        : ["python3.11", "python3.10", "python3"];

    for (const cmd of candidates) {
      try {
        await this.runCommand(`${cmd} --version`);
        return cmd;
      } catch (e) {
        // continue
      }
    }
    return null;
  }

  runCommand(cmd) {
    return new Promise((resolve, reject) => {
      this.log(`> ${cmd}`);
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          this.log(`Error: ${stderr}`);
          reject(error);
        } else {
          resolve(stdout.trim());
        }
      });
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
