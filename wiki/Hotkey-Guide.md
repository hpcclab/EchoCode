# Hotkey Guide

## For users

**F1** with focus in the editor reads EchoCode's shortcuts aloud.

This is the recovery command. If you forget everything else in this wiki, F1 gets it back without needing to read a screen.

It works in both Student and Dev mode.

### What you hear

The shortcuts and what they do, spoken in order. **Ctrl+Alt+X** stops it if you have heard what you needed.

### Why F1 and not something else

F1 is the conventional help key, and it is a single keypress — no chord to remember, reachable one-handed. VS Code's own "Help" is bound elsewhere, so there is no conflict inside the editor.

### If you prefer to read it

The same content is in [Keyboard Shortcuts](Keyboard-Shortcuts), organised by task and including which shortcuts are Dev-mode-only.

---

## For developers

### File

`Core/program_settings/guide_settings/hotkeyGuide.js` — ~104 lines.

```js
async function showHotkeyGuide()
function registerHotkeyGuideCommand(context)
```

Registers `echocode.readHotkeyGuide`. Called directly from `extension.js` — not behind the feature loader, and **not** wrapped in `guard()`, since help must work in every mode.

### The maintenance problem

The guide's text is **a hand-maintained list inside the module**. It is not generated from `package.json`, which means:

> Every time you add, change, or remove a keybinding, this file must be edited too — or EchoCode will read out shortcuts that do not exist and omit ones that do.

There is no test catching the drift. For a blind user this is a worse failure than a stale README: they have no way to discover the real binding except trial and error.

### Generating it instead

The manifest already holds everything needed — `contributes.keybindings` pairs `key`/`mac` with `command`, and `contributes.commands` supplies human titles. A generated guide would stay correct automatically.

Three things to handle:

1. **Speak the chord, not the string.** `ctrl+alt+e c` read literally is "control alt e c". It wants expanding to "Control Alt E, then C", and `ctrl+alt+'` to "Control Alt apostrophe".
2. **Respect the platform.** Entries carry an optional `mac` field; reading the Windows chord to a Mac user is wrong.
3. **Filter by mode.** A `when` clause containing `echocode:isDev` means the shortcut is inert in Student mode, so reading it to a student is misleading. The clause is machine-readable — check it against the current mode.

A middle option, if full generation is too much: a test that asserts every `contributes.keybindings` command appears in the guide text. That turns silent drift into a failing build.

### Ordering matters for speech

A spoken list is consumed linearly — no skimming, no scanning back. Order by task frequency, most-used first, rather than alphabetically or in manifest order. A user who needs "stop speech" should not have to sit through thirty other entries.
