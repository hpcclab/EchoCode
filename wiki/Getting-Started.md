# Getting Started

## For users

### Requirements

| Thing | Why | Required? |
|---|---|---|
| VS Code 1.99.1 or newer | EchoCode's `engines.vscode` floor | Yes |
| An AI backend | Anything that explains, summarises, or annotates | For AI features only |
| Python 3.10+ with `pylint` | Reading Python errors aloud | For Python error features |
| A C++ compiler (`g++`) | Compiling and reading C++ errors | For C++ features |
| A microphone | Voice input | For voice only |

Text-to-speech needs nothing installed — EchoCode uses your operating system's built-in voice.

### First launch

EchoCode activates on `onStartupFinished`, which means it waits until VS Code has finished loading rather than slowing down startup. On first run it asks one question: **which AI backend do you want?**

You will hear the choice read aloud and see a picker with two options:

- **API model** — GitHub Copilot, or a hosted API such as OpenAI, OpenRouter, Groq, or Anthropic
- **Local model (Ollama)** — runs entirely on your own machine, nothing leaves it

Arrow through the list; each entry is announced with its position ("1 of 2"). Press Enter to choose.

If you would rather not decide now, press Escape. Nothing breaks — the non-AI features (navigation, line read-out, file tools) all work without a model. You can pick one later with **EchoCode: Select AI Provider & Model** from the Command Palette.

See [AI Providers and Models](AI-Providers-and-Models) for what each option costs and needs.

### The one shortcut worth memorising first

Press **F1** with focus in the editor and EchoCode reads its own hotkey guide aloud. If you forget everything else, that gets it back.

Second most useful: **Ctrl+Alt+X** stops speech immediately. You will want it.

### Student mode and Dev mode

EchoCode starts in **Student mode**, which deliberately locks the features that would do a student's homework for them — summaries, explanations, annotations, the chat tutor, error parsers, the assignment tracker.

If you are using EchoCode as a working developer, switch to Dev mode:

- **Ctrl+Alt+9** toggles between the two, or
- Command Palette → **EchoCode: Switch to Developer Mode**

Many shortcuts do nothing in Student mode. That is intentional, not a bug. If a shortcut seems dead, check which mode you are in — EchoCode announces the mode when it changes, with a distinct audio ping. See [Modes and Guidance](Modes-and-Guidance).

### Where to look when something goes wrong

Open **View → Output** and pick **EchoCode** from the dropdown. Almost everything EchoCode does logs there, including the exact shell commands it runs and how long they took. It is the single most useful place to look before filing a bug.

---

## For developers

### Repo layout

```
extension.js                 Activation, command wiring, voice-mode dispatch (~1050 lines)
Core/
  program_settings/
    program_settings/        AI routing, provider setup, HTTP, secrets, system scan
    speech_settings/         Text-to-speech (see Speech Handler)
    guide_settings/          Hotkey guide, guidance levels
    guard.js                 Student-mode command lock
    mode.js, modeAudio.js    Student/Dev mode state and audio cues
  Summarizer/                Class/function/program summaries
  Diagnostics/
Language/
  Python/                    pylint invocation and error handling
  registry.js                Per-language adapter lookup
program_features/            One folder per user-facing feature
  featureImplementationLoader.js
navigation_features/         Cursor, file, and folder navigation
media/                       Chat webview assets
audio_pings/                 Mode-change sounds
local_models/                Whisper model directory
```

### Running it locally

```bash
npm install
```

Press **F5** to launch the Extension Development Host. That runs `npm run compile` (`tsc -p ./`) as a pre-launch task first — if TypeScript fails, the host will not start.

```bash
npm test
```

Runs the Mocha suite. See [Testing and CI](Testing-and-CI) — it is worth reading before you touch the harness, because the test files must load under two incompatible Node runtimes.

### A warning about the debugger

A breakpoint left in an extension-host file pauses the whole extension, which looks identical to EchoCode failing to start. If activation appears to hang, check your breakpoints before debugging anything else.

### Where activation begins

`extension.js` exports `activate(context)`. In rough order it:

1. Creates the `EchoCode` output channel
2. Loads every feature module through the [feature loader](Custom-Feature-Implementations)
3. Registers commands, grouped by feature
4. Initialises secret storage, then the [AI provider](AI-Providers-and-Models) check (not awaited)
5. Initialises and builds the external command registry (see [Voice Input](Voice-Input))
6. Kicks off the voice dependency bootstrap (not awaited)
7. Registers file watchers and the configuration-change listener

Steps 4 and 6 are deliberately **not awaited** — both can take a long time, and holding activation on them used to make EchoCode appear frozen on launch. See [Architecture](Architecture) for the full path and the reasoning.

### Packaging

`.vscodeignore` controls what ships in the VSIX. Note that `node_modules` is intentionally **not** excluded: `vsce` prunes devDependencies itself, and excluding the folder would strip runtime dependencies (`say`, `sound-play`, `ffmpeg-static`, `fluent-ffmpeg`, `mammoth`, `pdf-parse`, `dotenv`) and break the published extension.
