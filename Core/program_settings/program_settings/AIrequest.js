const vscode = require('vscode'); // VSCode API

async function analyzeAI (code, instructionPrompt) {
    var chatRequest;
    const craftedPrompt = [
        vscode.LanguageModelChatMessage.User(
        // Default prompt
        // 'Give a brief explanation of the flow of execution of the provided python function'
            instructionPrompt
        ),
        vscode.LanguageModelChatMessage.User(code)
    ];
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot'
    });
    if(models.length === 0){
        console.log("There are no models available");
    }

    try {
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
        chatRequest = await model.sendRequest(craftedPrompt, {});
    } catch (err) {
        console.log("error with requesting from model");
        // Making the chat request might fail because
        // - model does not exist
        // - user consent not given
        // - quota limits w ere exceeded
        if (err instanceof vscode.LanguageModelError) {
        console.log(err.message, err.code, err.cause);
        if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
            stream.markdown(
            vscode.l10n.t("I'm sorry, I cannot summarize the provided code.")
            );
        }
        } else {
        // add other error handling logic
            throw err;
        }
    }

    var results = '';
    for await (const fragment of chatRequest.text) {
        results += fragment;
    }
    
    return results;
}

module.exports = { analyzeAI };