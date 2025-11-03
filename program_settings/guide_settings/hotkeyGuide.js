const vscode = require("vscode");
const { speakMessage } = require("../speech_settings/speechHandler");

async function showHotkeyGuide() {
  const guideMenu = `
        EchoCode Hotkey Menu:
        Press 1 to hear customization hotkeys.
        Press 2 to hear annotation hotkeys.
        Press 3 to hear summarization hotkeys.
        Press 4 to hear assignment checklist hotkeys.
        Press 5 to hear navigation hotkeys.
        Press 6 to hear time complexity hotkeys.
        Press 7 to hear scope detection hotkeys.
        Press F1 to repeat this guide.
    `;

  await speakMessage(guideMenu);

  const input = await vscode.window.showInputBox({
    prompt: "Press a number (1–7) or F1 to repeat the guide.",
  });

  if (!input) return;

  switch (input.trim()) {
    case "1":
      await speakMessage(`
                Customization Hotkeys:
                Ctrl + Alt + U: Increase speech speed.
                Ctrl + Alt + D: Decrease speech speed.
                Ctrl + Alt + X: Stop speech playback.
            `);
      break;
    case "2":
      await speakMessage(`
                Annotation Hotkeys:
                Ctrl + Alt + A: Generate annotations.
                Ctrl + Alt + S: Read next annotation.
                Ctrl + Alt + Q: Read all annotations in queue.
                Ctrl + Alt + R: Toggle character read-out.
                Ctrl + Alt + L: Read current line.
                Ctrl + Alt + K: Describe current line.
            `);
      break;
    case "3":
      await speakMessage(`
                Summarization Hotkeys:
                Ctrl + Alt + Space C: Summarize current class.
                Ctrl + Alt + Space F: Summarize current function.
                Ctrl + Alt + Space P: Summarize full program.
            `);
      break;
    case "4":
      await speakMessage(`
                Assignment Checklist Hotkeys:
                Ctrl + Alt + O: Upload assignment file.
                Ctrl + Alt + T: Read next task.
                Ctrl + Alt + M: Mark task complete.
            `);
      break;
    case "5":
      await speakMessage(`
                Navigation Hotkeys:
                Ctrl + Alt + Down: Jump to next function.
                Ctrl + Alt + Up: Jump to previous function.
            `);
      break;
    case "6":
      await speakMessage(`
                Time Complexity Hotkeys:
                Ctrl + Alt + N: Generate Big O annotations.
                Ctrl + Alt + B: Read the first annotations in the queue.
                Ctrl + Alt + H: Read the entire queue of Big O annotations.
            `);
      break;
    case "7":
      await speakMessage(`
                Scope Detection Hotkeys:
                Ctrl + Alt + Space W: Detect the scope that the cursor is in and read it. 
            `);
      break;
    case "f1":
    case "F1":
      vscode.commands.executeCommand("echocode.readHotkeyGuide");
      break;
    default:
      await speakMessage("Invalid option.");
      break;
  }
}

function registerHotkeyGuideCommand(context) {
  const hotkeyMenuCommand = vscode.commands.registerCommand(
    "echocode.readHotkeyGuide",
    showHotkeyGuide
  );

  context.subscriptions.push(hotkeyMenuCommand);
}

module.exports = {
  showHotkeyGuide,
  registerHotkeyGuideCommand,
};
