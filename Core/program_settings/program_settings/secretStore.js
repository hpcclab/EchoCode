/**
 * API keys must never land in settings.json — that file is plaintext, is often
 * committed, and syncs across machines. VS Code's SecretStorage keeps them in the OS
 * keychain instead. The extension hands us its context once at activation.
 */
let secrets = null;

function initSecretStorage(context) {
  secrets = context?.secrets || null;
  return Boolean(secrets);
}

function keyName(providerId) {
  return `echocode.apiKey.${providerId || "custom"}`;
}

async function getApiKey(providerId) {
  if (!secrets) return "";
  try {
    return (await secrets.get(keyName(providerId))) || "";
  } catch {
    return "";
  }
}

async function setApiKey(providerId, value) {
  if (!secrets) {
    throw new Error(
      "EchoCode cannot store the API key: VS Code secret storage is unavailable.",
    );
  }
  if (value) {
    await secrets.store(keyName(providerId), value);
  } else {
    await secrets.delete(keyName(providerId));
  }
}

async function deleteApiKey(providerId) {
  if (!secrets) return;
  try {
    await secrets.delete(keyName(providerId));
  } catch {
    // Nothing useful to do if the keychain refuses a delete.
  }
}

function isAvailable() {
  return Boolean(secrets);
}

module.exports = {
  initSecretStorage,
  getApiKey,
  setApiKey,
  deleteApiKey,
  isAvailable,
};
