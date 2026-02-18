// Script for the chat view
(function () {
    let isRecording = false;            // For STT UI state

    // Get VS Code API
    const vscode = acquireVsCodeApi();

    // Elements
    const messagesContainer = document.getElementById('messages-container');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const voiceButton = document.getElementById('voice-button');
    const listeningIndicator = document.getElementById('listening-indicator');
    const loadingIndicator = document.getElementById('loading-indicator');

    let currentAssistantMessage = null;

    // Send a message
    function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        // Add user message to UI
        addMessageToUI('user', text);

        // Clear input
        userInput.value = '';

        // Send to extension
        vscode.postMessage({
            type: 'userInput',
            text: text
        });

        // Create placeholder for assistant response
        currentAssistantMessage = addMessageToUI('assistant', '');
    }

    function setListeningUi() {
        isRecording = true;
        voiceButton.classList.add('active');                 // red/on
        listeningIndicator.classList.remove('hidden');
        listeningIndicator.classList.add('visible');
        userInput.placeholder = 'Listening...';
    }

    function setProcessingUi() {
        loadingIndicator.classList.remove('hidden');         // show "Thinking..."
        loadingIndicator.classList.add('visible');
    }

    function resetMicUi() {
        isRecording = false;
        voiceButton.classList.remove('active');              // blue/off
        listeningIndicator.classList.add('hidden');
        listeningIndicator.classList.remove('visible');
        loadingIndicator.classList.add('hidden');
        loadingIndicator.classList.remove('visible');
        userInput.placeholder = 'Ask a question about your code...';
    }

    // Add message to UI
    function addMessageToUI(role, text) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;

        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.textContent = text;

        messageElement.appendChild(contentElement);
        messagesContainer.appendChild(messageElement);

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return contentElement;
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    voiceButton.addEventListener('click', () => {
        if (!isRecording) {
            // Flip UI immediately
            setListeningUi();
            vscode.postMessage({ type: "startVoiceInput" });
        } else {
            // Flip UI immediately (optimistic), show processing spinner
            resetMicUi();
            setProcessingUi();
            vscode.postMessage({ type: "stopVoiceInput" });
        }
    });

    // Handle messages from the extension
    window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
            case 'response':
                if (currentAssistantMessage) {
                    currentAssistantMessage.textContent = message.text;
                    currentAssistantMessage = null;
                } else {
                    addMessageToUI('assistant', message.text);
                }
                break;

            case 'responseFragment':
                if (currentAssistantMessage) {
                    currentAssistantMessage.textContent += message.text;
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
                break;

            case 'responseComplete':
                currentAssistantMessage = null;
                break;

            case 'responseLoading':
                if (message.started) {
                    loadingIndicator.classList.remove('hidden');
                    loadingIndicator.classList.add('visible');
                } else {
                    loadingIndicator.classList.add('hidden');
                    loadingIndicator.classList.remove('visible');
                }
                break;

            case 'responseError':
                if (currentAssistantMessage) {
                    currentAssistantMessage.textContent = message.error || 'Error getting response';
                    currentAssistantMessage.parentElement.classList.add('error');
                    currentAssistantMessage = null;
                }
                break;

            case 'voiceStopping':
                loadingIndicator.classList.remove('hidden');
                loadingIndicator.classList.add('visible');
                break;

            case 'voiceRecognitionResult':
                const transcript = message.text?.trim() || "";

                // Put the transcript in the box for visibility
                userInput.value = transcript;
                userInput.focus();

                // Immediately send it for execution
                vscode.postMessage({ type: "executeVoiceCommand", text: transcript });

                // Reset UI state
                voiceButton.classList.remove('active');
                listeningIndicator.classList.add('hidden');
                listeningIndicator.classList.remove('visible');
                userInput.placeholder = 'Ask a question about your code...';
                break;


            case 'voiceRecognitionError':
                addMessageToUI('system', `Voice recognition error: ${message.error || 'Unknown error'}`);
                loadingIndicator.classList.add('hidden');
                loadingIndicator.classList.remove('visible');
                voiceButton.classList.remove('active');
                listeningIndicator.classList.add('hidden');
                listeningIndicator.classList.remove('visible');
                isRecording = false;
                break;

            case 'updateRecordingState':
                if (message.recording) {
                    setListeningUi();
                } else {
                    // if stopping, show processing
                    resetMicUi();
                    setProcessingUi();
                }
                break;
        }

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
})();