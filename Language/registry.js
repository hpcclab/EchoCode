// Language/registry.js
function safeRequire(p) {
  try { return require(p); } catch { return null; }
}

// Minimal common adapter interface so callers can rely on these methods existing
const NoOpAdapter = {
  id: "noop",
  name: "No-Op Adapter",
  async init(/*context, output*/) {},
  async provideDiagnostics(/*doc*/) { return []; },
  async provideSymbols(/*doc*/) { return []; },
  async dispose() {}
};

// Map multiple VS Code languageIds to a single family key
function normalize(langId = "") {
  const id = langId.toLowerCase();
  if (id === "c++" || id === "cpp") return "cpp";
  if (id === "c") return "c";                  // optional later
  if (id === "javascript" || id === "javascriptreact") return "js";
  if (id === "typescript" || id === "typescriptreact") return "ts";
  return id; // python, java, rust, etc. pass through
}

function pickAdapter(langId) {
  const key = normalize(langId);

  // Lazy-load only when needed. If file missing, fall back to NoOpAdapter.
  switch (key) {
    case "python": {
      const mod = safeRequire("./Python");
      return (mod && mod.PythonAdapter) ? mod.PythonAdapter : NoOpAdapter;
    }
    case "cpp": {
      const mod = safeRequire("./Cpp");        // create later (optional)
      return (mod && mod.CppAdapter) ? mod.CppAdapter : NoOpAdapter;
    }
    default:
      return NoOpAdapter;
  }
}

module.exports = { pickAdapter, NoOpAdapter };
