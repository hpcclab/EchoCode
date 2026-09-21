# Line and Character Read-Out

## For users

Three ways to hear what is under or around your cursor. These are the features you will use most often, and two of them work in Student mode.

### Read the current line — Ctrl+Alt+L

Speaks the current line exactly as written. Available in both modes.

If the line is empty you hear "The current line is empty" rather than silence, so you can tell the difference between a blank line and speech failing.

### Explain the current line — Ctrl+Alt+K

Describes what the line *does* in plain language instead of reading it verbatim. **Dev mode only.**

For a Python line like:

```python
for i in range(len(items)):
```

you hear a description of a loop over the indices of `items`, rather than the punctuation read aloud.

Useful when a line is syntactically dense — a comprehension, a chained call, a decorator — and hearing the characters would not tell you much.

### Character read-out — Ctrl+Alt+R

Toggles a mode where **every character you type is spoken back**. Available in both modes.

This is proofreading support. Typing an identifier or a string literal, the read-back catches a wrong character immediately rather than at compile time.

It is loud by design. Toggle it off with the same shortcut when you are done. **Ctrl+Alt+X** stops speech if it gets ahead of you.

### Which to use when

| Situation | Use |
|---|---|
| Where am I in this line? | **Ctrl+Alt+L** |
| What does this line mean? | **Ctrl+Alt+K** |
| Did I type that correctly? | **Ctrl+Alt+R** |
| Where am I in the file? | **Ctrl+Alt+E W** — see [Code Navigation](Code-Navigation) |

---

## For developers

### Files

| File | Provides | Command |
|---|---|---|
| `program_features/WhatIsThis/WhatIsThis` | `registerReadCurrentLineCommand` | `echocode.readCurrentLine` |
| `program_features/WhatIsThis/DescribeThis.js` | `registerDescribeCurrentLineCommand` | `echocode.describeCurrentLine` |
| `program_features/WhatIsThis/CharacterReadOut.js` | `registerCharacterReadOutCommand` | `echocode.toggleCharacterReadOut` |

### A file with no extension

`program_features/WhatIsThis/WhatIsThis` has **no `.js` suffix**, and the loader references it that way:

```js
const whatIsThisModule = loadProgramFeatureModule({
  featureKey: "whatIsThis",
  featureFolder: "WhatIsThis",
  moduleFile: "WhatIsThis",        // no extension
  requiredExports: ["registerReadCurrentLineCommand"],
});
```

`require()` tolerates this because Node tries the literal filename before appending extensions. It works, but it is fragile — most tooling (linters, bundlers, `find -name '*.js'`, coverage) skips it silently. It is easy to believe `echocode.readCurrentLine` is unregistered because a `*.js` search finds nothing.

Renaming it to `WhatIsThis.js` and updating `moduleFile` would be a safe cleanup.

### Read current line

The simplest feature in the codebase, and a good template:

```js
const cursorPosition = editor.selection.active;
const currentLine = editor.document.lineAt(cursorPosition.line);
const lineText = currentLine.text.trim();
```

Note it speaks the **trimmed** text, so indentation is not conveyed. For a language where indentation is semantic — Python — that is a real information loss. `Ctrl+Alt+E W` partly covers it by describing position in context.

### Describe current line

`describePythonLine(lineText, lineNumber, document)` is a **rule-based Python describer**, not an AI call — roughly 140 lines of pattern matching that recognises loops, conditionals, assignments, definitions, imports, and so on.

Two consequences:

- **It is instant and works offline**, with no model configured.
- **It is Python-specific.** Other languages get much less. The function name says so.

This is the natural place to add another language: a `describeJavaScriptLine` alongside it and a dispatch on `document.languageId`. Routing to `AIrequest` for unrecognised lines would also work, at the cost of the instant response.

### Character read-out

The one feature that does not work through commands. It subscribes to document changes:

```js
function startListeningForChanges()   // subscribe to onDidChangeTextDocument
function stopListeningForChanges()    // dispose the subscription
function readCharacterToLeft()        // speak the character just typed
function toggleCharacterReadOut()     // flip state, start/stop listening
```

`readCharacterToLeft` reads the character to the left of the cursor after a change, which is the one just inserted.

Two things to preserve:

- **The listener is disposed when toggled off**, not merely flagged inactive. An always-subscribed handler runs on every keystroke in every document for the whole session.
- **Speech interrupts.** Fast typing means each character cuts off the previous one, so you effectively hear the most recent character. That is correct for this feature — a queue would fall seconds behind. See [Speech Handler](Speech-Handler).

### Registration and swapping

All three modules are loaded under the `whatIsThis` feature key, so `echocode.featureImplementation.whatIsThis` swaps all of them together — they share one `UserImplementation/` folder. You cannot replace only the describer. See [Custom Feature Implementations](Custom-Feature-Implementations).

Each declares its `requiredExports` to the loader, so a user implementation missing an export falls back to built-in with a logged reason rather than failing at call time.
