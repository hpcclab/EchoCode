# Known Gaps

> **Developer page.** Verified by reading the code, not inferred from behaviour. Each entry says how it was confirmed.

This page exists so nobody spends an afternoon debugging something already known. If you fix one, delete the entry.

## Dead code and unreachable commands

### Python error reading on save never runs

`extension.js` imports both of `errorHandler.js`'s entry points and **calls neither**:

```js
const { initializeErrorHandling, registerErrorHandlingCommands } = require("./Language/Python/errorHandler");
```

Those are the only two occurrences in the file — confirmed with a case-insensitive grep and a check for dynamic dispatch through the feature loader.

Consequences:

- `registerErrorHandlingCommands` registers the `onDidSaveTextDocument` listener, so **pylint has never run on save**
- It also registers `echocode.readErrors`, declared in `package.json` — so that Palette entry fails when invoked
- `initializeErrorHandling(channel)` supplies the output channel, so the module's `outputChannel` is `undefined`

**Fix:** two calls in `activate()`. Be deliberate — it switches on a toast or auto-opening panel on every Python save plus spoken errors, which is a user-visible behaviour change. The manual **Ctrl+Alt+G** path (`echocode.checkPythonErrors`) is wired separately and does work.

### `echocode.navigateFilesInCurrentFolder` is declared but never registered

In `contributes.commands`, registered nowhere in the source. Appears in the Command Palette and errors when invoked. `file_navigator.js` exports only `registerFileNavigatorCommand`, which registers `echocode.navigateToNextFile`.

Verified by extracting every `registerCommand`/`registerTextEditorCommand` string literal across all source files (including the extensionless `WhatIsThis`) and diffing against the manifest. It is the only one missing.

**Fix:** implement it, or drop the manifest entry.

### The startup log lies

[extension.js:929](../extension.js#L929) prints:

```
Commands registered: echocode.readErrors, echocode.annotate, …
```

`echocode.readErrors` is not registered (above). The line is a hardcoded string, not generated from what was actually registered, so it will drift again.

**Fix:** build it from the real registrations, or delete it.

## Inconsistencies

### `echocode.rate` is declared but never read

`package.json` declares `echocode.rate` ("Speech rate for text-to-speech"). `speechHandler.js` reads **`echocode.speechSpeed`**, which is what **Ctrl+Alt+U** / **Ctrl+Alt+D** persist.

So a user setting `rate` sees no effect. `rate` is documented and inert; `speechSpeed` is live and undocumented in the manifest.

**Fix:** pick one. Reading `rate` as the initial value and persisting speed changes to it would honour both.

### Stale ids in the student-mode denylist

`STUDENT_LOCKED_COMMANDS` in `guard.js` contains ids that no longer exist:

```
code-tutor.Annotate
code-tutor.speakNextAnnotation
code-tutor.readAllAnnotation
echocode.voiceInput
```

Harmless — a `Set` miss costs nothing — but misleading when reading the list to work out what is locked.

### Big-O commands use the `code-tutor.` prefix

`code-tutor.analyzeBigO`, `code-tutor.iterateBigOQueue`, `code-tutor.readEntireBigOQueue` — every other command is `echocode.*`. A leftover from an earlier name. Renaming is a breaking change for anyone who has remapped them.

### `Ctrl+Alt+Space` is declared twice

Two identical `contributes.keybindings` entries for `echocode.toggleVoice` with the same `when`. VS Code resolves to the last; the duplicate is redundant.

### `echocode.initializeFolderList` has an empty `key`

It has a keybindings entry with no key, making it Palette-only. Either give it a chord or drop the entry.

## Fragile by construction

### A source file with no extension

`program_features/WhatIsThis/WhatIsThis` has no `.js` suffix, and the loader references it as `moduleFile: "WhatIsThis"`. `require()` tolerates it because Node tries the literal filename first.

It works, but linters, bundlers, coverage tools, and any `find -name '*.js'` skip it silently. It is genuinely easy to conclude `echocode.readCurrentLine` is unregistered.

**Fix:** rename to `WhatIsThis.js` and update `moduleFile`.

### `npm run lint` does not run

ESLint 9 requires `eslint.config.js`; the repo has none. `.gitignore` also ignores `**/eslint.config.mjs`, which would block the obvious fix.

### `ci.yml` is a check that cannot fail

```yaml
      - name: Say Hello
        run: echo "Hello World!"
      - name: Install Dependencies
        run: npm install say
```

The whole job. `main.yml` calls it on every push to `main`/`dev` and every PR, presenting a green check that verifies nothing. See [Testing and CI](Testing-and-CI).

### Hot reload fires on your own edits

The `UserImplementation/**` watcher is workspace-relative, so developing EchoCode in its own checkout triggers feature reloads while you type. Working as designed, surprising in practice.

### A breakpoint looks identical to a broken extension

A breakpoint in an extension-host file pauses the whole extension. It presents as EchoCode failing to start, with no error anywhere. Check breakpoints before debugging an activation failure.

## Platform gaps

### Voice capture has no Linux path

`whisperService.js` branches on Windows (`dshow`) and macOS (`avfoundation`). There is no Linux branch, so voice input does not work there. Everything else does.

### The venv can bind to an unsuitable Python

`findSystemPython()` prefers 3.12 → 3.11 → 3.10 → `python3`. On macOS the last resort is Xcode's bundled **Python 3.9**, which current `faster-whisper` wheels may not support. A venv created against it can fail at install time in a way that looks like a network problem.

Also: a venv's interpreter is a **symlink**. `fs.existsSync` follows symlinks, so if Xcode is updated or the Command Line Tools are reinstalled, the link dangles and EchoCode rebuilds the whole venv. That is one way "it was fine, then it got slow" happens on a Mac.

### Windows GPU detection is best-effort

`Win32_VideoController.AdapterRAM` is capped at 4GB and wrong on modern cards, so the name is used for display only and RAM drives model sizing. Also the slowest probe in the hardware scan — PowerShell cold start alone is 1–2s.

## Behavioural things that surprise people

### Reading a line drops indentation

`readCurrentLine` speaks `line.text.trim()`. For Python, where indentation is semantic, that is real information loss. **Ctrl+Alt+E W** partly compensates by describing position in context.

### "Describe this line" is Python-only

`describePythonLine` is rule-based pattern matching, ~140 lines. Other languages get much less. Instant and offline, but not general.

### Rescanning an assignment is non-deterministic

Completion detection is a model comparing prose requirements against code, so the same inputs can give different answers across runs. `markTaskComplete` is the deterministic override.

### Assignment progress does not persist

Task list and completion are module-level state. A window reload clears them. `workspaceState` keyed by assignment path would be the fix.

### The hotkey guide is hand-maintained

The spoken list in `hotkeyGuide.js` is not generated from `package.json`. Change a keybinding and the guide silently drifts — and for a blind user a wrong shortcut is a worse failure than a stale README. No test catches it.

### Voice mode resets on reload

`currentVoiceMode` is module state in `extension.js`, so it returns to Chat after any reload. Not persisted.

## Leftover files

A stale ~620KB `external_commands.json` may sit in `Core/program_settings/program_settings/`. It was tracked before the registry moved to global storage, is now ignored, and nothing reads it. Safe to delete.
