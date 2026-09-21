# Speech Handler

> **Developer page.** Users never interact with this directly — they just hear the result. The only user-visible controls are **Ctrl+Alt+U** / **Ctrl+Alt+D** (speed) and **Ctrl+Alt+X** (stop), documented in [Keyboard Shortcuts](Keyboard-Shortcuts).

## What it is

`Core/program_settings/speech_settings/speechHandler.js` — ~327 lines. Every spoken word in EchoCode goes through it, from **116 call sites across 26 files**.

That call-site count is the important fact about this module: any behaviour change here affects the entire extension at once, and there is no per-feature override. It is also why fixes belong here rather than at call sites.

## Public surface

```js
speakMessage(message)      // speak, interrupting anything in progress
stopSpeaking()             // stop current + discard queued; returns whether anything stopped
isCurrentlySpeaking()      // for tests
increaseSpeechSpeed()      // +0.1, capped at 2.0
decreaseSpeechSpeed()      // -0.1, floored at 0.5
getSpeechSpeed()
loadSavedSpeechSpeed()     // read echocode.speechSpeed into module state
registerSpeechCommands(context, outputChannel)
```

## The central design decision: interrupt, never overlap

A new message **interrupts** the one in progress. It does not queue behind it.

That is the right semantics for this extension. Arrowing down a list emits one announcement per row; a queue would fall seconds behind the cursor and narrate rows the user already passed. A stale announcement is worse than a truncated one.

But interrupting `say.js` naively produces **two voices talking at once**, which is the failure this module exists to prevent.

## Why say.js cannot be interrupted naively

The `say` package exports a **singleton holding a single child-process handle**, and `speak()` overwrites it unconditionally:

```js
// node_modules/say/platform/base.js
this.child = childProcess.spawn(command, args, options)
```

So calling `speak()` while audio is playing **orphans the previous process** — the handle is gone, nothing can ever kill it, and it talks to completion alongside the new one. say.js flags this in its own source:

```js
// TODO: If two messages are being spoken simultaneously, childD points to
//       new instance, no way to kill previous
```

And `stop()` makes it worse — it nulls the handle and calls back *before the process has exited*:

```js
stop (callback) {
  this.runStopCommand()
  this.child = null
  callback(null)      // returns before the process is dead
}
```

On Windows `runStopCommand` fires `taskkill` through an **async** `exec`, so `stop()` returns before the kill has even started while SAPI keeps talking.

The old implementation did exactly `if (isSpeaking) stopSpeaking()` then immediately `say.speak(...)`. That is the overlap recipe verbatim. Measured with a faithful mock: **30 messages in quick succession produced 29 overlaps and 30 simultaneous processes.**

## The invariant that fixes it

> **Never spawn while a child is alive.**

An interrupt kills the current utterance and *parks* the new one until the dying process reports `exit`. say.js surfaces that as the speak callback, which is the only trustworthy signal that audio has actually ceased.

Same measurement after: **0 overlaps, 2 processes** (first and last).

## State

```js
let activeUtterance = null;   // { id, resolve, interrupted? } — null when silent
let pendingUtterance = null;  // at most one; each new message supersedes the last
let utteranceId = 0;          // distinguishes an utterance from its successor
let handoffTimer = null;      // set while waiting on a dying process
```

`pendingUtterance` holds **at most one** entry. Several messages arriving during a handoff each supersede the previous, because either would interrupt the other anyway — only the newest is worth speaking.

## Flow

```
speakMessage(text)
  ├── pendingUtterance already set? resolve it (stale) and replace
  ├── something speaking?  → interruptActive()   [kill, then wait for exit]
  └── silent?              → startPending()      [spawn immediately]

say.speak callback fires (normal end OR kill-induced exit)
  → retireActive()  → resolve promise → queueMicrotask(startPending)
```

`retireActive` yields with `queueMicrotask` rather than recursing, so a backend failing synchronously does not run the whole backlog in one unbroken stack.

## Four details that are easy to break

**Stale callbacks are identified and ignored.**

```js
if (activeUtterance !== utterance) return;
```

Identity comparison, not a flag. Without it, a late exit from a killed process clears the speaking flag and starts draining state that now belongs to a newer utterance — two utterances at once.

**Every promise settles.** `stopSpeaking` resolves the in-flight entry as well as the pending one, so nothing awaiting `speakMessage` hangs forever. Features that await speech in a loop — the [annotations](Annotations-and-Big-O) read-all, the [error](Error-Reading) readout — would deadlock otherwise.

**Interrupted utterances do not log an error.** say.js reports a kill as a failure, but that is the expected outcome of an interrupt:

```js
if (err && !utterance.interrupted) console.warn("[EchoCode] say.speak error", err);
```

The old code spammed the console on every interrupt.

**There is a 2s handoff timeout.** If a killed process never reports exit, `forceHandoff` proceeds anyway and logs it. Staying permanently mute is the worse failure for an accessibility tool — a small overlap risk is the right trade.

## Voice resolution

```js
function resolveVoice() {
  const configured = config.get("voice") || null;
  if (configured) return configured;
  if (process.platform === "darwin") return null;              // system default is good
  if (process.platform === "win32") return "Microsoft Zira Desktop";
  return null;
}
```

Windows gets an explicit voice because the default SAPI voice is noticeably robotic. If Zira is not installed, say.js errors and the callback fires — degraded, not fatal.

## Speed

`speechSpeed` is a **module-level variable**, not read per call. `loadSavedSpeechSpeed()` pulls it from `echocode.speechSpeed` at activation; the increase/decrease commands mutate it and persist with `config.update`.

Note the manifest also declares `echocode.rate`, which this module does not read. `speechSpeed` is the live value. That is a real inconsistency — see [Known Gaps](Known-Gaps).

## Cost, and why nothing should await speech before UI

Measured: **`say.speak`'s callback fires after ~5.2 seconds for one short sentence.** It resolves on *completion of playback*, not on start.

That is why `speak()` in `aiProviderSetup.js` is fire-and-forget. Awaiting it held the quick pick closed for the full utterance at every step of setup — several seconds per step, for speech the user could interrupt anyway.

**Rule: never `await speakMessage()` before rendering UI.** Await it only when sequencing matters, as in a multi-item read-out.

## Testing it

Do not call the real backend in tests — it is audible and adds seconds per case. Every suite replaces the module in `require.cache`:

```js
nodeRequire.cache[speechHandlerPath] = {
  id: speechHandlerPath, filename: speechHandlerPath, loaded: true,
  exports: { speakMessage: async () => {} },
};
```

To test the handler itself, mock `say` instead — and model it faithfully: one overwritable child handle, and a `stop()` that returns before the process dies. A naive mock where `stop()` is synchronous and instant will not reproduce the overlap bug, so it will not catch a regression.
