# NVDA Controller Client

**Bundled:** the DLLs in `x64/`, `x86/` and `arm64/` come from NV Access's official
`nvda_2026.3.1_controllerClient.zip`
(https://download.nvaccess.org/releases/stable/, SHA-256 of the zip:
`aededbf58c7ebfe5acb8ce1b52b4f0cc017f5e604f52de32eef69ac8eb0310b2`), unmodified.
`LICENSE.txt` is NV Access's licence (LGPL 2.1). To update them, repeat the steps below
with a newer zip.

EchoCode speaks through NVDA when NVDA is running on Windows (see
`Core/program_settings/speech_settings/nvdaBridge.js`). To do that it needs NV Access's
**NVDA Controller Client** DLL, which is not part of NVDA's own install.

1. Download `nvda_<version>_controllerClient.zip` from the official NV Access release
   folder: https://download.nvaccess.org/releases/ (pick the folder for a recent stable
   NVDA version).
2. Copy the DLLs from the zip so you have:

   ```
   lib/nvda/x64/nvdaControllerClient.dll
   lib/nvda/x86/nvdaControllerClient.dll
   lib/nvda/arm64/nvdaControllerClient.dll
   ```

   Only the folder matching your VS Code build is used (normally `x64`). Older zips name
   the files `nvdaControllerClient64.dll` / `nvdaControllerClient32.dll`; dropping those
   straight into `lib/nvda/` also works.
3. Reload VS Code with NVDA running. EchoCode's announcements now come out of NVDA.

Alternatively set `echocode.nvdaControllerClientPath` to the DLL's full path.

Settings:

- `echocode.screenReaderOutput`: `auto` (NVDA when running) or `builtin` (always EchoCode's
  own voice).
- `echocode.nvdaWordsPerMinute`: roughly NVDA's speaking rate. With NVDA 2026.3 or newer,
  EchoCode asks NVDA when it has finished speaking (`nvdaController_isSpeaking`); this
  setting is only used to estimate that with older NVDA versions.
- `echocode.nvdaSkipNotificationDuplicates`: skip speaking text that NVDA is already
  reading from a VS Code notification.

The Controller Client is licensed LGPL 2.1 by NV Access and may be redistributed with
EchoCode.
