import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test, setup, teardown } from "mocha";
import * as path from "path";
import { createRequire } from "module";

// See speechHandler.test.ts for why createRequire is used.
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const repoRoot = process.cwd();
const speechDir = path.join(repoRoot, "Core/program_settings/speech_settings");
const speechHandlerPath = nodeRequire.resolve(path.join(speechDir, "speechHandler.js"));
const bridgePath = nodeRequire.resolve(path.join(speechDir, "nvdaBridge.js"));
const sayPath = nodeRequire.resolve("say");

type Calls = { speak: string[]; cancel: number; braille: string[]; say: string[] };

suite("EchoCode – NVDA speech routing", () => {
  let calls: Calls;
  let originalSay: any;
  let originalWindow: Record<string, any>;
  const vscode = (globalThis as any).vscode;

  function load(nvdaRunning: boolean, extraApi: Record<string, unknown> = {}) {
    delete nodeRequire.cache[speechHandlerPath];
    delete nodeRequire.cache[bridgePath];

    (nodeRequire.cache as Record<string, any>)[sayPath] = {
      id: sayPath,
      filename: sayPath,
      loaded: true,
      exports: {
        speak: (text: string, _v: unknown, _r: unknown, cb: (e?: unknown) => void) => {
          calls.say.push(text);
          setImmediate(() => cb());
        },
        stop: () => {},
      },
    };

    const bridge = nodeRequire(bridgePath);
    bridge._setApiForTests({
      testIfRunning: () => (nvdaRunning ? 0 : 1717),
      speakText: (t: string) => {
        calls.speak.push(t);
        return 0;
      },
      cancelSpeech: () => {
        calls.cancel += 1;
        return 0;
      },
      brailleMessage: (t: string) => {
        calls.braille.push(t);
        return 0;
      },
      ...extraApi,
    });
    return nodeRequire(speechHandlerPath);
  }

  setup(() => {
    calls = { speak: [], cancel: 0, braille: [], say: [] };
    originalSay = nodeRequire.cache[sayPath];
    originalWindow = { ...vscode.window };
  });

  teardown(() => {
    delete nodeRequire.cache[speechHandlerPath];
    delete nodeRequire.cache[bridgePath];
    if (originalSay) (nodeRequire.cache as Record<string, any>)[sayPath] = originalSay;
    else delete nodeRequire.cache[sayPath];
    Object.assign(vscode.window, originalWindow);
  });

  test("speaks through NVDA, interrupting it first, when NVDA is running", async () => {
    const speech = load(true);
    await speech.speakMessage("Jumped to function binary search");
    assert.deepEqual(calls.speak, ["Jumped to function binary search"]);
    assert.deepEqual(calls.braille, ["Jumped to function binary search"]);
    assert.equal(calls.cancel, 1);
    assert.deepEqual(calls.say, [], "the built-in voice must stay silent");
  });

  test("falls back to the built-in voice when NVDA is not running", async () => {
    const speech = load(false);
    await speech.speakMessage("hello");
    assert.deepEqual(calls.speak, []);
    assert.deepEqual(calls.say, ["hello"]);
  });

  test("a new announcement settles the previous one early", async () => {
    const speech = load(true);
    let firstDone = false;
    speech.speakMessage("one two three four five six").then(() => (firstDone = true));
    assert.equal(speech.isCurrentlySpeaking(), true);
    await speech.speakMessage("next");
    assert.equal(firstDone, true);
    assert.deepEqual(calls.speak, ["one two three four five six", "next"]);
  });

  test("stopSpeaking cancels NVDA and resolves the waiting caller", async () => {
    const speech = load(true);
    const pending = speech.speakMessage("a long description of the current line");
    const before = calls.cancel;
    assert.equal(speech.stopSpeaking(), true);
    await pending;
    assert.equal(calls.cancel, before + 1);
    assert.equal(speech.isCurrentlySpeaking(), false);
  });

  test("skips speech that repeats a notification NVDA is already reading", async () => {
    const speech = load(true);
    speech.installNotificationTracking();
    vscode.window.showInformationMessage('File "search.py" has been created.');
    await speech.speakMessage('File "search.py" has been created.');
    await speech.speakMessage("Folder creation canceled.");
    assert.deepEqual(calls.speak, ["Folder creation canceled."]);
  });

  test("waits until NVDA reports it has stopped speaking (NVDA 2026.3+)", async () => {
    let speaking = false;
    const speech = load(true, {
      isSpeaking: (out: number[]) => {
        out[0] = speaking ? 1 : 0;
        return 0;
      },
    });
    let done = false;
    const pending = speech.speakMessage("x").then(() => (done = true));
    speaking = true;
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(done, false, "must not resolve while NVDA is still speaking");
    speaking = false;
    await pending;
    assert.equal(done, true);
  });

  test("does not hang if NVDA keeps talking about other things", async function () {
    this.timeout(8000);
    const speech = load(true, {
      isSpeaking: (out: number[]) => {
        out[0] = 1;
        return 0;
      },
    });
    const started = Date.now();
    await speech.speakMessage("one");
    // estimate (300 + 333) * 2 + 3000 ≈ 4.3 s
    assert.ok(Date.now() - started < 6000);
  });

  test("falls back to the time estimate on NVDA older than 2026.3", async () => {
    let polls = 0;
    const speech = load(true, {
      isSpeaking: () => {
        polls += 1;
        return 1717; // RPC_S_UNKNOWN_IF
      },
    });
    const started = Date.now();
    await speech.speakMessage("hi");
    const elapsed = Date.now() - started;
    assert.equal(polls, 1, "stops polling once NVDA says it can't answer");
    assert.ok(elapsed >= 550 && elapsed < 1500, `elapsed ${elapsed}ms`);
  });
});
