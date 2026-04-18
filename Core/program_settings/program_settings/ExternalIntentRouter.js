const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const commandsPath = path.join(__dirname, "external_commands.json");

let cachedCommands = null;
let watcher = null;

function getCommands() {
  if (cachedCommands) return cachedCommands;
  try {
    cachedCommands = JSON.parse(fs.readFileSync(commandsPath, "utf-8"));
    if (!watcher) {
      watcher = fs.watch(commandsPath, () => {
        cachedCommands = null;
      });
    }
  } catch {
    cachedCommands = [];
  }
  return cachedCommands;
}

/**
 * Converts a VS Code command ID into natural spoken keywords.
 * e.g. "workbench.action.toggleSidebarVisibility" -> ["toggle sidebar visibility", "toggle sidebar"]
 * @param {string} commandId
 * @returns {string[]}
 */
function generateKeywords(commandId) {
  // Strip common prefixes that mean nothing to a user
  const stripped = commandId
    .replace(/^workbench\.action\./, "")
    .replace(/^editor\.action\./, "")
    .replace(/^extension\./, "")
    .replace(/^echocode\./, "");

  // Split on dots, camelCase, and capitalize boundaries
  let words = stripped
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase -> camel Case
    .replace(/[.\-_]/g, " ") // dots/dashes/underscores -> space
    .toLowerCase()
    .trim();

  // Natural Language adjustment: Move trailing verbs to the front
  // e.g., "terminal new" -> "new terminal", "sidebar toggle" -> "toggle sidebar"
  const actionVerbs = new Set([
    "new", "add", "create", "delete", "remove",
    "toggle", "open", "close", "show", "hide",
    "focus", "clear", "start", "stop", "run"
  ]);

  let parts = words.split(" ");
  const lastWord = parts[parts.length - 1];

  if (parts.length > 1 && actionVerbs.has(lastWord)) {
    parts.pop();
    parts.unshift(lastWord);
    words = parts.join(" ");
  }

  const keywords = [words];

  // Also add shortened version (first 2 words) if long enough
  if (parts.length > 2) {
    keywords.push(parts.slice(0, 2).join(" "));
  }

  return [...new Set(keywords)]; // deduplicate
}

/**
 * Called once on activation. Pulls all VS Code commands, generates keywords,
 * and writes them to external_commands.json. Skips echocode internal commands.
 */
async function buildExternalCommandRegistry() {
  const allCommandIds = await vscode.commands.getCommands(true);

  const commands = allCommandIds
    .filter((id) => !id.startsWith("echocode.") && !id.startsWith("_")) // skip internal
    .map((id) => ({
      id,
      title: id,
      keywords: generateKeywords(id),
    }));

  await fs.promises.writeFile(commandsPath, JSON.stringify(commands, null, 2));
  cachedCommands = null; // force reload on next match
}

/**
 * Returns matched external command object or null.
 * @param {string} transcript - Lowercased, trimmed transcript
 */
function matchExternalCommand(transcript) {
  for (const cmd of getCommands()) {
    if (
      cmd.keywords &&
      cmd.keywords.some((k) => transcript.includes(k.toLowerCase()))
    ) {
      return cmd;
    }
  }
  return null;
}


module.exports = { matchExternalCommand, buildExternalCommandRegistry };
