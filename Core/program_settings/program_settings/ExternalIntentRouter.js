const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const REGISTRY_FILENAME = "external_commands.json";

// Absolute path to the generated registry, set by initExternalCommandRegistry.
//
// This used to live next to this file, inside the extension's install directory. That
// is the wrong home for generated per-user data: VS Code replaces the install directory
// wholesale on every extension update (so the file was silently discarded), and the
// directory is not guaranteed writable on managed installs. globalStorageUri is the
// location VS Code sets aside for exactly this — per-user, persistent across updates,
// and cleaned up if the extension is uninstalled.
let commandsPath = null;

let cachedCommands = null;
let watcher = null;

function disposeWatcher() {
  if (!watcher) return;
  try {
    watcher.close();
  } catch {
    // A watcher that is already gone is not worth reporting.
  }
  watcher = null;
}

/**
 * Points the registry at this extension's global storage and ties the file watcher's
 * lifetime to the extension's. Call once, from activate(), before building the registry.
 *
 * The watcher was previously never closed, so every extension reload leaked an OS file
 * handle for the lifetime of the window.
 */
function initExternalCommandRegistry(context) {
  commandsPath = path.join(context.globalStorageUri.fsPath, REGISTRY_FILENAME);
  cachedCommands = null;
  disposeWatcher();

  context.subscriptions.push(new vscode.Disposable(disposeWatcher));

  return commandsPath;
}

function normalizeForMatching(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function normalizedEditSimilarity(a, b) {
  const x = normalizeForMatching(a);
  const y = normalizeForMatching(b);
  if (!x || !y) return 0;

  const maxLen = Math.max(x.length, y.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(x, y) / maxLen;
}

function tokenList(text) {
  const normalized = normalizeForMatching(text);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function tokenSet(text) {
  return new Set(tokenList(text));
}

function jaccardSimilarity(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function tokenAlignmentSimilarity(a, b) {
  const left = tokenList(a);
  const right = tokenList(b);
  if (left.length === 0 || right.length === 0) return 0;

  let total = 0;
  for (const target of right) {
    let best = 0;
    for (const observed of left) {
      const sim = normalizedEditSimilarity(observed, target);
      if (sim > best) best = sim;
    }
    total += best;
  }

  return total / right.length;
}

function scoreTranscriptToPhrase(transcript, phrase) {
  const normalizedTranscript = normalizeForMatching(transcript);
  const normalizedPhrase = normalizeForMatching(phrase);
  if (!normalizedTranscript || !normalizedPhrase) return 0;

  if (
    normalizedTranscript.includes(normalizedPhrase) ||
    normalizedPhrase.includes(normalizedTranscript)
  ) {
    return 1;
  }

  const tokenOrderAgnosticEdit = normalizedEditSimilarity(
    tokenList(normalizedTranscript).sort().join(" "),
    tokenList(normalizedPhrase).sort().join(" "),
  );
  const tokenOverlap = jaccardSimilarity(
    normalizedTranscript,
    normalizedPhrase,
  );
  const tokenEdit = tokenAlignmentSimilarity(
    normalizedTranscript,
    normalizedPhrase,
  );

  return Math.max(
    tokenOverlap,
    tokenOrderAgnosticEdit * 0.65 + tokenEdit * 0.35,
  );
}

function getMinimumExternalScore(phrase) {
  const tokenCount = tokenList(phrase).length;
  if (tokenCount <= 1) return 0.85;
  return 0.62;
}

function getCommands() {
  if (cachedCommands) return cachedCommands;

  // Before init, or before the first build has written the file: no external commands
  // yet. Matching simply finds nothing, which is the correct answer, not an error.
  if (!commandsPath) return [];

  try {
    cachedCommands = JSON.parse(fs.readFileSync(commandsPath, "utf-8"));

    if (!watcher) {
      watcher = fs.watch(commandsPath, (eventType) => {
        cachedCommands = null;
        // A rename (which is how the file is replaced on rebuild) leaves the watch
        // pointing at an inode that no longer backs the path. Drop it so the next read
        // re-establishes a watch on the new file.
        if (eventType === "rename") disposeWatcher();
      });
      // Watch failures — descriptor limits, the file disappearing — must never take
      // down the extension host. Losing the watch only costs a stale cache.
      watcher.on("error", disposeWatcher);
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
  const words = stripped
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase -> camel Case
    .replace(/[.\-_]/g, " ") // dots/dashes/underscores -> space
    .toLowerCase()
    .trim();

  const keywords = [words];

  // Also add shortened version (first 2 words) if long enough
  const parts = words.split(" ");
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
  if (!commandsPath) {
    throw new Error(
      "External command registry used before initExternalCommandRegistry(context).",
    );
  }

  const allCommandIds = await vscode.commands.getCommands(true);

  const commands = allCommandIds
    .filter((id) => !id.startsWith("echocode.") && !id.startsWith("_")) // skip internal
    .map((id) => ({
      id,
      title: id,
      keywords: generateKeywords(id),
    }));

  // VS Code does not create globalStorageUri for us; the first write has to.
  await fs.promises.mkdir(path.dirname(commandsPath), { recursive: true });

  // Written to a sibling temp file and renamed into place. rename is atomic within a
  // filesystem, so a crash or a reload mid-write can never leave a half-flushed 600KB
  // file that fails to parse on next activation — readers see either the old registry
  // or the complete new one.
  const tempPath = `${commandsPath}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(tempPath, JSON.stringify(commands, null, 2));
    await fs.promises.rename(tempPath, commandsPath);
  } catch (err) {
    await fs.promises.rm(tempPath, { force: true });
    throw err;
  }

  // The rename swapped the file out from under any existing watch.
  disposeWatcher();
  cachedCommands = null; // force reload on next match
}

/**
 * Returns matched external command object or null.
 * @param {string} transcript - Lowercased, trimmed transcript
 */
function matchExternalCommand(transcript) {
  const normalizedTranscript = normalizeForMatching(transcript);
  if (!normalizedTranscript) return null;

  let best = null;

  for (const cmd of getCommands()) {
    const phrases = Array.isArray(cmd.keywords) ? cmd.keywords : [];
    for (const phrase of phrases) {
      const score = scoreTranscriptToPhrase(normalizedTranscript, phrase);
      if (score < getMinimumExternalScore(phrase)) {
        continue;
      }

      if (!best || score > best.score) {
        best = { cmd, score };
      }
    }
  }

  return best ? best.cmd : null;
}

module.exports = {
  matchExternalCommand,
  buildExternalCommandRegistry,
  initExternalCommandRegistry,
};
