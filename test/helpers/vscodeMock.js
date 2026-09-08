import path from "path";
import os from "os";

// ----- In-memory command registry -----
const commandRegistry = new Map();

function registerCommand(id, fn) {
  commandRegistry.set(id, fn);
  return { dispose: () => commandRegistry.delete(id) };
}
async function getCommands(/* filterInternal = false */) {
  return Array.from(commandRegistry.keys());
}
async function executeCommand(id, ...args) {
  const handler = commandRegistry.get(id);
  if (!handler) throw new Error(`Command not found: ${id}`);
  return await handler(...args);
}

export class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

export class Selection {
  constructor(anchor, active) {
    this.anchor = anchor;
    this.active = active;
  }
}

export class Range {
  constructor(startLine, startCharacter, endLine, endCharacter) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

// ----- VS Code API exports (ESM top-level) -----
export const commands = { registerCommand, getCommands, executeCommand };

export const window = {
  showInformationMessage: (msg) => console.log(`[VSCodeMock] Info: ${msg}`),
  showErrorMessage: (msg) => console.error(`[VSCodeMock] Error: ${msg}`),
  createOutputChannel: (name) => ({
    appendLine: (text) => console.log(`[${name}] ${text}`),
    show: () => {},
    dispose: () => {},
  }),
  activeTextEditor: undefined,
};

export const workspace = {
  getConfiguration: () => ({
    get: (_key, fallback) => fallback ?? true,
    update: async () => {},
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

export const env = {
  clipboard: {
    writeText: async (t) =>
      console.log(`[VSCodeMock] clipboard.writeText: ${t}`),
    readText: async () => "",
  },
};

// Helper to create a context like VS Code provides
export function __createMockContext() {
  // Points at a throwaway directory rather than the repo: code under test writes
  // generated per-user data here, and a test run must not leave files in the checkout.
  const storageRoot = path.join(os.tmpdir(), "echocode-test-storage");

  return {
    subscriptions: [],
    globalState: { get: () => undefined, update: async () => {} },
    workspaceState: { get: () => undefined, update: async () => {} },
    extensionUri: { fsPath: process.cwd() },
    // Real VS Code always provides these; extension code may write to them without
    // checking, so the mock has to supply them too.
    globalStorageUri: { fsPath: storageRoot },
    storageUri: { fsPath: path.join(storageRoot, "workspace") },
    logUri: { fsPath: path.join(storageRoot, "logs") },
    secrets: {
      get: async () => undefined,
      store: async () => {},
      delete: async () => {},
    },
  };
}

// ----- Optional external services -----
export const tts = {
  speak: async (text) => {
    console.log(`[Mock TTS] Speaking: "${text}"`);
    return Promise.resolve();
  },
};
export const copilot = {
  suggestCode: async (prompt) => {
    console.log(`[Mock Copilot] Suggesting for: "${prompt}"`);
    return Promise.resolve("mock suggestion");
  },
};

/**
 * Mirrors vscode.Disposable: a dispose callback, plus the static `from` combinator.
 * Extension code registers cleanup this way (file watchers, feature commands), so the
 * mock has to provide it for anything that runs through activate().
 */
export class Disposable {
  constructor(callOnDispose) {
    this._callOnDispose = callOnDispose;
  }

  dispose() {
    if (typeof this._callOnDispose === "function") {
      this._callOnDispose();
    }
  }

  static from(...items) {
    return new Disposable(() => {
      for (const item of items) {
        if (item && typeof item.dispose === "function") item.dispose();
      }
    });
  }
}

// Build a global namespace for any code using require('vscode')
globalThis.vscode = {
  commands,
  window,
  workspace,
  env,
  Position,
  Selection,
  Range,
  Disposable,
  __createMockContext,
};
globalThis.tts = tts;
globalThis.copilot = copilot;

console.log(
  "[VSCodeMock] Initialized with ESM-shaped exports and command registry.",
);
