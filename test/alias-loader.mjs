// Map `import "vscode"` to our mock file (must be JS so Node can load it without ts-node)
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";

// Resolve path relative to this loader file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockVscodeUrl = pathToFileURL(
  path.resolve(__dirname, "./helpers/vscodeMock.js")
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "vscode") {
    console.log(`[alias-loader] Redirecting import "vscode" → ${mockVscodeUrl}`);
    return {
      url: mockVscodeUrl,
      format: "module",
      shortCircuit: true,   // <-- tell Node we're done
    };
  }

  // Fall through to the rest of the chain
  return nextResolve(specifier, context);
}
