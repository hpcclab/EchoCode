const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function getImplementationMode(featureKey) {
  const config = vscode.workspace.getConfiguration("echocode");
  return config.get(`featureImplementation.${featureKey}`, "builtin");
}

function hasRequiredExports(moduleExports, requiredExports = []) {
  return requiredExports.every(
    (name) => typeof moduleExports?.[name] !== "undefined",
  );
}

function safeLog(outputChannel, message) {
  if (outputChannel && typeof outputChannel.appendLine === "function") {
    outputChannel.appendLine(message);
  }
}

function loadProgramFeatureModule({
  featureKey,
  featureFolder,
  moduleFile,
  requiredExports = [],
  outputChannel,
}) {
  const defaultModulePath = path.join(__dirname, featureFolder, moduleFile);
  const userModulePath = path.join(
    __dirname,
    featureFolder,
    "UserImplementation",
    moduleFile,
  );

  const mode = getImplementationMode(featureKey);

  // Built-in is always available as the fallback implementation.
  const defaultModule = require(defaultModulePath);

  if (mode !== "user") {
    return defaultModule;
  }

  if (!fs.existsSync(userModulePath)) {
    safeLog(
      outputChannel,
      `[Feature Loader] User implementation not found for ${featureKey}: ${userModulePath}. Using built-in module.`,
    );
    return defaultModule;
  }

  try {
    const userModule = require(userModulePath);

    if (!hasRequiredExports(userModule, requiredExports)) {
      const missing = requiredExports.filter(
        (name) => typeof userModule?.[name] === "undefined",
      );

      safeLog(
        outputChannel,
        `[Feature Loader] User implementation for ${featureKey}/${moduleFile} is missing exports: ${missing.join(", ")}. Using built-in module.`,
      );
      return defaultModule;
    }

    safeLog(
      outputChannel,
      `[Feature Loader] Loaded user implementation for ${featureKey}/${moduleFile}`,
    );
    return userModule;
  } catch (error) {
    safeLog(
      outputChannel,
      `[Feature Loader] Failed to load user implementation for ${featureKey}/${moduleFile}: ${error.message}. Using built-in module.`,
    );
    return defaultModule;
  }
}

function resolveClassExport(moduleExports, exportName) {
  if (typeof moduleExports === "function") {
    return moduleExports;
  }

  if (exportName && typeof moduleExports?.[exportName] === "function") {
    return moduleExports[exportName];
  }

  return null;
}

function clearRequireCacheByPrefix(prefixPath) {
  const normalizedPrefix = path.resolve(prefixPath);

  Object.keys(require.cache).forEach((cacheKey) => {
    const normalizedCacheKey = path.resolve(cacheKey);
    if (normalizedCacheKey.startsWith(normalizedPrefix)) {
      delete require.cache[cacheKey];
    }
  });
}

function clearFeatureRequireCache(featureFolder) {
  clearRequireCacheByPrefix(path.join(__dirname, featureFolder));
}

module.exports = {
  loadProgramFeatureModule,
  resolveClassExport,
  clearFeatureRequireCache,
};
