# UserImplementation for Voice

Set `echocode.featureImplementation.voice` to `user` to enable overrides.

Supported override files in this folder:

- `dependencyManager.js` exports a class (default export or `DependencyManager`)
- `whisperService.js` exports `startRecording`, `stopAndTranscribe`, `selectMicrophone`, `isRecording`
- `voiceCommandRouter.js` exports `getFriendlyLanguageName`, `tryExecuteVoiceCommand`

If a file is missing or exports are invalid, EchoCode falls back to built-in behavior.
