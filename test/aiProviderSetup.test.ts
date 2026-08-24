import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";

const nodeRequire = require;
const repoRoot = process.cwd();
const modulePath = nodeRequire.resolve(
  path.join(
    repoRoot,
    "Core/program_settings/program_settings/aiProviderSetup.js",
  ),
);
const aiRequestModulePath = nodeRequire.resolve(
  path.join(repoRoot, "Core/program_settings/program_settings/AIrequest.js"),
);

function loadAiProviderSetupModule() {
  delete nodeRequire.cache[modulePath];
  delete nodeRequire.cache[aiRequestModulePath];
  return nodeRequire(modulePath);
}

function mockContext(initialState: Record<string, unknown> = {}) {
  const state = { ...initialState };
  return {
    globalState: {
      get: (key: string, fallback: unknown) =>
        Object.prototype.hasOwnProperty.call(state, key)
          ? state[key]
          : fallback,
      update: async (key: string, value: unknown) => {
        state[key] = value;
      },
    },
    __state: state,
  };
}

function mockEchoCodeConfig() {
  const vscodeGlobal: any = (globalThis as any).vscode;
  const original = vscodeGlobal.workspace.getConfiguration;
  const original2 = vscodeGlobal.ConfigurationTarget;
  const values: Record<string, unknown> = {};

  vscodeGlobal.ConfigurationTarget = { Global: "global" };
  vscodeGlobal.workspace.getConfiguration = () => ({
    get: (key: string, fallback: unknown) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : fallback,
    update: async (key: string, value: unknown) => {
      values[key] = value;
    },
  });

  return {
    values,
    restore: () => {
      vscodeGlobal.workspace.getConfiguration = original;
      vscodeGlobal.ConfigurationTarget = original2;
    },
  };
}

function mockWindow(overrides: Record<string, any>) {
  const vscodeGlobal: any = (globalThis as any).vscode;
  const original = vscodeGlobal.window;
  vscodeGlobal.window = { ...original, ...overrides };
  return () => {
    vscodeGlobal.window = original;
  };
}

suite("aiProviderSetup", () => {
  test("pickProviderAndModel persists chosen Copilot model", async () => {
    const vscodeGlobal: any = (globalThis as any).vscode;
    const config = mockEchoCodeConfig();

    const originalLm = vscodeGlobal.lm;
    vscodeGlobal.lm = {
      selectChatModels: async () => [
        { id: "gpt-4o", name: "GPT-4o", family: "gpt-4o" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", family: "gpt-4o-mini" },
      ],
    };

    const restoreWindow = mockWindow({
      showQuickPick: async (items: any[]) => {
        // First call: provider list. Second call: model list.
        if (items.some((i) => i.value === "copilot")) {
          return items.find((i: any) => i.value === "copilot");
        }
        return items.find((i: any) => i.value === "gpt-4o-mini");
      },
      showInformationMessage: () => {},
      showWarningMessage: async () => undefined,
    });

    const context = mockContext();

    try {
      const mod = loadAiProviderSetupModule();
      const saved = await mod.pickProviderAndModel(context, undefined);

      assert.equal(saved, true);
      assert.equal(config.values.useLocalOllama, false);
      assert.equal(config.values.copilotModel, "gpt-4o-mini");
      assert.equal(context.__state["echocode.aiProviderConfigured"], true);
    } finally {
      vscodeGlobal.lm = originalLm;
      restoreWindow();
      config.restore();
    }
  });

  test("pickProviderAndModel persists chosen Ollama model from live /api/tags list", async () => {
    const vscodeGlobal: any = (globalThis as any).vscode;
    const config = mockEchoCodeConfig();

    const originalLm = vscodeGlobal.lm;
    vscodeGlobal.lm = { selectChatModels: async () => [] };

    const http = nodeRequire("http");
    const originalHttpRequest = http.request;
    const { EventEmitter } = nodeRequire("events");

    http.request = (options: any, callback: (res: any) => void) => {
      const req = new EventEmitter() as any;
      req.write = () => {};
      req.setTimeout = () => {};
      req.destroy = () => {};
      req.end = () => {
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.setEncoding = () => {};
        callback(res);
        res.emit(
          "data",
          JSON.stringify({
            models: [{ name: "llama3.2" }, { name: "qwen2.5:7b" }],
          }),
        );
        res.emit("end");
      };
      return req;
    };

    const restoreWindow = mockWindow({
      showQuickPick: async (items: any[]) => {
        if (items.some((i) => i.value === "ollama")) {
          return items.find((i: any) => i.value === "ollama");
        }
        return items.find((i: any) => i.label === "qwen2.5:7b");
      },
      showInformationMessage: () => {},
      showWarningMessage: async () => undefined,
    });

    const context = mockContext();

    try {
      const mod = loadAiProviderSetupModule();
      const saved = await mod.pickProviderAndModel(context, undefined);

      assert.equal(saved, true);
      assert.equal(config.values.useLocalOllama, true);
      assert.equal(config.values.ollamaModel, "qwen2.5:7b");
    } finally {
      http.request = originalHttpRequest;
      vscodeGlobal.lm = originalLm;
      restoreWindow();
      config.restore();
    }
  });

  test("checkForProviderUpdates warns when the configured Ollama model vanished", async () => {
    const vscodeGlobal: any = (globalThis as any).vscode;
    const config = mockEchoCodeConfig();
    config.values.useLocalOllama = true;
    config.values.ollamaModel = "removed-model";

    const originalLm = vscodeGlobal.lm;
    vscodeGlobal.lm = { selectChatModels: async () => [] };

    const http = nodeRequire("http");
    const originalHttpRequest = http.request;
    const { EventEmitter } = nodeRequire("events");

    http.request = (options: any, callback: (res: any) => void) => {
      const req = new EventEmitter() as any;
      req.write = () => {};
      req.setTimeout = () => {};
      req.destroy = () => {};
      req.end = () => {
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.setEncoding = () => {};
        callback(res);
        res.emit("data", JSON.stringify({ models: [{ name: "llama3.2" }] }));
        res.emit("end");
      };
      return req;
    };

    let warned = false;
    const restoreWindow = mockWindow({
      showWarningMessage: async () => {
        warned = true;
        return "Dismiss";
      },
    });

    const outputLines: string[] = [];
    const outputChannel = { appendLine: (s: string) => outputLines.push(s) };

    try {
      const mod = loadAiProviderSetupModule();
      await mod.checkForProviderUpdates(mockContext(), outputChannel);

      assert.equal(warned, true);
      assert.ok(
        outputLines.some((l) => l.includes("removed-model")),
        "expected a log line mentioning the missing model",
      );
    } finally {
      http.request = originalHttpRequest;
      vscodeGlobal.lm = originalLm;
      restoreWindow();
      config.restore();
    }
  });
});
