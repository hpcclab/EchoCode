"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const commandRegistry_1 = require("./commandRegistry");
function activate(context) {
    console.log("EchoCode: activate() starting. Env =", process.env.VSCODE_TEST);
    const isTest = process.env.VSCODE_TEST === "true";
    if (isTest) {
        console.log("EchoCode: test mode active. Skipping heavy startup like TTS and Copilot.");
    }
    else {
        console.log("EchoCode: normal mode activation.");
        // here you'd start TTS, Copilot, etc.
    }
    (0, commandRegistry_1.registerExtensionCommands)(context, isTest);
}
function deactivate() {
    console.log("EchoCode: extension deactivated.");
}
//# sourceMappingURL=extension.js.map