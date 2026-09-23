/**
 * Data-flow content for every EchoCode feature, consumed by generate.js.
 *
 * Layer vocabulary is taken from the "Our Proposed Approach" architecture diagram:
 * Input Layer, VS Code Environment, EchoCode Core, AI Services Layer, External Services,
 * plus the four standalone sinks (Validation & Error Interpretation, Speech Output / TTS,
 * Local Storage & State, External Commands / Extensions).
 *
 * Flags on a node:
 *   store: true   → data store (cylinder)
 *   speech: true  → Speech Output / TTS sink
 *   ai: true      → AI Services Layer
 *   back: true    → dashed return flow
 *   into / from   → which numbered step the flow attaches to (default: first / last)
 */

module.exports = [
  {
    num: 1,
    slug: "voice-input",
    title: "Voice Input",
    purpose: "Spoken language becomes a command, generated code, or a tutor question — transcribed on-device.",
    note: "Transcription is local (faster-whisper). Audio never leaves the machine; only the resulting text may reach the AI layer.",
    l0: {
      trigger: "Ctrl+Alt+Space",
      sources: [
        { name: "Microphone\n(Input Layer)", flow: "audio stream" },
        { name: "Editor Context\n(VS Code Environment)", flow: "language, selection, surrounding code" },
        { name: "Command Registry\n(voice_commands.json + VS Code)", flow: "candidate commands", store: true },
      ],
      sinks: [
        { name: "External Commands /\nExtensions", flow: "executeCommand()" },
        { name: "Editor\n(inserted code)", flow: "generated code" },
        { name: "Chat Tutor", flow: "question text" },
        { name: "Speech Output / TTS", flow: "confirmation", speech: true },
      ],
    },
    l1: {
      trigger: "hotkey",
      inputs: [
        { name: "Microphone", flow: "audio", into: 0 },
        { name: "Editor Context", flow: "code context", into: 4 },
        { name: "Command Registry", flow: "keywords", into: 3, store: true },
      ],
      steps: [
        { name: "Capture audio\n(ffmpeg → 16kHz mono WAV)", to: "wav path" },
        { name: "Transcribe locally\n(faster-whisper, base.en)", to: "transcript" },
        { name: "Normalise + reject\nempty / no-speech", to: "clean transcript" },
        { name: "Score against commands\n(Levenshtein + Jaccard)", to: "no match" },
        { name: "Route by intent\n(question? code? command?)" },
      ],
      outputs: [
        { name: "External Commands /\nExtensions", flow: "match ≥ threshold", from: 3 },
        { name: "AI Services Layer\ngenerateCodeFromVoice()", flow: "dictation", ai: true, from: 4 },
        { name: "Chat Tutor", flow: "question keywords", from: 4 },
        { name: "Speech Output / TTS", flow: "what was heard / done", speech: true, from: 4 },
      ],
      stores: [
        { name: "Temp WAV\n(deleted after use)", flow: "write / unlink", from: 0 },
        { name: "Local Storage & State\n(python path)", flow: "read interpreter", from: 1, back: true },
      ],
    },
  },

  {
    num: 2,
    slug: "chat-tutor",
    title: "Chat Tutor",
    purpose: "A conversational tutor in the sidebar; answers are constrained for listening, not reading.",
    note: "Replies are capped at four plain-text sentences. Markdown and long answers are hostile to TTS.",
    l0: {
      trigger: "Ctrl+Alt+C",
      sources: [
        { name: "Typed question\n(webview)", flow: "message text" },
        { name: "Voice Input", flow: "transcript" },
        { name: "Editor Context", flow: "open code" },
      ],
      sinks: [
        { name: "AI Services Layer\nTutor Services", flow: "prompt + history", ai: true },
        { name: "Webview panel", flow: "reply text" },
        { name: "Speech Output / TTS", flow: "reply, spoken", speech: true },
      ],
    },
    l1: {
      trigger: "open panel",
      inputs: [
        { name: "Webview message\n(userInput)", flow: "text", into: 0 },
        { name: "Voice transcript", flow: "text", into: 0 },
        { name: "Editor Context", flow: "code", into: 1 },
      ],
      steps: [
        { name: "Receive message\n(onDidReceiveMessage)", to: "raw text" },
        { name: "Assemble prompt\nBASE_PROMPT + history + turn", to: "messages[]" },
        { name: "Dispatch to provider\nrequestTextFromMessages()", to: "reply" },
        { name: "Render + speak reply" },
      ],
      outputs: [
        { name: "AI Services Layer", flow: "request", ai: true, from: 2 },
        { name: "Webview panel\n(postMessage)", flow: "reply", from: 3 },
        { name: "Speech Output / TTS", flow: "spoken reply", speech: true, from: 3 },
      ],
      stores: [
        { name: "Conversation history\n(in memory, session only)", flow: "append / read", from: 1 },
      ],
    },
  },

  {
    num: 3,
    slug: "annotations-bigo",
    title: "Annotations and Big-O",
    purpose: "Line-level review of the open file, stepped through one finding at a time.",
    note: "A local rules pass runs first, so findings appear with no model configured. The AI pass adds depth on top.",
    l0: {
      trigger: "Ctrl+Alt+A / Ctrl+Alt+N",
      sources: [
        { name: "Open document\n(VS Code Environment)", flow: "source + line numbers" },
        { name: "Guidance level", flow: "verbosity", store: true },
      ],
      sinks: [
        { name: "AI Services Layer\nAnalysis Services", flow: "numbered source", ai: true },
        { name: "Editor decorations", flow: "per-line notes" },
        { name: "Speech Output / TTS", flow: "one finding at a time", speech: true },
      ],
    },
    l1: {
      trigger: "hotkey",
      inputs: [
        { name: "Open document", flow: "source", into: 0 },
        { name: "Guidance level", flow: "format", into: 4, store: true },
      ],
      steps: [
        { name: "Read file with line numbers", to: "numbered source" },
        { name: "Local rules pass\n(instant, no AI)", to: "early findings" },
        { name: "AI analysis pass\nanalyzeAI()", ai: true, to: "response stream" },
        { name: "Extract findings\nextractJsonObjectsFromStream()", to: "findings[]" },
        { name: "Decorate + enqueue\n(guidance-formatted)" },
      ],
      outputs: [
        { name: "AI Services Layer", flow: "prompt", ai: true, from: 2 },
        { name: "Editor decorations", flow: "applyDecoration()", from: 4 },
        { name: "Speech Output / TTS", flow: "dequeue on Ctrl+Alt+S", speech: true, from: 4 },
        { name: "Audio ping\n(queue empty)", flow: "non-verbal cue", from: 4 },
      ],
      stores: [
        { name: "Finding queue\n(Queue class)", flow: "enqueue / dequeue", from: 4 },
      ],
    },
  },

  {
    num: 4,
    slug: "code-summaries",
    title: "Code Summaries",
    purpose: "Plain-language summary of the function, class, or file containing the cursor.",
    note: "Scope comes from VS Code's own symbol provider, so accuracy tracks whichever language extension the user has installed.",
    l0: {
      trigger: "Ctrl+Alt+E then F / C / P",
      sources: [
        { name: "Cursor position\n(VS Code Environment)", flow: "position" },
        { name: "Document symbols\n(language extension)", flow: "DocumentSymbol tree" },
      ],
      sinks: [
        { name: "AI Services Layer\nTutor Services", flow: "scoped source", ai: true },
        { name: "Speech Output / TTS", flow: "spoken summary", speech: true },
      ],
    },
    l1: {
      trigger: "hotkey",
      inputs: [
        { name: "Cursor position", flow: "position", into: 0 },
        { name: "Symbol provider", flow: "symbol tree", into: 0 },
      ],
      steps: [
        { name: "Request document symbols\nexecuteDocumentSymbolProvider", to: "tree" },
        { name: "Find smallest enclosing symbol\ninRange() + rangeSize()", to: "range" },
        { name: "Extract source for range", to: "code" },
        { name: "Summarise\nrequestTextFromMessages()", ai: true, to: "summary" },
        { name: "Speak summary" },
      ],
      outputs: [
        { name: "AI Services Layer", flow: "prompt", ai: true, from: 3 },
        { name: "Speech Output / TTS", flow: "summary", speech: true, from: 4 },
        { name: "Editor\n(no modification)", flow: "read-only", back: true, from: 2 },
      ],
      stores: [],
    },
  },

  {
    num: 5,
    slug: "error-reading",
    title: "Error Reading",
    purpose: "Python and C++ problems compiled or linted, then read aloud in beginner language.",
    note: "Save-triggered linting exists but is not wired into activation — only the manual Ctrl+Alt+G path runs today.",
    l0: {
      trigger: "Ctrl+Alt+G",
      sources: [
        { name: "Source file on disk\n(.py / .cpp)", flow: "file path" },
        { name: "Guidance level", flow: "verbosity", store: true },
      ],
      sinks: [
        { name: "Validation Tools\n(pylint / g++)", flow: "spawn + parse" },
        { name: "Validation & Error\nInterpretation", flow: "simplified findings" },
        { name: "Speech Output / TTS", flow: "critical errors", speech: true },
        { name: "Output channel", flow: "full findings" },
      ],
    },
    l1: {
      trigger: "hotkey",
      inputs: [
        { name: "Source file path", flow: "path", into: 0 },
        { name: "Guidance level", flow: "format", into: 3, store: true },
      ],
      steps: [
        { name: "Select toolchain\nby languageId", to: "command" },
        { name: "Probe availability\n(cached)", to: "available?" },
        { name: "Run analyser\npylint --output-format=json / g++", to: "raw output" },
        { name: "Parse + classify\ncritical vs informational", to: "findings[]" },
        { name: "Simplify wording\nsimplifyError()" },
      ],
      outputs: [
        { name: "Validation Tools\n(External Services)", flow: "spawn", from: 2 },
        { name: "Validation & Error\nInterpretation", flow: "findings", from: 3 },
        { name: "Speech Output / TTS", flow: "critical only", speech: true, from: 4 },
        { name: "Output channel", flow: "all findings", from: 4 },
      ],
      stores: [
        { name: "Availability cache\n+ attempt latch", flow: "read / set", from: 1 },
      ],
    },
  },

  {
    num: 6,
    slug: "line-character-readout",
    title: "Line and Character Read-Out",
    purpose: "Read the current line, explain what it does, or hear every character as it is typed.",
    note: "Line reading speaks trimmed text, so indentation is lost — Ctrl+Alt+E W compensates by describing position in context.",
    l0: {
      trigger: "Ctrl+Alt+L / K / R",
      sources: [
        { name: "Cursor + line text\n(VS Code Environment)", flow: "line, position" },
        { name: "Document change events", flow: "typed character" },
      ],
      sinks: [
        { name: "Speech Output / TTS", flow: "line, description, or character", speech: true },
      ],
    },
    l1: {
      trigger: "hotkey",
      inputs: [
        { name: "Cursor + line text", flow: "line", into: 0 },
        { name: "onDidChangeTextDocument", flow: "change event", into: 3 },
      ],
      steps: [
        { name: "Read current line\n(trimmed)", to: "text" },
        { name: "Describe line\ndescribePythonLine() — rule-based", to: "description" },
        { name: "Toggle character read-out\n(subscribe / dispose)", to: "listening state" },
        { name: "Speak character to left\nof cursor" },
      ],
      outputs: [
        { name: "Speech Output / TTS\n(verbatim line)", flow: "Ctrl+Alt+L", speech: true, from: 0 },
        { name: "Speech Output / TTS\n(explanation)", flow: "Ctrl+Alt+K", speech: true, from: 1 },
        { name: "Speech Output / TTS\n(each character)", flow: "while enabled", speech: true, from: 3 },
      ],
      stores: [
        { name: "Listening flag\n+ disposable", flow: "set / clear", from: 2 },
      ],
    },
  },

  {
    num: 7,
    slug: "code-navigation",
    title: "Code Navigation",
    purpose: "Move between functions, files, and folders by keyboard, with each destination announced.",
    note: "Symbol jumping delegates to the language extension, so an unsupported language has nothing to jump between.",
    l0: {
      trigger: "Ctrl+Alt+Up/Down, [ ], P, E W",
      sources: [
        { name: "Document symbols\n(language extension)", flow: "symbol tree" },
        { name: "Workspace folders", flow: "folder list" },
      ],
      sinks: [
        { name: "Editor selection\n(cursor moved)", flow: "reveal + select" },
        { name: "Speech Output / TTS", flow: "destination name", speech: true },
        { name: "Local Storage & State", flow: "navigation index", store: true },
      ],
    },
    l1: {
      trigger: "hotkey",
      inputs: [
        { name: "Symbol provider", flow: "tree", into: 0 },
        { name: "Workspace folders", flow: "paths", into: 2 },
      ],
      steps: [
        { name: "Collect jump targets\nflatten + isJumpableKind()", to: "targets[]" },
        { name: "Pick nearest in direction", to: "target" },
        { name: "Build / refresh folder list\n(watch for changes)", to: "ordered folders" },
        { name: "Move cursor or folder cursor", to: "new position" },
        { name: "Announce destination\n(name, line, enclosing symbol)" },
      ],
      outputs: [
        { name: "Editor selection", flow: "reveal", from: 3 },
        { name: "Speech Output / TTS", flow: "spoken position", speech: true, from: 4 },
      ],
      stores: [
        { name: "Folder index\n(module state)", flow: "read / advance", from: 2 },
        { name: "File index\n(module state)", flow: "read / advance", from: 3 },
      ],
    },
  },

  {
    num: 8,
    slug: "file-folder-tools",
    title: "File and Folder Tools",
    purpose: "Create files and folders relative to the current navigation folder, without the Explorer tree.",
    note: "Creation follows the navigation cursor, not the Explorer selection — that is what makes move-then-create one keyboard flow.",
    l0: {
      trigger: "Ctrl+Alt+; / Ctrl+Alt+F",
      sources: [
        { name: "Typed name\n(input box)", flow: "name" },
        { name: "Current navigation folder", flow: "target directory" },
      ],
      sinks: [
        { name: "File system\n(External Services)", flow: "write / mkdir" },
        { name: "Editor\n(new file opened)", flow: "open document" },
        { name: "Speech Output / TTS", flow: "confirmation", speech: true },
      ],
    },
    l1: {
      trigger: "hotkey",
      inputs: [
        { name: "Input box value", flow: "name", into: 1 },
        { name: "getCurrentFolder()", flow: "directory", into: 0 },
      ],
      steps: [
        { name: "Resolve target directory", to: "path" },
        { name: "Prompt for name\nshowInputBox", to: "name" },
        { name: "Guard against collision\nexistsSync", to: "safe path" },
        { name: "Create on disk\nwriteFile / mkdir", to: "created" },
        { name: "Open + confirm" },
      ],
      outputs: [
        { name: "File system", flow: "create", from: 3 },
        { name: "Editor", flow: "open new file", from: 4 },
        { name: "Speech Output / TTS", flow: "confirmation", speech: true, from: 4 },
        { name: "Speech Output / TTS\n(already exists)", flow: "refusal", speech: true, from: 2 },
      ],
      stores: [],
    },
  },

  {
    num: 9,
    slug: "file-connector",
    title: "File Connector",
    purpose: "Generate the import needed to use a function from one file in another, and paste it in.",
    note: "For C++ this writes a header the user did not ask for. Any change here must stay idempotent.",
    l0: {
      trigger: "Ctrl+Alt+I then Ctrl+Shift+I",
      sources: [
        { name: "Source file + cursor\n(function to export)", flow: "symbol, path" },
        { name: "Destination file + cursor", flow: "insertion point" },
      ],
      sinks: [
        { name: "File system\n(header generated)", flow: "write .h" },
        { name: "Editor\n(import inserted)", flow: "edit" },
        { name: "Speech Output / TTS", flow: "confirmation", speech: true },
      ],
    },
    l1: {
      trigger: "copy step",
      inputs: [
        { name: "Source file + symbols", flow: "function", into: 0 },
        { name: "Destination path", flow: "path", into: 3 },
      ],
      steps: [
        { name: "Find function at cursor\nfindFunctionAtPosition()", to: "symbol" },
        { name: "Check language compatibility\nareExtensionsCompatible()", to: "ok" },
        { name: "Extract signature + includes\n(C++ only, from file text)", to: "signature" },
        { name: "Ensure header declaration\n_ensureCppHeader()", to: "header path" },
        { name: "Generate + paste import" },
      ],
      outputs: [
        { name: "File system\n(.h created / appended)", flow: "write", from: 3 },
        { name: "Editor\n(import at cursor)", flow: "insert", from: 4 },
        { name: "Speech Output / TTS", flow: "confirmation", speech: true, from: 4 },
        { name: "Speech Output / TTS\n(incompatible)", flow: "refusal", speech: true, from: 1 },
      ],
      stores: [
        { name: "Pending connection\n(module state)", flow: "store / consume", from: 0 },
      ],
    },
  },

  {
    num: 10,
    slug: "assignment-tracker",
    title: "Assignment Tracker",
    purpose: "Turn an assignment document into a spoken task list, tracked against the code the user writes.",
    note: "Completion detection is a model comparing prose to code, so it is non-deterministic. Ctrl+Alt+M is the deterministic override.",
    l0: {
      trigger: "Ctrl+Alt+O",
      sources: [
        { name: "Assignment document\n(.docx / .pdf / text)", flow: "file" },
        { name: "User's code\n(VS Code Environment)", flow: "source for rescan" },
      ],
      sinks: [
        { name: "Doc Parser\n(mammoth / pdf-parse)", flow: "extract text" },
        { name: "AI Services Layer\nAnalysis Services", flow: "tasks vs code", ai: true },
        { name: "Speech Output / TTS", flow: "next task / progress", speech: true },
      ],
    },
    l1: {
      trigger: "load file",
      inputs: [
        { name: "Assignment document", flow: "file", into: 0 },
        { name: "User's code", flow: "source", into: 3 },
      ],
      steps: [
        { name: "Extract document text\nmammoth / pdf-parse", to: "plain text" },
        { name: "Identify tasks\nAI pass, or rule-based split", ai: true, to: "tasks[]" },
        { name: "Read next task\n(all, or incomplete only)", to: "task" },
        { name: "Rescan code against tasks\nanalyzeAI()", ai: true, to: "response" },
        { name: "Update completion flags\nupdateCompletedTasksFromAI()" },
      ],
      outputs: [
        { name: "Doc Parser\n(External Services)", flow: "parse", from: 0 },
        { name: "AI Services Layer", flow: "extract / compare", ai: true, from: 3 },
        { name: "Speech Output / TTS", flow: "task text, progress", speech: true, from: 2 },
      ],
      stores: [
        { name: "Task list + index\n(in memory, lost on reload)", flow: "read / write", from: 1 },
        { name: "Completion flags", flow: "set", from: 4 },
      ],
    },
  },

  {
    num: 11,
    slug: "ai-provider-selection",
    title: "AI Provider and Model Selection",
    purpose: "Choose and verify the backend every AI feature routes through: Copilot, local Ollama, or a hosted API.",
    note: "Provider probes run concurrently and are individually capped, so the picker opens in ~3s rather than the sum of three waits.",
    l0: {
      trigger: "first run, or Select AI Provider",
      sources: [
        { name: "Machine specs\n(CPU, RAM, GPU)", flow: "capability scan" },
        { name: "Stored settings + key", flow: "current config", store: true },
      ],
      sinks: [
        { name: "AI Services\n(Copilot / Ollama / API)", flow: "probe + verify", ai: true },
        { name: "Local Storage & State\n(settings)", flow: "persist choice", store: true },
        { name: "OS keychain\n(context.secrets)", flow: "store API key" },
        { name: "Speech Output / TTS", flow: "announced options", speech: true },
      ],
    },
    l1: {
      trigger: "invoke wizard",
      inputs: [
        { name: "Machine specs", flow: "scan", into: 3 },
        { name: "Stored settings", flow: "current", into: 0, store: true },
      ],
      steps: [
        { name: "Probe providers concurrently\ncapped 3s / 2s / 5s", to: "availability" },
        { name: "Announce + present fork\nAPI or local Ollama", to: "branch" },
        { name: "Verify endpoint answers\nbefore saving anything", to: "model list" },
        { name: "Recommend a local model\nfrom memory budget", to: "recommendation" },
        { name: "Persist choice\n(settings + keychain)" },
      ],
      outputs: [
        { name: "AI Services\n(probe / verify)", flow: "list models", ai: true, from: 2 },
        { name: "Ollama\n(pull model)", flow: "NDJSON progress", from: 3 },
        { name: "OS keychain", flow: "store key", from: 4 },
        { name: "Speech Output / TTS", flow: "row + position", speech: true, from: 1 },
      ],
      stores: [
        { name: "Local Storage & State\n(aiProvider, model)", flow: "write global", from: 4 },
      ],
    },
  },

  {
    num: 12,
    slug: "modes-guidance",
    title: "Modes and Guidance",
    purpose: "Student/Dev mode decides which features are reachable; guidance level decides how much is said.",
    note: "Mode is enforced twice — context keys stop keybindings dispatching, and guard() catches Palette and voice invocations.",
    l0: {
      trigger: "Ctrl+Alt+9 / Ctrl+Alt+Z",
      sources: [
        { name: "Stored mode + guidance\n(settings)", flow: "current values", store: true },
        { name: "Command invocation\n(any source)", flow: "command id" },
      ],
      sinks: [
        { name: "VS Code context keys\nechocode:isDev / isStudent", flow: "setContext" },
        { name: "Every explanation feature", flow: "formatted verbosity", back: true },
        { name: "Audio ping + TTS", flow: "mode announced", speech: true },
      ],
    },
    l1: {
      trigger: "toggle",
      inputs: [
        { name: "Stored settings", flow: "mode, guidance", into: 0, store: true },
        { name: "Command id", flow: "invocation", into: 2 },
      ],
      steps: [
        { name: "Read mode\ngetMode() — fails closed to student", to: "mode" },
        { name: "Publish context keys\nsetContext ×2", to: "keys set" },
        { name: "Check denylist\nSTUDENT_LOCKED_COMMANDS", to: "allowed?" },
        { name: "Format by guidance level\nformatHelpByGuidance()", to: "text" },
        { name: "Announce mode change\nping, then speech" },
      ],
      outputs: [
        { name: "VS Code keybinding filter", flow: "when: echocode:isDev", from: 1 },
        { name: "Blocked command\n(refusal spoken)", flow: "not allowed", speech: true, from: 2 },
        { name: "Explanation features", flow: "guided / balanced / concise", back: true, from: 3 },
        { name: "Audio ping + TTS", flow: "mode name", speech: true, from: 4 },
      ],
      stores: [
        { name: "Local Storage & State\n(echocode.mode)", flow: "read / write", from: 0 },
      ],
    },
  },

  {
    num: 13,
    slug: "hotkey-guide",
    title: "Hotkey Guide",
    purpose: "F1 reads EchoCode's own shortcuts aloud — the recovery path when the user has forgotten everything else.",
    note: "The spoken list is hand-maintained, not generated from package.json, so it drifts silently when a binding changes.",
    l0: {
      trigger: "F1",
      sources: [
        { name: "Hardcoded guide text\n(hotkeyGuide.js)", flow: "shortcut list", store: true },
      ],
      sinks: [
        { name: "Speech Output / TTS", flow: "shortcuts, in task order", speech: true },
      ],
    },
    l1: {
      trigger: "F1",
      inputs: [
        { name: "Guide text\n(module constant)", flow: "list", into: 0, store: true },
      ],
      steps: [
        { name: "Load guide text", to: "entries" },
        { name: "Order by task frequency\n(spoken lists are linear)", to: "ordered" },
        { name: "Speak sequentially\n(interruptible)" },
      ],
      outputs: [
        { name: "Speech Output / TTS", flow: "spoken guide", speech: true, from: 2 },
        { name: "Ctrl+Alt+X\n(user interrupt)", flow: "stop", back: true, from: 2 },
      ],
      stores: [],
    },
  },

  {
    num: 14,
    slug: "speech-output",
    title: "Speech Output / TTS",
    purpose: "The single sink every other feature speaks through. Interrupts rather than queues, and never overlaps.",
    note: "say.js holds one overwritable child handle, so spawning while audio plays orphans the old process. An interrupt must wait for exit.",
    l0: {
      trigger: "any feature calls speakMessage()",
      sources: [
        { name: "116 call sites\n(26 modules)", flow: "text to speak" },
        { name: "Speech speed setting", flow: "rate", store: true },
        { name: "Ctrl+Alt+X", flow: "stop request" },
      ],
      sinks: [
        { name: "Speech Services\n(OS TTS via say.js)", flow: "spawn one utterance" },
        { name: "Audio output", flow: "spoken audio" },
      ],
    },
    l1: {
      trigger: "speakMessage()",
      inputs: [
        { name: "Caller text", flow: "message", into: 0 },
        { name: "Speech speed", flow: "rate", into: 3, store: true },
        { name: "Stop request", flow: "Ctrl+Alt+X", into: 4 },
      ],
      steps: [
        { name: "Supersede pending utterance\n(at most one waits)", to: "pending set" },
        { name: "Something speaking?", to: "yes → interrupt" },
        { name: "Kill current + await exit\n(the no-overlap invariant)", to: "exit reported" },
        { name: "Spawn utterance\nsay.speak(text, voice, rate)", to: "callback" },
        { name: "Retire + start pending\n(identity-checked)" },
      ],
      outputs: [
        { name: "Speech Services\n(External Services)", flow: "child process", from: 3 },
        { name: "Audio output", flow: "one voice at a time", from: 3 },
        { name: "Caller promise\n(always settles)", flow: "resolve", back: true, from: 4 },
      ],
      stores: [
        { name: "activeUtterance\n+ pendingUtterance", flow: "read / set", from: 0 },
        { name: "utteranceId\n(stale-callback guard)", flow: "increment", from: 2 },
      ],
    },
  },
];
