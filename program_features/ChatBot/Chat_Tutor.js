// program_features/ChatBot/chat_tutor.js
const vscode = require("vscode");
const { speakMessage } = require("../../Core/program_settings/speech_settings/speechHandler");

// --- Simple mock voice input (kept for dev/demo) ---
function performVoiceRecognition() {
  return new Promise((resolve) => {
    setTimeout(() => resolve("Can you explain this code?"), 1500);
  });
}

// --- Prompt tuned for language-agnostic tutoring ---
const BASE_PROMPT =
  "You are a friendly, helpful coding tutor named EchoCode. " +
  "Keep responses under 4 sentences, plain text only (no markdown). " +
  "Use a warm tone, explain simply, give tiny examples, and a quick follow-up tip when helpful. " +
  "If code is provided, focus on it; otherwise answer generally.";

// --- Webview provider for the EchoCode chat panel ---
class EchoCodeChatViewProvider {
  constructor(context, outputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this._view = null;
    this._isListening = false;
    this.conversationHistory = []; // [{ user, response }]
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        try {
          switch (message.type) {
            case "userInput":
              await this.handleUserMessage(message.text || "");
              break;
            case "startVoiceRecognition":
              await this.startVoiceRecognition();
              break;
          }
        } catch (err) {
          this.outputChannel.appendLine(`Chat message error: ${err?.message || err}`);
          this._safePost({ type: "responseError", error: String(err?.message || err) });
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  // Gracefully post to webview if available
  _safePost(payload) {
    if (this._view?.webview) {
      this._view.webview.postMessage(payload);
    }
  }

  // --- Voice Input (mocked) ---
  async startVoiceRecognition() {
    if (this._isListening || !this._view) return;
    this._isListening = true;
    this._safePost({ type: "voiceListeningStarted" });
    try {
      const text = await performVoiceRecognition();
      this._safePost({ type: "voiceRecognitionResult", text });
    } catch (error) {
      this._safePost({ type: "voiceRecognitionError", error: String(error?.message || error) });
    } finally {
      this._isListening = false;
      this._safePost({ type: "voiceListeningStopped" });
    }
  }

  // --- Core chat handler (language-agnostic) ---
  async handleUserMessage(userInput) {
    if (!this._view) return;

    // Prefer active editor; fall back to any visible editor
    const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors?.[0] || null;
    const lang = editor?.document?.languageId || "unknown";
    let fileContent = "";

    if (editor?.document) {
      fileContent = editor.document.getText() || "";
      const MAX = 60000; // prevent overly large context
      if (fileContent.length > MAX) fileContent = fileContent.slice(0, MAX);
      this.outputChannel.appendLine(`Chat context captured for ${lang} (${fileContent.length} chars).`);
    } else {
      this.outputChannel.appendLine("No editor open; answering without file context.");
    }

    // Build system/context prompt
    let prompt = `${BASE_PROMPT}\nLanguage: ${lang}.\n`;
    if (fileContent) {
      prompt += `Here is the current file content:\n\n${fileContent}\n\nPlease answer the user's message next.`;
    } else {
      prompt += "No file is open. Please answer the user's message next.";
    }

    // Assemble messages with small running history
    const messages = [];
    messages.push(vscode.LanguageModelChatMessage.User(prompt));
    for (const turn of this.conversationHistory.slice(-6)) {
      messages.push(vscode.LanguageModelChatMessage.User(turn.user));
      messages.push(vscode.LanguageModelChatMessage.Assistant(turn.response));
    }
    messages.push(vscode.LanguageModelChatMessage.User(userInput));

    // Select Copilot chat model
    const [model] = await vscode.lm.selectChatModels({ vendor: "copilot", family: "gpt-4o" });
    if (!model) {
      this._safePost({ type: "response", text: "No language model available. Please enable GitHub Copilot." });
      this.outputChannel.appendLine("No chat model available.");
      return;
    }

    // UI: loading
    this._safePost({ type: "responseLoading", started: true });

    try {
      const cts = new vscode.CancellationTokenSource();
      const chatResponse = await model.sendRequest(messages, {}, cts.token);

      let responseText = "";
      for await (const fragment of chatResponse.text) {
        responseText += fragment;
        this._safePost({ type: "responseFragment", text: fragment });
      }

      this.conversationHistory.push({ user: userInput, response: responseText });
      this._safePost({ type: "responseComplete", text: responseText });
      this.outputChannel.appendLine("Chat response: " + responseText);

      await speakMessage(responseText);
    } catch (error) {
      const msg = `Error getting response: ${error?.message || error}`;
      this.outputChannel.appendLine(msg);
      this._safePost({ type: "responseError", error: msg });
    } finally {
      this._safePost({ type: "responseLoading", started: false });
    }
  }

  startVoiceInput() {
    if (!this._view) {
      vscode.window.showInformationMessage("Open the EchoCode Tutor view to use voice input.");
      this.outputChannel.appendLine("Voice input invoked without active view.");
      return;
    }
    this.startVoiceRecognition();
  }

  // --- Webview HTML/JS/CSS skeleton ---
  _getHtmlForWebview(webview) {
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.js")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;">
<link href="${styleMainUri}" rel="stylesheet">
<title>EchoCode Tutor</title>
</head>
<body>
  <div id="chat-container">
    <div id="messages-container"></div>
    <div id="input-container">
      <textarea id="user-input" placeholder="Ask a question about your code..."></textarea>
      <div id="button-container">
        <button id="send-button" title="Send message" class="icon-button">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.08073 5.36896L11.8807 4.06896L10.5807 7.86896L8.08073 5.36896ZM13.1399 2.81L3.1399 7.81C2.9899 7.88 2.9099 8.05 2.9399 8.21C2.9699 8.38 3.0999 8.5 3.2699 8.5H7.9999V13.24C7.9999 13.4 8.1299 13.54 8.2999 13.56C8.3099 13.56 8.3199 13.56 8.3299 13.56C8.4799 13.56 8.6199 13.48 8.6899 13.35L13.6899 3.35C13.7599 3.19 13.7399 3 13.6399 2.87C13.5399 2.74 13.3499 2.69 13.1799 2.76L13.1399 2.81Z"/>
          </svg>
        </button>
        <button id="voice-button" title="Start voice input" class="icon-button">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 10.9844C9.46875 10.9844 10.4844 9.95312 10.4844 8V3C10.4844 1.04688 9.45312 0 8 0C6.53125 0 5.51562 1.04688 5.51562 3V8C5.51562 9.95312 6.53125 10.9844 8 10.9844ZM4 5.51562V8C4 10.7344 5.71875 12.4844 8.25 12.4844C10.7812 12.4844 12.5 10.7344 12.5 8V5.51562H14V8C14 11.4062 11.7812 13.5156 9 13.9375V16H7V13.9375C4.21875 13.5156 2 11.4062 2 8V5.51562H4Z"/>
          </svg>
        </button>
      </div>
    </div>
    <div id="status-container">
      <div id="listening-indicator" class="status-indicator hidden">Listening...</div>
      <div id="loading-indicator" class="status-indicator hidden">Thinking...</div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// --- Utils ---
function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

// --- Registration helper for extension.js ---
function registerChatCommands(context, outputChannel) {
  const provider = new EchoCodeChatViewProvider(context, outputChannel);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("echocode.chatView", provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.openChat", async () => {
      outputChannel.appendLine("echocode.openChat command triggered");
      await vscode.commands.executeCommand("echocode.chatView.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.startVoiceInput", () => {
      if (provider) provider.startVoiceInput();
    })
  );

  return provider;
}

module.exports = {
  registerChatCommands,
  EchoCodeChatViewProvider,
};
