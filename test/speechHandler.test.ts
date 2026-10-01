import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";

const nodeRequire = require;
const repoRoot = process.cwd();
const speechHandlerModulePath = nodeRequire.resolve(
  path.join(repoRoot, "Core/program_settings/speech_settings/speechHandler.js"),
);
const sayModulePath = nodeRequire.resolve("say");

suite("EchoCode – Speech Handler", () => {
  test("speakMessage swallows child-process spawn errors", async () => {
    const { EventEmitter } = nodeRequire("events");
    const originalSayModule = nodeRequire.cache[sayModulePath];
    const originalSpeechModule = nodeRequire.cache[speechHandlerModulePath];

    const fakeSay = {
      speak: (
        _message: string,
        _voice: string | null,
        _rate: number,
        _callback: (err?: unknown) => void,
      ) => {
        const child = new EventEmitter();
        process.nextTick(() => child.emit("error", new Error("spawn festival ENOENT")));
        return child;
      },
      stop: () => {},
    };

    (nodeRequire.cache as Record<string, any>)[sayModulePath] = {
      id: sayModulePath,
      filename: sayModulePath,
      loaded: true,
      exports: fakeSay,
    };
    delete nodeRequire.cache[speechHandlerModulePath];

    let uncaught: Error | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;
    const uncaughtHandler = (error: Error) => {
      uncaught = error;
    };
    process.once("uncaughtException", uncaughtHandler);

    try {
      const speechHandler = nodeRequire(speechHandlerModulePath);
      const resolved = await Promise.race([
        speechHandler.speakMessage("test").then(() => true),
        new Promise((resolve) => {
          timeoutHandle = setTimeout(() => resolve(false), 250);
        }),
      ]);
      assert.equal(resolved, true, "speakMessage should resolve on process errors");
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(
        uncaught,
        undefined,
        `Expected no uncaught exception, got: ${uncaught?.message}`,
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      process.removeListener("uncaughtException", uncaughtHandler);
      delete nodeRequire.cache[speechHandlerModulePath];
      if (originalSpeechModule) {
        (nodeRequire.cache as Record<string, any>)[speechHandlerModulePath] =
          originalSpeechModule;
      }
      if (originalSayModule) {
        (nodeRequire.cache as Record<string, any>)[sayModulePath] =
          originalSayModule;
      } else {
        delete nodeRequire.cache[sayModulePath];
      }
    }
  });
});
