// test/setup.mjs

// Ensure tests always run in a lightweight test environment
process.env.VSCODE_TEST = "true";
console.log("Test env set (VSCODE_TEST=true)");

// Import the mock (side effect only — attaches globals)
import "./helpers/vscodeMock.js";

// Patch import.meta.resolve for any ESM import of "vscode"
import { Module } from "module";
const originalLoad = Module.prototype.require;

Module.prototype.require = function (path) {
  if (path === "vscode") {
    return globalThis.vscode; // use the global we attached in vscodeMock.js
  }
  return originalLoad.apply(this, arguments);
};

console.log("VSCode mock injected globally and via require() hook.");
