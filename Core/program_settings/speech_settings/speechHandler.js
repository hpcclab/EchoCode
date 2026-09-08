const vscode = require("vscode");
const say = require("say");

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
    say.speak(entry.text, resolveVoice(), speechSpeed, (err) => {
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
  return Boolean(activeUtterance);
}

// Register speech-related commands
function registerSpeechCommands(context, outputChannel) {
  // Register speech speed control commands
  const increaseSpeechSpeedCmd = vscode.commands.registerCommand(
    "echocode.increaseSpeechSpeed",
    () => {
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
};
