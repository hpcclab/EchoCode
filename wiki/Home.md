# EchoCode Wiki

EchoCode is a VS Code extension that makes writing code workable without looking at the screen. It reads your errors aloud, explains lines and functions, takes voice commands, tracks assignment tasks, and narrates where your cursor is — all driven by keyboard shortcuts and speech rather than the mouse and the minimap.

It is built for blind and low-vision programmers, and for students learning to program who benefit from hearing what their code does.

## How this wiki is organised

Every feature page has the same shape:

1. **For users** — what the feature does, how to trigger it, what you will hear, and what can go wrong.
2. **For developers** — which files implement it, how the pieces connect, and where to change things.

Read only the first half if you are using EchoCode. Read both if you are working on it.

A few pages are **developer-only**, because they document machinery a user never interacts with directly — the speech engine, the feature loader, the test harness. Those are marked as such.

## Start here

| If you want to… | Read |
|---|---|
| Install it and hear something work | [Getting Started](Getting-Started) |
| Learn the keyboard shortcuts | [Keyboard Shortcuts](Keyboard-Shortcuts) |
| Point EchoCode at an AI model | [AI Providers and Models](AI-Providers-and-Models) |
| Understand every setting | [Settings Reference](Settings-Reference) |
| Understand the codebase | [Architecture](Architecture) |

## Features

**AI-backed**
- [AI Providers and Models](AI-Providers-and-Models) — Copilot, local Ollama, or a hosted API
- [Chat Tutor](Chat-Tutor) — a conversational tutor in the sidebar
- [Annotations and Big-O](Annotations-and-Big-O) — inline review of your code, read aloud
- [Code Summaries](Code-Summaries) — summarise a function, class, or whole file
- [Assignment Tracker](Assignment-Tracker) — load a homework file, track tasks against your code

**Reading your code aloud**
- [Line and Character Read-Out](Line-and-Character-Read-Out) — read or explain the current line; hear each keypress
- [Error Reading](Error-Reading) — Python and C++ errors, spoken in plain language

**Getting around**
- [Code Navigation](Code-Navigation) — jump between functions, ask where you are
- [File and Folder Tools](File-and-Folder-Tools) — create and move between files and folders
- [File Connector](File-Connector) — generate import statements between files

**Voice**
- [Voice Input](Voice-Input) — speak commands, dictate code, talk to the tutor

**Behaviour and presentation**
- [Modes and Guidance](Modes-and-Guidance) — Student vs Dev mode, and how verbose EchoCode is
- [Hotkey Guide](Hotkey-Guide) — the built-in spoken shortcut list

## Developer-only pages

- [Architecture](Architecture) — activation, module layout, the request path
- [Speech Handler](Speech-Handler) — how speech is queued, interrupted, and kept from overlapping
- [Custom Feature Implementations](Custom-Feature-Implementations) — swap any feature for your own code without forking
- [Testing and CI](Testing-and-CI) — the test harness, and why it runs on three Node versions
- [Known Gaps](Known-Gaps) — verified dead code, unreachable commands, and rough edges

## A note on accuracy

This wiki documents what the code **actually does**, verified by reading it — not what it is supposed to do. Where a feature is declared but not wired up, or works differently than its name suggests, that is stated plainly on the feature's page and collected in [Known Gaps](Known-Gaps). If you find a discrepancy, the code is the truth and this wiki is the bug.
