import * as vscode from "vscode";
import { registerExtensionCommands } from "./commandRegistry";

export function activate(context: vscode.ExtensionContext) {
  console.log("EchoCode: activate() starting. Env =", process.env.VSCODE_TEST);

  const isTest = process.env.VSCODE_TEST === "true";
  if (isTest) {
    console.log(
      "EchoCode: test mode active. Skipping heavy startup like TTS and Copilot.",
    );
  } else {
    console.log("EchoCode: normal mode activation.");
    // here you'd start TTS, Copilot, etc.
  }

  registerExtensionCommands(context, isTest);
}

export function deactivate() {
  console.log("EchoCode: extension deactivated.");
}
