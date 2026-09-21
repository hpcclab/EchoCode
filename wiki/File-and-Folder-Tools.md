# File and Folder Tools

## For users

Create files and folders without the mouse or the Explorer tree. Both work in Student mode.

| Shortcut | Does |
|---|---|
| **Ctrl+Alt+;** | Create a file |
| **Ctrl+Alt+F** | Create a folder |

### How it works

Press the shortcut, type a name, press Enter. EchoCode creates it and confirms aloud.

New items are created relative to **your current navigation folder** — the one you last moved to with **Ctrl+Alt+[** / **Ctrl+Alt+]** — not wherever the Explorer happens to be focused. That keeps keyboard navigation and creation consistent: move to a folder, create in it.

If you are unsure where you are, **Ctrl+Alt+E W** tells you. See [Code Navigation](Code-Navigation).

### If the name already exists

EchoCode tells you rather than overwriting. Nothing is destroyed silently.

### Creating a file opens it

A newly created file is opened in the editor with your cursor in it, so you can start typing immediately.

---

## For developers

### Files

| File | Provides | Command |
|---|---|---|
| `program_features/Folder_File_Creator/FileCreator.js` | `registerFileCreatorCommand` | `echocode.createFile` |
| `program_features/Folder_File_Creator/FolderCreator.js` | `registerFolderCreatorCommand` | `echocode.createFolder` |

Both under the `folderFileCreator` feature key, so they swap together via `echocode.featureImplementation.folderFileCreator`. See [Custom Feature Implementations](Custom-Feature-Implementations).

### The shape

```js
async function createFile() {
  // 1. resolve the target directory
  // 2. showInputBox for the name
  // 3. existsSync guard
  // 4. write / mkdir
  // 5. open the document (files only)
  // 6. speakMessage confirmation
}
```

`createFolder` is the same without step 5.

### Where "here" comes from

Both import the navigation cursor rather than using `workspaceFolders[0]`:

```js
const { getCurrentFolder } = require(".../folder_navigator");
```

This is the coupling worth understanding: creation follows the **navigation** cursor, not the Explorer selection or the active editor's directory. It is what makes "move to folder, create file" work as one keyboard flow, and it is why a user who has never navigated gets the initial folder.

If you add another creation command, use `getCurrentFolder()` for consistency. Using `workspaceFolders[0]` instead would create files somewhere the user did not expect.

### The existence check

```js
if (fs.existsSync(filePath)) {
  // report and bail — never overwrite
}
```

`existsSync` here is a **TOCTOU race** in principle — the path could appear between the check and the write. In practice the window is microseconds of human-driven interaction, so it is not worth hardening. Worth knowing before someone files it as a bug.

Note `existsSync` follows symlinks, so a dangling symlink reports `false` and the write then fails on a different error path.

### Speech and confirmation

Both speak a confirmation and show an information message — belt and braces, so a sighted user and a screen-reader user both get feedback. Keep both if you extend this; the visible message is what a sighted collaborator sees.

### Adding a creation command

A template file creator (new Python module with a docstring, say) fits naturally here:

1. New function following the shape above.
2. Resolve the directory with `getCurrentFolder()`.
3. `showInputBox` with `validateInput` to reject invalid names before the user commits.
4. Guard with `existsSync`.
5. Register in the existing registrar, declare in `package.json`.
6. Keep the module's exports matching the `requiredExports` the loader declares, or the whole feature silently falls back to built-in.
