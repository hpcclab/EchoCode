const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

/**
 * Bridge to a running NVDA screen reader on Windows.
 *
 * When NVDA is running, EchoCode hands its announcements to NVDA instead of speaking them
 * with its own SAPI voice. The user then hears one voice, at the rate and in the voice they
 * chose in NVDA; NVDA's own stop key (Ctrl) silences EchoCode too; and every announcement
 * also reaches a braille display.
 *
 * The bridge talks to NVDA through the NVDA Controller Client, a small DLL that NV Access
 * publishes for exactly this purpose (nvda_<version>_controllerClient.zip on
 * download.nvaccess.org, LGPL 2.1). It is not shipped inside NVDA itself, so EchoCode looks
 * for it in:
 *
 *   1. the `echocode.nvdaControllerClientPath` setting, if set;
 *   2. <extension>/lib/nvda/<arch>/nvdaControllerClient.dll   (arch: x64, x86, arm64);
 *   3. the older naming, <extension>/lib/nvda/nvdaControllerClient64.dll / ...32.dll.
 *
 * If the DLL or koffi is missing, or this is not Windows, the bridge reports NVDA as not
 * running and EchoCode keeps using its built-in voice — it never fails loudly.
 */

// How long an "is NVDA running?" answer is trusted. The check is a local RPC call and
// cheap, but EchoCode can announce several things a second.
const RUNNING_CACHE_MS = 3000;

let api = null; // { testIfRunning, speakText, cancelSpeech, brailleMessage }
let loadAttempted = false;
let loadedFrom = null;
let lastCheck = { at: 0, running: false };

function extensionRoot() {
  // This file lives at Core/program_settings/speech_settings/.
  return path.resolve(__dirname, "..", "..", "..");
}

function archDir() {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  return "x86";
}

function candidateDllPaths() {
  const configured = vscode.workspace
    .getConfiguration("echocode")
    .get("nvdaControllerClientPath");
  const root = path.join(extensionRoot(), "lib", "nvda");
  const legacyName =
    process.arch === "ia32" ? "nvdaControllerClient32.dll" : "nvdaControllerClient64.dll";

  return [
    typeof configured === "string" && configured.trim() ? configured.trim() : null,
    path.join(root, archDir(), "nvdaControllerClient.dll"),
    path.join(root, legacyName),
    path.join(root, "nvdaControllerClient.dll"),
  ].filter(Boolean);
}

function loadApi() {
  if (loadAttempted) return api;
  loadAttempted = true;

  if (process.platform !== "win32") return null;

  const dllPath = candidateDllPaths().find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (!dllPath) {
    console.info(
      "[EchoCode] NVDA Controller Client DLL not found; using the built-in voice.",
    );
    return null;
  }

  try {
    // Required lazily: koffi is a native module and is only needed on Windows.
    const koffi = require("koffi");
    const lib = koffi.load(dllPath);
    // All four return an RPC error_status_t: 0 means success.
    api = {
      testIfRunning: lib.func("uint32 __stdcall nvdaController_testIfRunning()"),
      speakText: lib.func("uint32 __stdcall nvdaController_speakText(str16 text)"),
      cancelSpeech: lib.func("uint32 __stdcall nvdaController_cancelSpeech()"),
      brailleMessage: lib.func(
        "uint32 __stdcall nvdaController_brailleMessage(str16 message)",
      ),
    };
    // Added in controller client 3.0 / NVDA 2026.3. An older DLL lacks the export, and an
    // older NVDA answers 1717 (RPC_S_UNKNOWN_IF); either way EchoCode falls back to
    // estimating how long speech takes.
    try {
      api.isSpeaking = lib.func(
        "uint32 __stdcall nvdaController_isSpeaking(_Out_ uint8 *speaking)",
      );
    } catch {
      api.isSpeaking = null;
    }
    loadedFrom = dllPath;
    console.info(`[EchoCode] NVDA Controller Client loaded from ${dllPath}`);
  } catch (err) {
    console.warn("[EchoCode] Could not load the NVDA Controller Client", err);
    api = null;
  }
  return api;
}

function outputMode() {
  const mode = vscode.workspace.getConfiguration("echocode").get("screenReaderOutput");
  return mode === "builtin" ? "builtin" : "auto";
}

/**
 * True when announcements should go to NVDA: the setting allows it, the DLL loaded, and
 * NVDA is running right now. Re-checked every few seconds so starting or quitting NVDA
 * mid-session switches EchoCode over without a reload.
 */
function isNvdaActive() {
  if (outputMode() === "builtin") return false;
  const nvda = loadApi();
  if (!nvda) return false;

  const now = Date.now();
  if (now - lastCheck.at < RUNNING_CACHE_MS) return lastCheck.running;

  let running = false;
  try {
    running = nvda.testIfRunning() === 0;
  } catch (err) {
    console.warn("[EchoCode] nvdaController_testIfRunning failed", err);
  }
  lastCheck = { at: now, running };
  return running;
}

/**
 * Speaks through NVDA. With `interrupt`, whatever NVDA is saying is cut off first, which
 * matches EchoCode's own rule that a new announcement replaces a stale one. Returns false
 * if NVDA could not take it, so the caller can fall back to the built-in voice.
 */
function speak(text, { interrupt = true } = {}) {
  if (!api) return false;
  try {
    if (interrupt) api.cancelSpeech();
    const ok = api.speakText(text) === 0;
    // Braille is best effort; a failure here must not lose the speech.
    try {
      api.brailleMessage(text);
    } catch {
      /* no braille display, or an older NVDA */
    }
    if (!ok) lastCheck = { at: 0, running: false };
    return ok;
  } catch (err) {
    console.warn("[EchoCode] nvdaController_speakText failed", err);
    lastCheck = { at: 0, running: false };
    return false;
  }
}

function cancel() {
  if (!api) return;
  try {
    api.cancelSpeech();
  } catch (err) {
    console.warn("[EchoCode] nvdaController_cancelSpeech failed", err);
  }
}

/**
 * Whether NVDA is speaking right now: true or false, or null when this NVDA or DLL can't
 * say (older than 2026.3) or the call failed.
 */
function isSpeaking() {
  if (!api || typeof api.isSpeaking !== "function") return null;
  try {
    const out = [0];
    if (api.isSpeaking(out) !== 0) return null;
    return Boolean(out[0]);
  } catch {
    return null;
  }
}

// Where the DLL was loaded from, or null. For diagnostics and the status command.
function getLoadedPath() {
  return loadedFrom;
}

// Test hook: lets tests inject a fake API and reset the cache.
function _setApiForTests(fakeApi) {
  api = fakeApi;
  loadAttempted = true;
  loadedFrom = fakeApi ? "test" : null;
  lastCheck = { at: 0, running: false };
}

module.exports = {
  isNvdaActive,
  speak,
  cancel,
  isSpeaking,
  getLoadedPath,
  _setApiForTests,
};
