const vscode = require("vscode");
const say = require("say");
const nvda = require("./nvdaBridge");

let speechSpeed = 1.0;
let isSpeaking = false;
let currentSpeechProcess = null;

// Load saved speech speed from VS Code settings
function loadSavedSpeechSpeed() {
  const config = vscode.workspace.getConfiguration("echocode");
  speechSpeed = config.get("speechSpeed") || 1.0;
}

// Save speech speed to VS Code settings
function saveSpeechSpeed() {
  const config = vscode.workspace.getConfiguration("echocode");
  config.update("speechSpeed", speechSpeed, true);
}

// Increase speech speed
function increaseSpeechSpeed() {
  speechSpeed = Math.min(2.0, speechSpeed + 0.1);
  saveSpeechSpeed();
  return speechSpeed;
}

// Decrease speech speed
function decreaseSpeechSpeed() {
  speechSpeed = Math.max(0.5, speechSpeed - 0.1);
  saveSpeechSpeed();
  return speechSpeed;
}

// Get current speech speed
function getSpeechSpeed() {
  return speechSpeed;
}

/**
 * EchoCode speaks one utterance at a time, and a new message interrupts the one in
 * progress rather than waiting behind it — a stale announcement is worse than a
 * truncated one.
 *
 * Doing that safely is the whole point of the machinery below, because say.js cannot be
 * interrupted naively. Its `say` export is a singleton holding a single `this.child`,
 * and `speak()` overwrites that handle unconditionally:
 *
 *   this.child = childProcess.spawn(command, args, options)
 *
 * so calling speak() while audio is playing orphans the previous process — the handle is
 * gone, nothing can kill it, and it talks over the new utterance to completion. say.js
 * flags this in its own source ("no way to kill previous"). Worse, `stop()` nulls the
 * handle and returns *before* the process exits; on Windows it shells out to `taskkill`
 * through an async exec, so it returns before the kill has even started and SAPI keeps
 * talking. "Stop then immediately speak" is therefore exactly how two voices end up
 * running at once.
 *
 * The invariant that prevents it: never spawn while a child is alive. An interrupt kills
 * the current utterance and parks the new one until the dying process reports `exit` —
 * say.js surfaces that as the speak callback, which is the only trustworthy signal that
 * the audio has actually ceased.
 */

// The utterance being spoken right now: { id, resolve }. Null when silent.
let activeUtterance = null;

// The utterance waiting for the active one to die: { text, resolve }. At most one —
// each new message supersedes the last, since either would interrupt the other anyway.
let pendingUtterance = null;

// Distinguishes an utterance from its successor so a late callback can be ignored.
let utteranceId = 0;

// Set while an interrupt is waiting on a dying process; see forceHandoff.
let handoffTimer = null;

// A killed process should report exit almost immediately. If one wedges, staying silent
// forever is the worse failure, so give up waiting after this and start the next
// utterance anyway.
const HANDOFF_TIMEOUT_MS = 2000;

// Resolve the voice to speak with, from settings or a per-platform default.
function resolveVoice() {
  const config = vscode.workspace.getConfiguration("echocode");
  const configured = config.get("voice") || null;
  if (configured) return configured;

  const platform = process.platform;
  if (platform === "darwin") {
    // macOS: 'Samantha' is a high quality default, or 'Alex'.
    // Passing null often defaults to user's system pref, which is usually good.
    return null;
  }
  if (platform === "win32") {
    // Windows: Try forcing 'Microsoft Zira Desktop' (US English Female)
    // or 'Microsoft David Desktop' (US English Male) if available.
    // Otherwise, leaving it null uses the robotic default SAPI voice.
    return "Microsoft Zira Desktop";
  }
  return null;
}

function clearHandoffTimer() {
  if (handoffTimer) {
    clearTimeout(handoffTimer);
    handoffTimer = null;
  }
}

/**
 * Retires the active utterance and starts whatever is pending. Called when a process
 * reports exit — the point at which its audio has genuinely stopped.
 */
function retireActive() {
  clearHandoffTimer();

  if (activeUtterance) {
    const { resolve } = activeUtterance;
    activeUtterance = null;
    resolve();
  }

  isSpeaking = false;
  currentSpeechProcess = null;

  // Yield rather than recursing: a backend failing synchronously would otherwise run
  // the whole backlog in one unbroken stack.
  queueMicrotask(startPending);
}

/**
 * Spawns the pending utterance, if there is one and nothing is currently speaking.
 * The "nothing is currently speaking" half is the no-overlap guarantee.
 */
function startPending() {
  if (activeUtterance || !pendingUtterance) return;

  const entry = pendingUtterance;
  pendingUtterance = null;

  const utterance = { id: (utteranceId += 1), resolve: entry.resolve };
  activeUtterance = utterance;
  isSpeaking = true;

  try {
    const returned = say.speak(entry.text, resolveVoice(), speechSpeed, (err) => {
      // Superseded: a later utterance owns the speaker now, so this callback is the
      // tail end of a process we already stopped caring about.
      if (activeUtterance !== utterance) return;

      // An interrupted utterance is reported as a failure by say.js. That is the
      // expected outcome of an interrupt, not something to warn about.
      if (err && !utterance.interrupted) {
        console.warn("[EchoCode] say.speak error", err);
      }
      retireActive();
    });

    // say.js attaches no 'error' listener to its child, so a missing TTS binary
    // (e.g. no festival on Linux) is an uncaught exception, and the exit callback may
    // never arrive to retire the utterance. say 0.16 returns nothing from speak() but
    // exposes the child as say.child.
    const child =
      returned && typeof returned.on === "function" ? returned : say.child;
    if (child && typeof child.on === "function") {
      child.on("error", (err) => {
        if (activeUtterance !== utterance) return;
        console.warn("[EchoCode] TTS unavailable; continuing without speech", err);
        retireActive();
      });
    }
    currentSpeechProcess = say;
  } catch (err) {
    // Gracefully degrade when TTS backend is unavailable (e.g., headless CI, missing 'say')
    console.warn("[EchoCode] TTS unavailable; continuing without speech", err);
    retireActive();
  }
}

/**
 * Last resort when a killed process never reports exit. Waiting forever would leave
 * EchoCode permanently mute, which is worse than the overlap risk of proceeding.
 */
function forceHandoff() {
  handoffTimer = null;
  if (!activeUtterance) return;

  console.warn(
    `[EchoCode] speech process did not exit within ${HANDOFF_TIMEOUT_MS}ms; continuing`,
  );
  retireActive();
}

/**
 * NVDA routing.
 *
 * When NVDA is running, announcements go to NVDA (see nvdaBridge.js) rather than to
 * EchoCode's own voice, so the two never talk over each other.
 *
 * NVDA accepts text and returns at once. Many callers `await speakMessage(...)` before
 * announcing the next thing, and if that promise resolved immediately the next
 * announcement would cut the first one off. So the promise resolves when NVDA has finished:
 *
 *   - NVDA 2026.3+: poll nvdaController_isSpeaking until it reports silence.
 *   - Older NVDA (isSpeaking unsupported): wait an estimate of the speaking time, from the
 *     `echocode.nvdaWordsPerMinute` setting.
 *
 * A later announcement or a stop resolves it early.
 */

// The announcement NVDA is still speaking: { timer, resolve }.
let nvdaUtterance = null;

const NVDA_POLL_MS = 100;
// NVDA queues speech through its event loop, so for a moment after speakText it may still
// report silence. Silence only counts as "finished" once speech was seen, or after this.
const NVDA_START_GRACE_MS = 600;
// isSpeaking is true for any NVDA speech, including NVDA reading the user's own typing or
// cursor moves. Cap the wait so a busy NVDA can't stall EchoCode's announcements.
const NVDA_MAX_WAIT_FACTOR = 2;
const NVDA_MAX_WAIT_EXTRA_MS = 3000;

// Notifications EchoCode showed recently: [{ text, at }]. VS Code announces its
// notifications to screen readers itself, so with NVDA running, speaking the same text
// again is a duplicate.
let recentNotifications = [];
const NOTIFICATION_DEDUPE_MS = 2000;

function settleNvdaUtterance() {
  if (!nvdaUtterance) return;
  const { timer, resolve } = nvdaUtterance;
  nvdaUtterance = null;
  clearTimeout(timer);
  resolve();
}

function estimateSpeechMs(text) {
  const configured = vscode.workspace.getConfiguration("echocode").get("nvdaWordsPerMinute");
  const wpm = typeof configured === "number" && configured > 0 ? configured : 180;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round(300 + (words * 60000) / Math.max(60, wpm));
}

function normalizeForCompare(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when `text` says what a notification shown in the last couple of seconds already
 * said: the same words, one containing the other, or nearly all of its words in common.
 */
function duplicatesRecentNotification(text) {
  const now = Date.now();
  recentNotifications = recentNotifications.filter(
    (n) => now - n.at <= NOTIFICATION_DEDUPE_MS,
  );
  if (!recentNotifications.length) return false;

  const spoken = normalizeForCompare(text);
  if (!spoken) return false;
  const spokenWords = spoken.split(" ");

  return recentNotifications.some(({ text: shown }) => {
    if (!shown) return false;
    if (shown === spoken || shown.includes(spoken)) return true;
    // A short notification inside a long announcement doesn't make the rest redundant.
    if (spoken.includes(shown) && shown.length >= spoken.length * 0.6) return true;
    const shownWords = new Set(shown.split(" "));
    const common = spokenWords.filter((w) => shownWords.has(w)).length;
    return common / spokenWords.length >= 0.8;
  });
}

function speakThroughNvda(text) {
  const skipDuplicates = vscode.workspace
    .getConfiguration("echocode")
    .get("nvdaSkipNotificationDuplicates", true) !== false;
  if (skipDuplicates && duplicatesRecentNotification(text)) {
    // NVDA is already reading the notification; saying it again is just noise.
    return Promise.resolve();
  }

  // If the built-in voice was mid-sentence (NVDA was started just now), silence it.
  if (activeUtterance || pendingUtterance) stopBuiltInSpeech();

  if (!nvda.speak(text, { interrupt: true })) return null;

  // The previous announcement has just been cut off by this one.
  settleNvdaUtterance();
  return new Promise((resolve) => {
    const entry = { resolve, timer: null };
    nvdaUtterance = entry;

    const finish = () => {
      if (nvdaUtterance !== entry) return; // superseded or stopped; already resolved
      nvdaUtterance = null;
      resolve();
    };

    const estimate = estimateSpeechMs(text);
    const startedAt = Date.now();
    const deadline = startedAt + estimate * NVDA_MAX_WAIT_FACTOR + NVDA_MAX_WAIT_EXTRA_MS;
    let heardSpeech = false;

    const poll = () => {
      if (nvdaUtterance !== entry) return;
      const speaking = nvda.isSpeaking();

      if (speaking === null) {
        // This NVDA can't report it: wait out the rest of the estimate instead.
        const remaining = Math.max(0, estimate - (Date.now() - startedAt));
        entry.timer = setTimeout(finish, remaining);
        return;
      }
      if (speaking) heardSpeech = true;

      const now = Date.now();
      const silentForReal =
        !speaking && (heardSpeech || now - startedAt >= NVDA_START_GRACE_MS);
      if (silentForReal || now >= deadline) {
        finish();
        return;
      }
      entry.timer = setTimeout(poll, NVDA_POLL_MS);
    };

    entry.timer = setTimeout(poll, NVDA_POLL_MS);
  });
}

/**
 * Records EchoCode's own notifications so a spoken duplicate can be skipped while NVDA is
 * running. Wraps this extension's copy of the show*Message functions (each extension gets
 * its own `vscode` API object, so nothing outside EchoCode is affected). Call once from
 * activate().
 */
function installNotificationTracking() {
  for (const name of [
    "showInformationMessage",
    "showWarningMessage",
    "showErrorMessage",
  ]) {
    const original = vscode.window[name];
    if (typeof original !== "function" || original.__echocodeTracked) continue;

    const wrapped = function (message, ...rest) {
      if (typeof message === "string") {
        recentNotifications.push({ text: normalizeForCompare(message), at: Date.now() });
        if (recentNotifications.length > 20) recentNotifications.shift();
      }
      return original.call(this, message, ...rest);
    };
    wrapped.__echocodeTracked = true;

    try {
      vscode.window[name] = wrapped;
    } catch (err) {
      // A frozen API object just means no de-duplication; speech still works.
      console.warn(`[EchoCode] Could not track ${name} for NVDA de-duplication`, err);
    }
  }
}

/**
 * Speaks a message, interrupting anything already being spoken.
 *
 * Resolves once the message has finished being read aloud, or as soon as it is
 * superseded or cancelled — it never leaves a caller awaiting forever.
 *
 * The interrupt is not instantaneous: the current utterance is killed and the new one
 * starts only once that process confirms it has exited. That handoff is what stops the
 * two from talking over each other (see the note at the top of this file).
 */
function speakMessage(message) {
  const text = String(message ?? "").trim();
  if (!text) return Promise.resolve();

  if (nvda.isNvdaActive()) {
    const routed = speakThroughNvda(text);
    if (routed) return routed;
    // NVDA refused it (e.g. it just quit): fall through to the built-in voice.
  }

  return new Promise((resolve) => {
    // Anything already waiting is now stale — it never reached the speaker, and the
    // message replacing it is the one the user actually wants to hear.
    if (pendingUtterance) {
      pendingUtterance.resolve();
    }
    pendingUtterance = { text, resolve };

    if (activeUtterance) {
      interruptActive();
      return;
    }
    startPending();
  });
}

/**
 * Kills the active utterance so the pending one can take over. Does not start it — the
 * dying process's exit callback does that, which is what keeps the two from overlapping.
 */
function interruptActive() {
  if (!activeUtterance || handoffTimer) return;

  activeUtterance.interrupted = true;

  try {
    if (currentSpeechProcess) currentSpeechProcess.stop();
  } catch (err) {
    console.warn("[EchoCode] say.stop error", err);
  }

  handoffTimer = setTimeout(forceHandoff, HANDOFF_TIMEOUT_MS);
}

/**
 * Stops the current utterance and discards anything waiting — this backs the user's
 * "stop speech" command, which means stop, not pause. Returns whether there was
 * anything to stop.
 */
function stopSpeaking() {
  const nvdaWasSpeaking = Boolean(nvdaUtterance);
  settleNvdaUtterance();
  if (nvda.isNvdaActive()) nvda.cancel();

  return stopBuiltInSpeech() || nvdaWasSpeaking;
}

// Stops EchoCode's own voice (say.js) and discards anything waiting for it.
function stopBuiltInSpeech() {
  const hadPending = Boolean(pendingUtterance);
  const wasSpeaking = Boolean(activeUtterance);

  // Dropped before the kill: the exit callback can arrive synchronously, and anything
  // still pending at that moment would immediately start playing.
  if (pendingUtterance) {
    pendingUtterance.resolve();
    pendingUtterance = null;
  }

  clearHandoffTimer();

  if (activeUtterance) {
    // Retires the utterance up front so its exit callback is recognised as stale and
    // cannot advance the queue.
    const { resolve } = activeUtterance;
    activeUtterance = null;

    try {
      if (currentSpeechProcess) currentSpeechProcess.stop();
    } catch (err) {
      console.warn("[EchoCode] say.stop error", err);
    }

    isSpeaking = false;
    currentSpeechProcess = null;
    resolve();
  }

  return wasSpeaking || hadPending;
}

// True while audio is actually playing. Exposed for tests.
function isCurrentlySpeaking() {
  return Boolean(activeUtterance || nvdaUtterance);
}

// Register speech-related commands
function registerSpeechCommands(context, outputChannel) {
  // Register speech speed control commands
  const increaseSpeechSpeedCmd = vscode.commands.registerCommand(
    "echocode.increaseSpeechSpeed",
    () => {
      if (nvda.isNvdaActive()) {
        speakMessage(
          "EchoCode is speaking through NVDA. Change the speech rate in NVDA's speech settings.",
        );
        return;
      }
      const newSpeed = increaseSpeechSpeed();
      const message = `Speech speed increased to ${newSpeed.toFixed(1)}x`;
      vscode.window.showInformationMessage(message);
      outputChannel.appendLine(message);
      // Optionally announce it verbally
      speakMessage(`Speed set to ${newSpeed.toFixed(1)} times normal.`);
    }
  );

  const decreaseSpeechSpeedCmd = vscode.commands.registerCommand(
    "echocode.decreaseSpeechSpeed",
    () => {
      if (nvda.isNvdaActive()) {
        speakMessage(
          "EchoCode is speaking through NVDA. Change the speech rate in NVDA's speech settings.",
        );
        return;
      }
      const newSpeed = decreaseSpeechSpeed();
      const message = `Speech speed decreased to ${newSpeed.toFixed(1)}x`;
      vscode.window.showInformationMessage(message);
      outputChannel.appendLine(message);
      // Optionally announce it verbally
      speakMessage(`Speed set to ${newSpeed.toFixed(1)} times normal.`);
    }
  );

  // Register command to stop speech
  const stopSpeechCmd = vscode.commands.registerCommand(
    "echocode.stopSpeech",
    async () => {
      const wasSpeaking = stopSpeaking();
      if (wasSpeaking) {
        vscode.window.showInformationMessage("Speech stopped");
        outputChannel.appendLine("Speech stopped by user");
      }
    }
  );

  // Add the commands to subscriptions
  context.subscriptions.push(
    increaseSpeechSpeedCmd,
    decreaseSpeechSpeedCmd,
    stopSpeechCmd
  );
}

module.exports = {
  speakMessage,
  stopSpeaking,
  isCurrentlySpeaking,
  increaseSpeechSpeed,
  decreaseSpeechSpeed,
  getSpeechSpeed,
  loadSavedSpeechSpeed,
  registerSpeechCommands,
  installNotificationTracking,
};
