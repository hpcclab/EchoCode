# Voice Input

## For users

EchoCode can listen to you. Speech is transcribed **locally** — the audio never leaves your machine — and then routed one of three ways depending on the current voice mode.

### The three modes

| Mode | What your speech becomes |
|---|---|
| **Chat Tutor** | A message to the [Chat Tutor](Chat-Tutor) |
| **Code Generation** | Code inserted at your cursor |
| **Command** | A VS Code command to run |

Press **Ctrl+Alt+'** to cycle modes. The new mode is announced aloud.

Press **Ctrl+Alt+Space** to start recording, and again to stop. On stop, EchoCode transcribes and routes according to the mode.

You can also skip the mode system and use a one-shot shortcut:

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+Shift+T** | Record once → tutor |
| **Ctrl+Alt+Shift+C** | Record once → code at cursor |
| **Ctrl+Alt+Shift+V** | Record once → run as command |

### One-time setup

Voice needs a local speech-to-text engine. The first time it is used, EchoCode offers to set up an isolated Python environment and install `faster-whisper`. Say yes and it handles the rest.

This is a real download — several hundred megabytes of dependencies — and takes a few minutes. It happens once. The progress notification stays on screen; you can keep working.

You need Python 3.10 or newer on your PATH. EchoCode prefers newer versions (3.12, then 3.11, then 3.10, then plain `python3`). On macOS, the bundled Xcode `python3` is 3.9 and is only the last resort, because current `faster-whisper` wheels may not support it.

If setup fails twice, EchoCode stops retrying and asks instead — a repeat failure is almost always something retrying will not fix (no compiler, no network, unsupported Python). The prompt offers **Retry Setup** once you have addressed it.

You can decline permanently with **Don't ask again**. Every non-voice feature keeps working.

### Choosing a microphone

**EchoCode: Select Microphone** lists your input devices. On Windows this matters — EchoCode must name your device explicitly, and will report an error if it cannot find one. On macOS the default input from System Settings is used unless you pick otherwise.

### What the Command mode understands

Command mode matches what you said against two sets of commands:

1. **EchoCode's own commands**, from a curated list of 28 entries with spoken phrasings — "toggle annotations", "summarize function", "read annotations", and so on.
2. **Every command VS Code knows about**, with keywords generated from the command id. "toggle sidebar visibility" finds `workbench.action.toggleSidebarVisibility`.

Matching is fuzzy and tolerant of transcription errors. "pleese creat fyle" still finds **Create File**. Short phrases need a closer match than long ones, so a single mumbled word does not fire something unexpected.

If what you said looks like a question — it starts with "what", "why", "how", "explain", and so on — it is routed to the tutor instead of being matched as a command, even in Command mode. Asking "how do I open a terminal?" gets you an answer rather than a terminal.

If nothing matches and it is not a question, Code Generation mode will try to write code from it.

### If voice does not work

Check **View → Output → EchoCode**:

- `[Voice] Error: No microphone found` — pick a device with **Select Microphone**
- `[ffmpeg] Spawning with args: …` — recording started; if nothing follows, the capture device is wrong
- `[Python-Whisper] …` — the transcriber's own log
- `[DependencyManager] …` — environment setup, with the duration of every command

Empty or noise-only recordings are discarded rather than sent anywhere.

---

## For developers

### The pipeline

```
Ctrl+Alt+Space
  → extension.js dispatches by currentVoiceMode
  → whisperService.startRecording()   ffmpeg → 16kHz mono WAV in tmp
  → (second press) stopAndTranscribe()
  → runLocalWhisper()                 spawn python local_whisper_stt.py <wav>
  → transcript string
  → voiceCommandRouter.tryExecuteVoiceCommand()
      ├── internal command match  → executeCommand
      ├── external command match  → executeCommand
      ├── looks like a question   → chat provider
      └── otherwise               → generateCodeFromVoice → insert at cursor
```

### Files

| File | Responsibility |
|---|---|
| `program_features/Voice/whisperService.js` | Device enumeration, ffmpeg capture, Whisper invocation |
| `program_features/Voice/local_whisper_stt.py` | Transcription; prints transcript on stdout, logs on stderr |
| `program_features/Voice/voiceCommandRouter.js` | Fuzzy matching and routing |
| `program_features/Voice/dependencyManager.js` | Python venv and `faster-whisper` bootstrap |
| `Core/program_settings/program_settings/ExternalIntentRouter.js` | The all-of-VS-Code command registry |
| `Core/program_settings/program_settings/voice_commands.json` | 28 curated EchoCode commands with spoken keywords |

### Audio capture

`ffmpeg-static` supplies the binary, so there is no system ffmpeg dependency. Platform arguments differ:

```js
// Windows — device must be named explicitly
["-f", "dshow", "-i", `audio=${micName}`, "-ac", "1", "-ar", "16000", "-y", tmpWav]

// macOS — ":0" is the default input from System Settings
["-f", "avfoundation", "-i", devInput, "-ac", "1", "-ar", "16000", "-y", tmpWav]
```

Both produce 16kHz mono, which is what Whisper wants. On Windows a `micName` of `"default"` is a hard error — dshow cannot resolve it — whereas on macOS `":0"` is a valid default.

There is no Linux branch. Voice capture does not currently work on Linux.

### Transcription

`local_whisper_stt.py` keeps a strict stream contract:

```python
sys.stdout.reconfigure(encoding='utf-8')   # Windows fix
def log(msg): sys.stderr.write(f"[Python-Whisper] {msg}\n")
```

**stdout is the transcript, stderr is diagnostics.** `runLocalWhisper` accumulates stdout as the result and forwards stderr to the output channel. Anything printed to stdout for debugging corrupts the transcript.

The model is `WhisperModel("base.en", device="cpu", compute_type="int8")` — English-only, CPU, quantised. That trades accuracy for running acceptably on a student laptop with no GPU. `local_models/whisper-tiny/` exists but `base.en` is what the script requests.

The temp WAV is unlinked in the `close` handler regardless of exit code.

### Fuzzy matching

`voiceCommandRouter.js` scores a transcript against each keyword with several measures combined:

```js
scoreTranscriptToKeyword(transcript, keyword)
  → 1.0 if either contains the other
  → else max(jaccard, tokenOrderAgnosticEdit * 0.65 + tokenEdit * 0.35)
```

Built from `levenshteinDistance`, `jaccardSimilarity` (token overlap), `bestWindowEditSimilarity` (sliding window), and `tokenAlignmentSimilarity` (best per-token pairing). Combining them is what makes it survive word reordering *and* per-word transcription noise.

Thresholds scale with phrase length:

```js
function getMinimumScoreThreshold(keyword) {
  return tokenList(keyword).length <= 1 ? 0.85 : 0.62;
}
```

Single-word keywords demand a near-exact match. Without this, one noisy syllable fires arbitrary commands.

`ExternalIntentRouter.js` applies the same technique to every VS Code command, with its own `getMinimumExternalScore` — stricter, because that pool is thousands of entries wide and a loose match there is far more likely to be wrong.

### The external command registry

`buildExternalCommandRegistry()` runs once per activation:

```js
const allCommandIds = await vscode.commands.getCommands(true);
// filter out echocode.* and _internal, then generateKeywords(id)
```

`generateKeywords()` strips prefixes (`workbench.action.`, `editor.action.`), splits camelCase and dots into words, and adds a two-word short form. `workbench.action.toggleSidebarVisibility` becomes `["toggle sidebar visibility", "toggle sidebar"]`.

The result — roughly 3300 entries, about 620KB — is written to the extension's **global storage** directory, not next to the source. That location is per-user, survives extension updates, and is cleaned up on uninstall. It is also regenerated if absent, so it must never be committed; it is in `.gitignore`.

Three implementation details worth preserving:

- **`initExternalCommandRegistry(context)` must be called before the build.** It resolves the path from the extension context and ties the file watcher's disposal to the extension lifetime.
- **Writes are atomic** — temp file then `rename`. A crash mid-write would otherwise leave a truncated 620KB file that fails to parse on next activation.
- **The watcher drops itself on `rename`.** `fs.watch` follows the inode, so after a rebuild swaps the file the old watch points at a dead one.

`getCommands()` caches in memory and returns `[]` on any read failure, so a missing registry degrades to "no external commands" rather than an error.

### Intent classification via AI

`localIntentRouter.js` and `local_intent_matcher.py` provide an AI-assisted alternative to fuzzy matching, and `AIrequest.classifyVoiceIntent()` can ask the model to pick a command. Fuzzy matching is the primary path — it is instant and needs no model.

### Voice mode state

`currentVoiceMode` is a module-level integer in `extension.js`, cycled modulo `VOICE_MODES.length`. `echocode.toggleVoice` reads it and delegates to one of three real commands:

```js
const modeCommandMap = { chat: "echocode.voiceChat", code: "echocode.voiceCode", command: "echocode.voiceCommand" };
await vscode.commands.executeCommand(modeCommandMap[activeMode] || "echocode.voiceChat");
```

Because it is module state, the mode resets to Chat on every reload. It is not persisted.

### Dependency bootstrap

`dependencyManager.js` guards a genuinely hostile operation. See its own detailed notes in [Known Gaps](Known-Gaps) for history, but the invariants are:

- **One attempt per extension host.** A module-level memo, because `extension.js` constructs a new `DependencyManager` on activation *and* on every feature reload. Instance state cannot prevent repeats.
- **Cross-window lock.** An `O_EXCL` lock file, stale after 20 minutes. Every VS Code window runs its own extension host against the same venv directory.
- **Attempt counter gates the whole slow path**, venv creation included — not just `pip install`.
- **Creation is verified.** `python -m venv` can exit 0 without producing the expected interpreter; that state previously recorded no failure and retried forever.
- **Every shell-out is bounded.** 15s probes, 3min venv, 20min pip. `exec` has no default timeout, and on Windows `python --version` can hang indefinitely on the Microsoft Store App Execution Alias.
- **`maxBuffer` is 32MB.** The default 1MB can be overrun by pip, which kills the child with ENOBUFS and surfaces as a failed install that then retries on every launch.
- **Install success is confirmed against site-packages**, not pip's exit code — a partially-installed wheel can still exit 0.

The warm path is two `existsSync` calls and no process launches. Checking by spawning `python -c "import faster_whisper"` costs over a second cold, because that import pulls in ctranslate2 and onnxruntime.
