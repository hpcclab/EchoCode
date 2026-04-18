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
  getConfiguration: () => ({ get: (_key, fallback) => fallback ?? true, update: async () => {} }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

export const env = {
  clipboard: {
    writeText: async (t) => console.log(`[VSCodeMock] clipboard.writeText: ${t}`),
    readText: async () => "",
  },
};

// Helper to create a context like VS Code provides
export function __createMockContext() {
  return {
    subscriptions: [],
    globalState: { get: () => undefined, update: async () => {} },
    workspaceState: { get: () => undefined, update: async () => {} },
    extensionUri: { fsPath: process.cwd() },
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

// Build a global namespace for any code using require('vscode')
globalThis.vscode = { commands, window, workspace, env, __createMockContext };
globalThis.tts = tts;
globalThis.copilot = copilot;

console.log("[VSCodeMock] Initialized with ESM-shaped exports and command registry.");
