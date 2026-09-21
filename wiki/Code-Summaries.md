# Code Summaries

## For users

Get a spoken plain-language summary of a function, a class, or an entire file. This is the fastest way to orient yourself in unfamiliar code without reading it line by line.

**Dev mode only.** Locked in Student mode.

| Shortcut | Summarises |
|---|---|
| **Ctrl+Alt+E** then **F** | The function your cursor is in |
| **Ctrl+Alt+E** then **C** | The class your cursor is in |
| **Ctrl+Alt+E** then **P** | The whole file |

These are two-step chords: press and release **Ctrl+Alt+E**, then the letter. Pause too long and VS Code cancels it.

### What you get

A short spoken description of what the code does. Function and class summaries scope to the construct containing your cursor, so you do not need to select anything — put the cursor anywhere inside and ask.

If the cursor is not inside a function when you ask for a function summary, EchoCode tells you so rather than guessing.

### Suggested workflow

Opening a file you have never seen:

1. **Ctrl+Alt+E P** — what is this file for?
2. **Ctrl+Alt+Down** — jump to the first function ([Code Navigation](Code-Navigation))
3. **Ctrl+Alt+E F** — what does this one do?
4. Repeat 2 and 3 to walk the file

### Requirements

Needs an AI backend — see [AI Providers and Models](AI-Providers-and-Models). Summary length and tone follow your [guidance level](Modes-and-Guidance).

---

## For developers

### Files

| File | Responsibility |
|---|---|
| `Core/Summarizer/summaryGenerator.js` | The three commands and their prompts (~145 lines) |
| `Core/Summarizer/codeParser.js` | Range/selection helpers (~77 lines) |

### The three entry points

```js
async function summarizeClass(editor)
async function summarizeFunction(editor)
function summarizeProgram(editor)   // note: not async
```

`summarizeProgram` is synchronous because it needs no symbol resolution — the whole document is the input. The other two must locate the enclosing construct first, which is an async round trip to the language server.

### Finding the enclosing construct

Scope resolution uses VS Code's own symbol provider rather than parsing:

```js
vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri)
```

That returns a `DocumentSymbol` tree from whichever language extension owns the file, so EchoCode inherits accurate scoping for every language the user has support installed for, with no per-language code.

Two consequences:

- **Quality tracks the user's installed extensions.** In Python with Pylance the tree is excellent; in a language with no extension installed it is empty and summaries fall back or fail.
- **It is async and can be slow** on a large file or a cold language server.

`codeParser.js` supplies the geometry for picking the right symbol:

```js
function inRange(pos, range)   // does this symbol contain the cursor?
function rangeSize(range)      // how large is it?
```

`rangeSize` is what makes nesting work. Several symbols can contain the cursor — a method inside a class inside a module — so the **smallest** containing range is the most specific, and that is the one summarised.

### Request path

Each function builds a prompt around the extracted source and calls `requestTextFromMessages()` from `AIrequest.js`, then speaks the result through `speakMessage`. Backend choice is invisible here — see [AI Providers and Models](AI-Providers-and-Models).

Summaries are spoken, not written to a panel, so they are subject to speech interruption: asking for a second summary cuts off the first. See [Speech Handler](Speech-Handler).

### Registration

```js
registerSummarizerCommands(context, outputChannel)
```

Registers all three commands, each wrapped in `guard()` for Student-mode enforcement. Called directly from `extension.js` — the summarizer is **not** behind the feature-implementation loader, so unlike most features it cannot be swapped via settings. It lives under `Core/`, not `program_features/`.

### Extending it

To add a new scope (a spoken summary of a selected block, say):

1. Add a function following the existing shape — resolve scope via the symbol provider, extract text, prompt, speak.
2. Register it in `registerSummarizerCommands`, wrapped in `guard()`.
3. Declare the command in `package.json`, and a keybinding if it warrants one.
4. Add the locked command id to `STUDENT_LOCKED_COMMANDS` in `Core/program_settings/guard.js` if it is an explanation feature — summaries are locked in Student mode as a cheating-prevention measure, and a new one should match.
