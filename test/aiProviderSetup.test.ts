import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";

import { createRequire } from "module";

// Node strips types natively and detects these files as ESM (they use `import`), so the
// CommonJS `require` is not in scope. The suite needs a real CJS require: it injects
// mocks by writing into require.cache, which only the CJS loader consults.
const nodeRequire = createRequire(import.meta.url);
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
const secretStorePath = nodeRequire.resolve(
  path.join(repoRoot, "Core/program_settings/program_settings/secretStore.js"),
);

const speechHandlerPath = nodeRequire.resolve(
  path.join(repoRoot, "Core/program_settings/speech_settings/speechHandler.js"),
);

/**
 * The setup flow speaks at each step. The real handler drives the OS speech engine and
 * only resolves once the sentence has finished being read aloud, which makes these
 * tests both audible and many seconds long, so stub it out for the whole suite.
 */
function silenceSpeech() {
  nodeRequire.cache[speechHandlerPath] = {
    id: speechHandlerPath,
    filename: speechHandlerPath,
    loaded: true,
    exports: { speakMessage: async () => {} },
  } as any;
}

function loadAiProviderSetupModule() {
  silenceSpeech();
  delete nodeRequire.cache[modulePath];
  delete nodeRequire.cache[aiRequestModulePath];
  return nodeRequire(modulePath);
}

function mockContext(initialState: Record<string, unknown> = {}) {
  const state = { ...initialState };
  const secrets = new Map<string, string>();
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
    secrets: {
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => {
        secrets.set(key, value);
      },
      delete: async (key: string) => {
        secrets.delete(key);
      },
    },
    __state: state,
    __secrets: secrets,
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
  const originalProgressLocation = vscodeGlobal.ProgressLocation;

  vscodeGlobal.ProgressLocation = { Notification: 15 };
  vscodeGlobal.window = {
    ...original,
    // Every long-running step in setup runs inside withProgress; run the task inline.
    withProgress: async (_options: any, task: any) =>
      task({ report: () => {} }, { onCancellationRequested: () => {} }),
    ...overrides,
  };

  return () => {
    vscodeGlobal.window = original;
    vscodeGlobal.ProgressLocation = originalProgressLocation;
  };
}

/**
 * Installs a fake http.request that dispatches on request path, so one test can serve
 * /api/tags, /api/pull and /models without caring about call order.
 */
function mockHttp(routes: Record<string, { ndjson?: string[]; json?: unknown }>) {
  const http = nodeRequire("http");
  const original = http.request;
  const { EventEmitter } = nodeRequire("events");
  const seen: { path: string; body: string }[] = [];

  http.request = (options: any, callback: (res: any) => void) => {
    const req = new EventEmitter() as any;
    let body = "";

    req.write = (chunk: any) => {
      body += chunk.toString();
    };
    req.setTimeout = () => {};
    req.destroy = () => {};
    req.end = () => {
      seen.push({ path: options.path, body });

      const route = Object.entries(routes).find(([p]) =>
        String(options.path).startsWith(p),
      )?.[1];

      const res = new EventEmitter() as any;
      res.statusCode = route ? 200 : 404;
      res.setEncoding = () => {};
      callback(res);

      if (!route) {
        res.emit("data", JSON.stringify({ error: "not found" }));
      } else if (route.ndjson) {
        for (const line of route.ndjson) res.emit("data", `${line}\n`);
      } else {
        res.emit("data", JSON.stringify(route.json));
      }
      res.emit("end");
    };

    return req;
  };

  return {
    seen,
    restore: () => {
      http.request = original;
    },
  };
}

function noCopilot() {
  const vscodeGlobal: any = (globalThis as any).vscode;
  const originalLm = vscodeGlobal.lm;
  vscodeGlobal.lm = { selectChatModels: async () => [] };
  return () => {
    vscodeGlobal.lm = originalLm;
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
      // Three picks now: API-or-Local, then Copilot-or-other-API, then the model.
      showQuickPick: async (items: any[]) => {
        if (items.some((i) => i.value === "api" && i.label.includes("API model"))) {
          return items.find((i: any) => i.value === "api");
        }
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
      assert.equal(config.values.aiProvider, "copilot");
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
    const config = mockEchoCodeConfig();
    const restoreLm = noCopilot();
    const http = mockHttp({
      "/api/tags": {
        json: { models: [{ name: "llama3.2" }, { name: "qwen2.5:7b" }] },
      },
    });

    const restoreWindow = mockWindow({
      showQuickPick: async (items: any[]) => {
        if (items.some((i) => i.value === "local")) {
          return items.find((i: any) => i.value === "local");
        }
        return items.find((i: any) => i.value === "qwen2.5:7b");
      },
      showInformationMessage: () => {},
      showWarningMessage: async () => undefined,
    });

    const context = mockContext();

    try {
      const mod = loadAiProviderSetupModule();
      const saved = await mod.pickProviderAndModel(context, undefined);

      assert.equal(saved, true);
      assert.equal(config.values.aiProvider, "ollama");
      assert.equal(config.values.useLocalOllama, true);
      assert.equal(config.values.ollamaModel, "qwen2.5:7b");
    } finally {
      http.restore();
      restoreLm();
      restoreWindow();
      config.restore();
    }
  });

  test("unreachable Ollama warns and hands the user back to the provider choice", async () => {
    const config = mockEchoCodeConfig();
    const restoreLm = noCopilot();
    // No routes registered, so /api/tags 404s and the scan reports Ollama as down.
    const http = mockHttp({});

    const providerPicks: string[] = [];
    let warning = "";

    const restoreWindow = mockWindow({
      showQuickPick: async (items: any[]) => {
        if (items.some((i) => i.value === "local")) {
          // First time through pick Local (which fails); second time cancel out.
          providerPicks.push("top");
          return providerPicks.length === 1
            ? items.find((i: any) => i.value === "local")
            : undefined;
        }
        return undefined;
      },
      showWarningMessage: async (message: string) => {
        warning = message;
        return "Use an API Instead";
      },
      showInformationMessage: () => {},
    });

    try {
      const mod = loadAiProviderSetupModule();
      const saved = await mod.pickProviderAndModel(mockContext(), undefined);

      assert.equal(saved, false);
      assert.ok(
        warning.includes("Ollama is not responding"),
        `expected an Ollama-not-detected warning, got: ${warning}`,
      );
      assert.equal(
        providerPicks.length,
        2,
        "expected the provider choice to be shown again after the failed local branch",
      );
      assert.equal(config.values.aiProvider, undefined);
    } finally {
      http.restore();
      restoreLm();
      restoreWindow();
      config.restore();
    }
  });

  test("no installed models triggers a recommendation, pulls it, and selects it", async () => {
    const config = mockEchoCodeConfig();
    const restoreLm = noCopilot();
    const http = mockHttp({
      "/api/tags": { json: { models: [] } },
      "/api/pull": {
        ndjson: [
          JSON.stringify({ status: "pulling manifest" }),
          JSON.stringify({ status: "downloading", completed: 50, total: 100 }),
          JSON.stringify({ status: "success" }),
        ],
      },
    });

    let recommendedLabel = "";

    const restoreWindow = mockWindow({
      showQuickPick: async (items: any[]) => {
        if (items.some((i) => i.value === "local")) {
          return items.find((i: any) => i.value === "local");
        }
        // The model-install pick: the recommendation is always the first entry.
        recommendedLabel = items[0].label;
        return items[0];
      },
      showWarningMessage: async () => "Recommend a Model",
      showInformationMessage: async (_msg: string, options: any) =>
        // Only the modal install confirmation passes an options object.
        options && options.modal ? "Install" : undefined,
    });

    const context = mockContext();

    try {
      const mod = loadAiProviderSetupModule();
      const saved = await mod.pickProviderAndModel(context, undefined);

      assert.equal(saved, true);
      assert.equal(config.values.aiProvider, "ollama");

      const pulled = http.seen.find((r) => r.path === "/api/pull");
      assert.ok(pulled, "expected a pull request to Ollama");

      const pullBody = JSON.parse(pulled!.body);
      assert.equal(
        pullBody.name,
        config.values.ollamaModel,
        "the pulled model should be the one saved as the active model",
      );
      assert.ok(
        recommendedLabel.includes(String(config.values.ollamaModel)),
        `recommendation "${recommendedLabel}" should match saved model ${config.values.ollamaModel}`,
      );
    } finally {
      http.restore();
      restoreLm();
      restoreWindow();
      config.restore();
    }
  });

  test("a failed pull is reported and does not select the model", async () => {
    const config = mockEchoCodeConfig();
    const restoreLm = noCopilot();
    // Ollama answers 200 and reports the failure inside the NDJSON stream.
    const http = mockHttp({
      "/api/tags": { json: { models: [] } },
      "/api/pull": {
        ndjson: [
          JSON.stringify({ status: "pulling manifest" }),
          JSON.stringify({ error: "model 'nope' not found" }),
        ],
      },
    });

    let errorShown = "";
    let warningCount = 0;

    const restoreWindow = mockWindow({
      showQuickPick: async (items: any[]) => {
        if (items.some((i) => i.value === "local")) {
          // Pick Local the first time; cancel when we land back at the top choice.
          return warningCount <= 1
            ? items.find((i: any) => i.value === "local")
            : undefined;
        }
        return items[0];
      },
      showWarningMessage: async () => {
        warningCount += 1;
        // Offer to install the first time; back out to the API branch afterwards.
        return warningCount === 1 ? "Recommend a Model" : "Use an API Instead";
      },
      showInformationMessage: async (_msg: string, options: any) =>
        options && options.modal ? "Install" : undefined,
      showErrorMessage: async (message: string) => {
        errorShown = message;
        return undefined;
      },
    });

    try {
      const mod = loadAiProviderSetupModule();
      const saved = await mod.pickProviderAndModel(mockContext(), undefined);

      assert.equal(saved, false);
      assert.ok(
        errorShown.includes("not found"),
        `expected the pull failure to surface, got: ${errorShown}`,
      );
      assert.equal(
        config.values.ollamaModel,
        undefined,
        "a model that failed to download must not be saved as the active model",
      );
    } finally {
      http.restore();
      restoreLm();
      restoreWindow();
      config.restore();
    }
  });

  test("hosted API branch verifies the endpoint, saves settings, and keeps the key in secret storage", async () => {
    const config = mockEchoCodeConfig();
    const restoreLm = noCopilot();
    const http = mockHttp({
      "/v1/models": {
        json: { data: [{ id: "some-model" }, { id: "other-model" }] },
      },
    });

    const restoreWindow = mockWindow({
      showQuickPick: async (items: any[]) => {
        if (items.some((i) => i.value === "local")) {
          return items.find((i: any) => i.value === "api");
        }
        if (items.some((i) => i.value === "copilot")) {
          // "Another model API", not Copilot.
          return items.find((i: any) => i.value === "api");
        }
        if (items.some((i) => i.value === "custom")) {
          return items.find((i: any) => i.value === "custom");
        }
        return items.find((i: any) => i.value === "other-model");
      },
      showInputBox: async (options: any) => {
        if (String(options.prompt).includes("base URL")) {
          return "http://localhost:9999/v1";
        }
        return "test-key-123";
      },
      showInformationMessage: () => {},
      showWarningMessage: async () => undefined,
      showErrorMessage: async () => undefined,
    });

    const context = mockContext();
    const { initSecretStorage } = nodeRequire(secretStorePath);
    initSecretStorage(context);

    try {
      const mod = loadAiProviderSetupModule();
      const saved = await mod.pickProviderAndModel(context, undefined);

      assert.equal(saved, true);
      assert.equal(config.values.aiProvider, "api");
      assert.equal(config.values.apiProvider, "custom");
      assert.equal(config.values.apiBaseUrl, "http://localhost:9999/v1");
      assert.equal(config.values.apiModel, "other-model");
      assert.equal(config.values.useLocalOllama, false);

      // The key belongs in the keychain, never in settings.json.
      assert.equal(context.__secrets.get("echocode.apiKey.custom"), "test-key-123");
      assert.ok(
        !Object.keys(config.values).some((k) => k.toLowerCase().includes("key")),
        "no API key should be written to settings",
      );

      const verify = http.seen.find((r) => r.path === "/v1/models");
      assert.ok(verify, "expected a model-listing call to verify reachability");
    } finally {
      http.restore();
      restoreLm();
      restoreWindow();
      config.restore();
    }
  });

  test("checkForProviderUpdates warns when the configured Ollama model vanished", async () => {
    const config = mockEchoCodeConfig();
    config.values.useLocalOllama = true;
    config.values.ollamaModel = "removed-model";

    const restoreLm = noCopilot();
    const http = mockHttp({
      "/api/tags": { json: { models: [{ name: "llama3.2" }] } },
    });

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
      http.restore();
      restoreLm();
      restoreWindow();
      config.restore();
    }
  });
});
