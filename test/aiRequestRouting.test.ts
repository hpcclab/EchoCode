import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";
import { EventEmitter } from "events";

const nodeRequire = require;
const repoRoot = process.cwd();
const aiRequestModulePath = nodeRequire.resolve(
  path.join(repoRoot, "Core/program_settings/program_settings/AIrequest.js"),
);

function loadAiRequestModule() {
  delete nodeRequire.cache[aiRequestModulePath];
  return nodeRequire(aiRequestModulePath);
}

function mockEchoCodeConfig(values: Record<string, unknown>) {
  const vscodeGlobal: any = (globalThis as any).vscode;
  const original = vscodeGlobal.workspace.getConfiguration;

  vscodeGlobal.workspace.getConfiguration = () => ({
    get: (key: string, fallback: unknown) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : fallback,
  });

  return () => {
    vscodeGlobal.workspace.getConfiguration = original;
  };
}

function ensureLanguageModelStubs() {
  const vscodeGlobal: any = (globalThis as any).vscode;

  if (!vscodeGlobal.LanguageModelChatMessage) {
    vscodeGlobal.LanguageModelChatMessage = {
      User: (content: string) => ({ role: "user", content }),
      Assistant: (content: string) => ({ role: "assistant", content }),
    };
  }

  if (!vscodeGlobal.CancellationTokenSource) {
    vscodeGlobal.CancellationTokenSource = class {
      token = {};
      dispose() {}
    };
  }
}

suite("AIrequest backend routing", () => {
  test("uses Copilot path when local Ollama toggle is off", async () => {
    ensureLanguageModelStubs();
    const vscodeGlobal: any = (globalThis as any).vscode;

    const restoreConfig = mockEchoCodeConfig({
      useLocalOllama: false,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "llama3.2",
    });

    const originalLm = vscodeGlobal.lm;
    let selectCalled = 0;
    let sendRequestCalled = 0;

    vscodeGlobal.lm = {
      selectChatModels: async () => {
        selectCalled += 1;
        return [
          {
            family: "gpt-4o",
            sendRequest: async (messages: any[]) => {
              sendRequestCalled += 1;
              assert.equal(messages.length, 2);
              return {
                text: (async function* () {
                  yield "copilot answer";
                })(),
              };
            },
          },
        ];
      },
    };

    try {
      const aiRequest = loadAiRequestModule();
      const text = await aiRequest.requestTextFromMessages([
        { role: "system", content: "You are a tutor." },
        { role: "user", content: "Explain this code." },
      ]);

      assert.equal(text, "copilot answer");
      assert.equal(selectCalled, 1);
      assert.equal(sendRequestCalled, 1);
    } finally {
      vscodeGlobal.lm = originalLm;
      restoreConfig();
    }
  });

  test("uses Ollama path when local Ollama toggle is on", async () => {
    ensureLanguageModelStubs();
    const vscodeGlobal: any = (globalThis as any).vscode;

    const restoreConfig = mockEchoCodeConfig({
      useLocalOllama: true,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "llama3.2",
    });

    const originalLm = vscodeGlobal.lm;
    vscodeGlobal.lm = {
      selectChatModels: async () => {
        throw new Error(
          "Copilot path should not be used when Ollama is enabled",
        );
      },
    };

    const http = nodeRequire("http");
    const originalHttpRequest = http.request;
    let capturedPayload = "";
    let capturedPath = "";

    http.request = (options: any, callback: (res: any) => void) => {
      capturedPath = options.path;
      const req = new EventEmitter() as any;

      req.write = (chunk: string | Buffer) => {
        capturedPayload += chunk.toString();
      };

      req.end = () => {
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.setEncoding = () => {};
        callback(res);
        res.emit("data", JSON.stringify({ response: "ollama answer" }));
        res.emit("end");
      };

      return req;
    };

    try {
      const aiRequest = loadAiRequestModule();
      const text = await aiRequest.requestTextFromMessages([
        { role: "system", content: "System instructions" },
        { role: "user", content: "Hello" },
      ]);

      assert.equal(text, "ollama answer");
      assert.equal(capturedPath, "/api/generate");

      const body = JSON.parse(capturedPayload);
      assert.equal(body.model, "llama3.2");
      assert.equal(body.stream, false);
      assert.ok(
        typeof body.prompt === "string" && body.prompt.includes("USER:"),
      );
    } finally {
      http.request = originalHttpRequest;
      vscodeGlobal.lm = originalLm;
      restoreConfig();
    }
  });

  test("analyzeAI routes through Ollama when enabled", async () => {
    ensureLanguageModelStubs();
    const vscodeGlobal: any = (globalThis as any).vscode;

    const restoreConfig = mockEchoCodeConfig({
      useLocalOllama: true,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "qwen2.5:7b",
    });

    const originalLm = vscodeGlobal.lm;
    vscodeGlobal.lm = {
      selectChatModels: async () => {
        throw new Error("Copilot path should not be used in this test");
      },
    };

    const http = nodeRequire("http");
    const originalHttpRequest = http.request;
    let capturedPayload = "";

    http.request = (_options: any, callback: (res: any) => void) => {
      const req = new EventEmitter() as any;

      req.write = (chunk: string | Buffer) => {
        capturedPayload += chunk.toString();
      };

      req.end = () => {
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.setEncoding = () => {};
        callback(res);
        res.emit("data", JSON.stringify({ response: "analysis result" }));
        res.emit("end");
      };

      return req;
    };

    try {
      const aiRequest = loadAiRequestModule();
      const output = await aiRequest.analyzeAI("print('x')", "Summarize code");
      assert.equal(output, "analysis result");

      const body = JSON.parse(capturedPayload);
      assert.equal(body.model, "qwen2.5:7b");
      assert.ok(body.prompt.includes("Code to analyze:"));
    } finally {
      http.request = originalHttpRequest;
      vscodeGlobal.lm = originalLm;
      restoreConfig();
    }
  });
});
