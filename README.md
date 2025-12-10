# Echo Code — AI-Assisted Python Debugging for Visually Impaired Programmers

**Echo Code** is a Visual Studio Code extension that brings **AI-powered tutoring, speech feedback, and accessible code navigation** to all developers — especially **visually impaired programmers**.  
Originally built for Python debugging, Echo Code has evolved into a **language-agnostic assistant** that now supports **Python**, **C++**, and general programming files across most languages.

---

## **Features**

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

- **Line Reader**
  Allows the user to see what is put on the line exactly and generate a brief summary that also checks for issues

- **Character Reader**
  Alerts the user to what key is being pressed while typing and alerts to where their cursor is.

---

## **Keyboard Shortcuts**

| Shortcut         | Command                                                                        | Description                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `Ctrl+Alt+A`     | `code-tutor.Annotate`                                                          | Generates the annotations.                                                                                  |
| `Ctrl+Alt+S`     | `code-tutor.speakNextAnnotation`                                               | Reads the next annotation, including line number and suggestion.                                            |
| `Ctrl+Alt+Q`     | `code-tutor.readAllAnnotation`                                                 | Reads all the annotations in the queue.                                                                     |
| `Ctrl+Alt+Down`  | `echocode.jumpToNextFunction`                                                  | Jumps to the next function in the file.                                                                     |
| `Ctrl+Alt+Up`    | `echocode.jumpToPreviousFunction`                                              | Jumps to the previous function.                                                                             |
| `Ctrl+Alt+E C`   | `echocode.summarizeClass`                                                      | Summarizes the current class.                                                                               |
| `Ctrl+Alt+E F`   | `echocode.summarizeFunction`                                                   | Summarizes the current function.                                                                            |
| `Ctrl+Alt+E P`   | `echocode.summarizeProgram`                                                    | Summarize full program.                                                                                     |
| `Ctrl+Alt+E W`   | `echocode.whereAmI`                                                            | Describes the scope the user is in.                                                                         |
| `Ctrl+Alt+U`     | `echocode.increaseSpeechSpeed`                                                 | Increases speech rate.                                                                                      |
| `Ctrl+Alt+D`     | `echocode.decreaseSpeechSpeed`                                                 | Decreases speech rate.                                                                                      |
| `Ctrl+Alt+X`     | `echocode.stopSpeech`                                                          | Stops current speech playback.                                                                              |
| `Ctrl+Alt+O`     | `echocode.loadAssignmentFile`                                                  | Uploads an assignment file for task tracking.                                                               |
| `Ctrl+Alt+T`     | `echocode.readNextTask`                                                        | Reads the next task aloud.                                                                                  |
| `Ctrl+Alt+M`     | `echocode.markTaskComplete`                                                    | Marks the current task as complete.                                                                         |
| `Ctrl + Alt + N` | `code-tutor.analyzeBigO`                                                       | Queue up the big O annotations                                                                              |
| `Ctrl + Alt + B` | `code-tutor.iterateBigOQueue`                                                  | Read next big O recommendation outloud                                                                      |
| `Ctrl + Alt + H` | `code-tutor.readEntireBigOQueue`                                               | Read all big O recommendations one at a time                                                                |
| `Ctrl+Alt+C`     | `echocode.openChat`                                                            | Opens the EchoCode Tutor chat interface.                                                                    |
| `Ctrl+Alt+V`     | `echocode.voiceInput`                                                          | Starts voice input to ask the chat a question. Future feature                                               |
| `f1`             | Reads out the hotkey options by letting you choose 1-7 depending on the option |
| `Ctrl+Alt+L`     | `echocode.readCurrentLine`                                                     | Tells the user what is on the line exactly                                                                  |
| `Ctrl+Alt+K`     | `echocode.describeCurrentLine`                                                 | Generates and tells a user what is on the line                                                              |
| `Ctrl+Alt+I`     | `echocode.copyFileNameForImport`                                               | Generates an import function for Python and C++ to be pasted for connecting multiple files at the cursor 🆕 |
| `Ctrl+Shift+I`   | `echocode.pasteImportAtCursor`                                                 | Pastes the import function for Python and C++ at the cursor 🆕                                              |
| `Ctrl+Alt+;`     | `echocode.createFile`                                                          | Creates a new file in the current folder 🆕                                                                 |
| `Ctrl+Alt+F`     | `echocode.createFolder`                                                        | Creates a new folder in the workspace 🆕                                                                    |
| `Ctrl+Alt+P`     | `echocode.navigateToNextFile`                                                  | Moves to the next file in the current folder 🆕                                                             |
| `Ctrl+Alt+[`     | `echocode.moveToNextFolder`                                                    | Navigates to the next folder in the workspace 🆕                                                            |
| `Ctrl+Alt+]`     | `echocode.moveToPreviousFolder`                                                | Navigates to the previous folder in the workspace 🆕                                                        |
| `Ctrl+Alt+G`     | `echocode.compileAndParseCpp` / `echocode checkPythonErrors`                   | Compiles C++ or checks Python syntax, reading errors and fixes aloud 🆕                                     |

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
