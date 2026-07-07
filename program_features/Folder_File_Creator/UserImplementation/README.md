# UserImplementation for Folder_File_Creator

Set `echocode.featureImplementation.folderFileCreator` to `user` to enable overrides.

Supported override files in this folder:

- `FileCreator.js` exports `registerFileCreatorCommand`
- `FolderCreator.js` exports `registerFolderCreatorCommand`

If a file is missing or exports are invalid, EchoCode falls back to built-in behavior.
