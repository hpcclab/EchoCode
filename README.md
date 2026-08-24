# Echo Code — AI-Assisted Python Debugging for Visually Impaired Programmers

**Echo Code** is a Visual Studio Code extension that brings **AI-powered tutoring, speech feedback, and accessible code navigation** to all developers — especially **visually impaired programmers**.  
Originally built for Python debugging, Echo Code has evolved into a **language-agnostic assistant** that now supports **Python**, **C++**, and general programming files across most languages.

---

## **Features**

- **Student/Developer Mode**
  Allows the user to switch from a developer mode to a student mode where some features are locked.

- **Automatic Python Error Detection**  
  Automatically detects errors using Pylint when a Python file is saved.

- **Reads Critical Errors Aloud**  
  Uses text-to-speech to read only essential errors (e.g., syntax errors, undefined variables).

- **Output Panel Logging**  
  Displays all detected errors in the VS Code Output Panel for visual reference.

- **Simplified Error Messages**  
  Provides clear, concise explanations without overwhelming beginners.

- **Summarize Functions, Programs, and Classes**  
  Automatically generates brief summaries for programs along with individual functions and classes using AI, delivered via text-to-speech (TTS).

- **AI Code Tutoring Annotations**  
  Provides inline annotations explaining **common coding mistakes** and suggesting improvements.
  - functions for generating big O(n) annotations

- **Interactive Chat Tutor**  
  An AI-powered tutor that reads your active file and answers questions or provides exercises specific to its content. Open it with `Ctrl+Alt+C` and ask about your code directly.

- **Voice Input for Tutor Chat**  
  Use your microphone to ask questions instead of typing them. Trigger voice input with a shortcut or mic button in the chat panel.

- **Auto-Detection of Missing Tools**  
  Automatically prompts users to install **Pylint** if it’s not found.

- **Function Navigation via Hotkeys**  
  Use **Ctrl+Alt+Up/Down Arrow** to navigate between function definitions, with automatic speech announcing the current function.
- **Assignment Tracker System**  
  Allows blind users to upload `.txt`, `.pdf`, or `.docx` assignment files and uses AI to extract clear task lists:
  - Tasks are read aloud one-by-one.
  - Tasks can be marked complete with a hotkey.
  - Tasks are saved to a file and displayed in the output panel.

- **Integration with GitHub Copilot**  
  Leverages GitHub Copilot and Copilot Chat for enhanced AI-powered coding assistance.

- **Optional Local Ollama Backend**
  Switch EchoCode AI features to a local Ollama model globally by enabling `echocode.useLocalOllama`, then set `echocode.ollamaBaseUrl` and `echocode.ollamaModel` in VS Code settings. Whisper speech-to-text remains unchanged.

- **AI Provider Setup Wizard (Auto-Detection)** 🆕  
  On first launch, EchoCode pops up a quick-pick menu to choose between GitHub Copilot and a local Ollama model. Available Copilot models and locally-installed Ollama models are auto-detected live — no manual typing required. Re-open the picker anytime with `EchoCode: Select AI Provider & Model`, or refresh detection with `EchoCode: Check for AI Provider/Model Updates` (useful since both Copilot's model lineup and your installed Ollama models change over time).

- **Adjustable AI Guidance Level**  
  Control how verbose AI explanations are (Guided, Balanced, or Concise) across the summarizer, Big O annotations, code annotations, and "What's This" explanations.

- **Voice Modes (Chat / Code / Command)**  
  Cycle between three voice modes and use a single hotkey to start/stop recording in whichever mode is active, or jump directly into a specific mode with its own hotkey.

- **Microphone Selection**  
  Choose which input device EchoCode uses for voice features, with manual entry and reset-to-default options.

- **Line Reader**
  Allows the user to see what is put on the line exactly and generate a brief summary that also checks for issues

- **Character Reader**
  Alerts the user to what key is being pressed while typing and alerts to where their cursor is.

- **Assignment Task Sync**  
  Rescan the workspace to refresh which assignment tasks are complete, and read tasks back in their original sequential order.

---

## **Keyboard Shortcuts**

Rows marked **Dev** only fire in Developer mode (locked in Student mode).

| Shortcut           | Command                                                      | Description                                                                          |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `Ctrl+Alt+9`       | `echocode.toggleMode`                                        | Switches between Student and Developer mode.                                         |
| `F1`               | `echocode.readHotkeyGuide`                                   | Reads out the hotkey guide, letting you choose an option by number.                  |
| `Ctrl+Alt+A`       | `echocode.annotate`                                          | Generates AI annotations for your code. **Dev**                                      |
| `Ctrl+Alt+S`       | `echocode.speakNextAnnotation`                               | Reads the next annotation, including line number and suggestion. **Dev**             |
| `Ctrl+Alt+Q`       | `echocode.readAllAnnotations`                                | Reads all the annotations in the queue. **Dev**                                      |
| `Ctrl+Alt+N`       | `code-tutor.analyzeBigO`                                     | Queues up Big O complexity annotations. **Dev**                                      |
| `Ctrl+Alt+B`       | `code-tutor.iterateBigOQueue`                                | Reads the next Big O recommendation aloud. **Dev**                                   |
| `Ctrl+Alt+H`       | `code-tutor.readEntireBigOQueue`                             | Reads all Big O recommendations one at a time. **Dev**                               |
| `Ctrl+Alt+Down`    | `echocode.jumpToNextFunction`                                | Jumps to the next function in the file.                                              |
| `Ctrl+Alt+Up`      | `echocode.jumpToPreviousFunction`                            | Jumps to the previous function.                                                      |
| `Ctrl+Alt+E C`     | `echocode.summarizeClass`                                    | Summarizes the current class. **Dev**                                                |
| `Ctrl+Alt+E F`     | `echocode.summarizeFunction`                                 | Summarizes the current function. **Dev**                                             |
| `Ctrl+Alt+E P`     | `echocode.summarizeProgram`                                  | Summarizes the full program. **Dev**                                                 |
| `Ctrl+Alt+E W`     | `echocode.whereAmI`                                          | Describes the scope the user is in.                                                  |
| `Ctrl+Alt+C`       | `echocode.openChat`                                          | Opens the EchoCode Tutor chat interface. **Dev**                                     |
| `Ctrl+Alt+V`       | `echocode.startVoiceInput`                                   | Starts voice input for the chat tutor. **Dev**                                       |
| `Ctrl+Alt+Space`   | `echocode.toggleVoice`                                       | Starts/stops voice recording using the currently active voice mode.                  |
| `Ctrl+Alt+Shift+C` | `echocode.voiceCode`                                         | Toggles voice-to-code recording directly, regardless of the active mode.             |
| `Ctrl+Alt+Shift+V` | `echocode.voiceCommand`                                      | Toggles voice-command recording directly, regardless of the active mode.             |
| `Ctrl+Alt+Shift+T` | `echocode.voiceChat`                                         | Toggles voice-to-chat recording directly, regardless of the active mode.             |
| `Ctrl+Alt+'`       | `echocode.cycleVoiceMode`                                    | Cycles the active voice mode between Chat, Code, and Command.                        |
| `Ctrl+Alt+U`       | `echocode.increaseSpeechSpeed`                               | Increases speech rate.                                                               |
| `Ctrl+Alt+D`       | `echocode.decreaseSpeechSpeed`                               | Decreases speech rate.                                                               |
| `Ctrl+Alt+X`       | `echocode.stopSpeech`                                        | Stops current speech playback.                                                       |
| `Ctrl+Alt+Shift+Z` | `echocode.setGuidanceLevel`                                  | Opens a picker to set AI guidance verbosity (Guided, Balanced, Concise).             |
| `Ctrl+Alt+Z`       | `echocode.cycleGuidanceLevel`                                | Cycles through AI guidance verbosity levels.                                         |
| `Ctrl+Alt+O`       | `echocode.loadAssignmentFile`                                | Uploads an assignment file for task tracking.                                        |
| `Ctrl+Alt+T`       | `echocode.readNextTask`                                      | Reads the next incomplete task aloud.                                                |
| `Ctrl+Alt+/`       | `echocode.readNextSequentialTask`                            | Reads the next task aloud in its original file order.                                |
| `Ctrl+Alt+M`       | `echocode.markTaskComplete`                                  | Marks the current task as complete.                                                  |
| `Ctrl+Alt+Y`       | `echocode.rescanUserCode`                                    | Rescans the workspace to refresh which assignment tasks are complete.                |
| `Ctrl+Alt+L`       | `echocode.readCurrentLine`                                   | Tells the user what is on the line exactly.                                          |
| `Ctrl+Alt+K`       | `echocode.describeCurrentLine`                               | Generates and reads an AI description of the current line. **Dev**                   |
| `Ctrl+Alt+R`       | `echocode.toggleCharacterReadOut`                            | Toggles character-by-character read-out while typing.                                |
| `Ctrl+Alt+I`       | `echocode.copyFileNameForImport`                             | Generates an import statement for Python/C++ to connect files at the cursor. **Dev** |
| `Ctrl+Shift+I`     | `echocode.pasteImportAtCursor`                               | Pastes the generated import statement at the cursor. **Dev**                         |
| `Ctrl+Alt+;`       | `echocode.createFile`                                        | Creates a new file in the current folder.                                            |
| `Ctrl+Alt+F`       | `echocode.createFolder`                                      | Creates a new folder in the workspace.                                               |
| `Ctrl+Alt+P`       | `echocode.navigateToNextFile`                                | Moves to the next file in the current folder.                                        |
| `Ctrl+Alt+[`       | `echocode.moveToNextFolder`                                  | Navigates to the next folder in the workspace.                                       |
| `Ctrl+Alt+]`       | `echocode.moveToPreviousFolder`                              | Navigates to the previous folder in the workspace.                                   |
| `Ctrl+Alt+G`       | `echocode.compileAndParseCpp` / `echocode.checkPythonErrors` | Compiles C++ or checks Python syntax, reading errors and fixes aloud. **Dev**        |

### Command Palette Only (no default keybinding)

| Command                                                                                | Description                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EchoCode: Select AI Provider & Model` (`echocode.selectAIProvider`) 🆕                | Choose between GitHub Copilot and local Ollama, then pick a model from the live auto-detected list for that provider.                                         |
| `EchoCode: Check for AI Provider/Model Updates` (`echocode.checkAIProviderUpdates`) 🆕 | Re-detects available Copilot and Ollama models and warns if your currently configured model is no longer available. Also runs automatically on every startup. |
| `echocode.selectMicrophone`                                                            | Choose which microphone EchoCode uses for voice input, enter a device name manually, or reset to the system default.                                          |
| `echocode.switchToStudentMode` / `echocode.switchToDevMode`                            | Explicitly set the mode instead of toggling with `Ctrl+Alt+9`.                                                                                                |

---

## **Installation & Requirements**

Before using Echo Code, ensure the following are installed:

1. **[Python](https://www.python.org/downloads/)** (version 3.6 or higher)
2. **Pylint** (automatically detected; will prompt for installation if missing):
   ```bash
   pip install pylint
   ```
3. **[Python Extension for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** (auto-installed if missing)
4. **[GitHub Copilot Extension for VS Code](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)**
5. **[GitHub Copilot Chat Extension for VS Code](https://marketplace.visualstudio.com/items?itemName=github.copilot-chat)**
6. Consent for Copilot to access LLM when prompted

---

## **How to Use**

## **Development Note**

- Keep [extension.js](d:/Coding/Bender-Bot/EchoCode-Capstone-Repo/extension.js) and [src/extension.ts](d:/Coding/Bender-Bot/EchoCode-Capstone-Repo/src/extension.ts) thin. They should register commands and wire startup only.
- Put large functions and feature logic in the matching feature module under [Core](d:/Coding/Bender-Bot/EchoCode-Capstone-Repo/Core), [program_features](d:/Coding/Bender-Bot/EchoCode-Capstone-Repo/program_features), [navigation_features](d:/Coding/Bender-Bot/EchoCode-Capstone-Repo/navigation_features), or [Language](d:/Coding/Bender-Bot/EchoCode-Capstone-Repo/Language), then call those functions from the extension entrypoint.

### **Navigating Functions**

- Press **Ctrl+Alt+Down Arrow** to move to the next function in descending order.
- Press **Ctrl+Alt+Up Arrow** to move to the previous function in ascending order.

### **Summarizing Code**

- To hear a brief summary of the current Python class: Press **Ctrl+Alt+E C**.
- To hear a brief summary of the current Python function: Press **Ctrl+Alt+E F**.
- To hear a brief summary of the current Python program: Press **Ctrl+Alt+E P**.

### **Using the Chat Tutor**

- Open the chat: Press **Ctrl+Alt+C** to launch the EchoCode Tutor in the Chat view.
- Ask questions about your active file, e.g.:
  - “What does my `greet` function do?”
  - “Why is there a loop in my code?”
  - “Give me an exercise for my file.” (or use `/exercise`)
- The tutor reads your active file automatically and responds based on its content.
- Press **Ctrl+Alt+V** or click the mic icon in the chat panel to ask your question using voice input.

### **Annotating Code**

- Press **Ctrl+Alt+A** to generate annotations for your code.
- Use **Ctrl+Alt+S** to hear the next annotation or **Ctrl+Alt+Q** to hear all annotations.

---

## **Known Issues**

- Non-critical errors (e.g., missing docstrings) are logged but not read aloud.
- Currently only works on Windows machines.
- When generating code summaries, multiple TTS triggers may overlap.
- Large files might exceed the language model’s token limit in the chat tutor; responses may truncate.
- Speech to text is not functional right now

## **Release Notes**

### **2.1** (Current)

- **AI Provider Setup Wizard**: On first launch, EchoCode now shows a quick-pick menu to choose your AI provider — GitHub Copilot or a local Ollama model — with available models for each auto-detected live (Copilot models via `vscode.lm`, Ollama models via a live `/api/tags` call to your local server). Re-open the picker anytime with `EchoCode: Select AI Provider & Model`.
- **AI Provider/Model Update Checks**: Because both Copilot's model lineup and locally-installed Ollama models change over time, EchoCode now re-checks availability on every startup and warns if your configured model has disappeared. Trigger it manually with `EchoCode: Check for AI Provider/Model Updates`.
- Added optional local Ollama backend: route chat, annotations, Big O analysis, summaries, voice-command classification, and voice-to-code generation to a local Ollama model instead of GitHub Copilot (`echocode.useLocalOllama`, `echocode.ollamaBaseUrl`, `echocode.ollamaModel`).
- Added adjustable AI Guidance Level (Guided / Balanced / Concise) that controls explanation verbosity across the summarizer, Big O annotations, code annotations, and "What's This" — set it with a picker or cycle through it with a hotkey.
- Added Voice Modes: switch between Chat, Code, and Command voice modes, cycle between them, and start/stop recording with a single hotkey (or jump directly into a specific mode).
- Added a microphone selection command with manual entry and reset-to-default options.
- Added a toggleable character-by-character read-out while typing.
- Added assignment tracker sync improvements: rescan the workspace to refresh completed tasks, and read tasks back in their original sequential order.
- Various stability fixes and expanded automated test coverage across command routing, voice handling, and AI request routing.

  **New Hotkeys:**

| Shortcut           | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `Ctrl+Alt+Space`   | Starts/stops voice recording using the currently active voice mode. |
| `Ctrl+Alt+Shift+C` | Toggles voice-to-code recording directly.                           |
| `Ctrl+Alt+Shift+V` | Toggles voice-command recording directly.                           |
| `Ctrl+Alt+Shift+T` | Toggles voice-to-chat recording directly.                           |
| `Ctrl+Alt+'`       | Cycles the active voice mode between Chat, Code, and Command.       |
| `Ctrl+Alt+Shift+Z` | Opens a picker to set AI guidance verbosity.                        |
| `Ctrl+Alt+Z`       | Cycles through AI guidance verbosity levels.                        |
| `Ctrl+Alt+R`       | Toggles character-by-character read-out while typing.               |
| `Ctrl+Alt+Y`       | Rescans the workspace to refresh assignment task completion.        |
| `Ctrl+Alt+/`       | Reads the next task aloud in its original file order.               |

  **New Commands (Command Palette only):**

| Command                                         | Description                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `EchoCode: Select AI Provider & Model`          | Choose your AI provider and model from live auto-detected lists.               |
| `EchoCode: Check for AI Provider/Model Updates` | Re-detect available Copilot/Ollama models and flag a missing configured model. |
| `echocode.selectMicrophone`                     | Choose which microphone EchoCode uses for voice input.                         |

---

### **2.0**

- Added function to copy a function for importing to another file. Autogenerates the necessary imports and calls.
- Added function to paste a function for importing to another file. Autogenerates necessary imports.
- Added function to see what has been typed on the line
- Added function to generate a summary on what the line does and check if there is any error
- Added function to toggle on and off a character reader
- Added new hot keys for the above functions
- Added C++ as a supported language
- Streamlined: Speech and Copilot integration for smooth, conversational experience.
  **New Hotkeys:**

| Shortcut       | Description                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `Ctrl+Alt+I`   | Generates an import function for Python and C++ to be pasted for connecting multiple files at the cursor |
| `Ctrl+Shift+I` | Pastes the import function for Python and C++ at the cursor                                              |
| `Ctrl+Alt+;`   | Creates a new file for the user to name                                                                  |
| `Ctrl+Alt+F`   | Creates a new folder for the user to name                                                                |
| `Ctrl+Alt+P`   | Navigates to the new file                                                                                |
| `Ctrl+Alt+[`   | Moves to the next folder                                                                                 |
| `Ctrl+Alt+]`   | Moves to the previous folder                                                                             |
| `Ctrl+Alt+G`   | Compiles C++ or checks Python syntax                                                                     |

---

## **Author & License**

Developed by Group 1 - Team Edward
