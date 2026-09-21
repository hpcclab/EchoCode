# Keyboard Shortcuts

## For users

EchoCode is keyboard-first. Almost every shortcut uses the **Ctrl+Alt** prefix so it does not collide with VS Code's own bindings.

**Dev-only** shortcuts do nothing in Student mode — see [Modes and Guidance](Modes-and-Guidance).

### The essentials

| Shortcut | Does |
|---|---|
| **F1** | Read the hotkey guide aloud |
| **Ctrl+Alt+X** | Stop speech immediately |
| **Ctrl+Alt+9** | Toggle Student / Dev mode |
| **Ctrl+Alt+U** / **Ctrl+Alt+D** | Speech faster / slower |

### Reading code

| Shortcut | Does | Dev only |
|---|---|---|
| **Ctrl+Alt+L** | Read the current line verbatim | |
| **Ctrl+Alt+K** | Explain the current line in plain language | Yes |
| **Ctrl+Alt+R** | Toggle character read-out (speaks each character you type) | |
| **Ctrl+Alt+E W** | Where am I? — describe cursor position in context | |

### Navigation

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+Down** | Jump to next function |
| **Ctrl+Alt+Up** | Jump to previous function |
| **Ctrl+Alt+P** | Navigate to next file |
| **Ctrl+Alt+[** | Move to next folder |
| **Ctrl+Alt+]** | Move to previous folder |

### Understanding code (Dev mode)

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+E F** | Summarise the current function |
| **Ctrl+Alt+E C** | Summarise the current class |
| **Ctrl+Alt+E P** | Summarise the whole file |
| **Ctrl+Alt+A** | Toggle inline annotations |
| **Ctrl+Alt+S** | Speak the next annotation |
| **Ctrl+Alt+Q** | Read all annotations |
| **Ctrl+Alt+N** | Analyse Big-O complexity |
| **Ctrl+Alt+B** | Read next Big-O recommendation |
| **Ctrl+Alt+H** | Read all Big-O recommendations |
| **Ctrl+Alt+C** | Open the Chat Tutor |

### Errors (Dev mode)

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+G** | Compile and read errors — C++ in a `.cpp` file, Python in a `.py` file |

The same chord does different things depending on the file's language, because the binding is gated on `editorLangId`.

### Voice

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+Space** | Start / stop recording in the current voice mode |
| **Ctrl+Alt+'** | Cycle voice mode (Chat → Code → Command) |
| **Ctrl+Alt+Shift+C** | Record once, insert as code |
| **Ctrl+Alt+Shift+V** | Record once, run as a command |
| **Ctrl+Alt+Shift+T** | Record once, send to the tutor |
| **Ctrl+Alt+V** | Start voice input (Dev mode) |

### Files and folders

| Shortcut | Does | Dev only |
|---|---|---|
| **Ctrl+Alt+;** | Create a file | |
| **Ctrl+Alt+F** | Create a folder | |
| **Ctrl+Alt+I** | Copy the current function name for import | Yes |
| **Ctrl+Shift+I** | Paste the generated import at the cursor | Yes |

### Assignment tracker

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+O** | Load an assignment file |
| **Ctrl+Alt+T** | Read next task |
| **Ctrl+Alt+/** | Read next *incomplete* task |
| **Ctrl+Alt+M** | Mark current task complete |
| **Ctrl+Alt+Y** | Rescan your code for completed tasks |

### Output verbosity

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+Z** | Cycle guidance level (guided → balanced → concise) |
| **Ctrl+Alt+Shift+Z** | Pick a guidance level from a list |

### Multi-key chords

Four bindings are two-step chords: **Ctrl+Alt+E** then a letter (`C`, `F`, `P`, `W`). Press and release `Ctrl+Alt+E`, then press the letter. If you pause too long VS Code cancels the chord and nothing happens.

---

## For developers

### Where bindings live

All 45 are declared in `package.json` under `contributes.keybindings`. VS Code owns dispatch entirely — EchoCode never reads raw keystrokes, with one exception noted below.

### The `when` clause is the gate

Most bindings carry a `when` clause combining two conditions:

```json
"when": "editorTextFocus && echocode:isDev"
```

- `editorTextFocus` — VS Code built-in; the binding is inert outside a text editor
- `echocode:isDev` — a **custom context key** EchoCode sets

That context key is set in `Core/program_settings/mode.js`:

```js
await vscode.commands.executeCommand("setContext", "echocode:isDev", isDev);
await vscode.commands.executeCommand("setContext", "echocode:isStudent", !isDev);
```

`refreshModeContext()` is called during activation and again whenever the mode changes. **This is the first layer of Student-mode enforcement** — a locked shortcut does not fire at all, so nothing needs to reject it. The second layer is the `guard()` wrapper, which catches Command Palette invocations that bypass keybindings entirely. See [Modes and Guidance](Modes-and-Guidance).

### Things worth knowing before you edit

**Adding a shortcut is two edits, not one.** A `contributes.commands` entry makes it appear in the Command Palette; a `contributes.keybindings` entry binds the key. Declaring a command without registering it at runtime produces a Palette entry that errors when invoked — this has already happened, see [Known Gaps](Known-Gaps).

**`Ctrl+Alt+G` is bound twice on purpose**, once per language:

```json
"when": "editorTextFocus && editorLangId == 'cpp' && echocode:isDev"
"when": "editorTextFocus && editorLangId == 'python' && echocode:isDev"
```

Mutually exclusive `when` clauses are the idiomatic way to make one chord language-sensitive.

**`Ctrl+Alt+Space` is currently declared twice with identical `when` clauses** for `echocode.toggleVoice`. Harmless — VS Code resolves to the last match — but it is redundant.

**`echocode.initializeFolderList` has a keybinding entry with an empty `key`.** It is effectively Palette-only.

**Character read-out is the one exception to "VS Code owns dispatch."** `CharacterReadOut.js` subscribes to document-change events to speak each typed character, rather than binding keys. See [Line and Character Read-Out](Line-and-Character-Read-Out).

### Suggested bindings, not enforced ones

`contributes.keybindings` is a *default*. Users remap freely in their own `keybindings.json`, so never assume a chord is the only route to a command — always keep the Command Palette path working.
