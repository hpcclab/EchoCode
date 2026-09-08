import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";

import { createRequire } from "module";

// Seeded from an explicit path rather than `import.meta.url`, because these files must
// load under two different runtimes:
//   - Node 20/22 (CI): ts-node compiles them to CommonJS, where `import.meta` is a hard
//     compile error (TS1470) but a bare `require` exists.
//   - Node 24 (local): Node strips types natively and detects ESM from the `import`
//     syntax, where `import.meta` is fine but `require` is not defined.
// createRequire with a plain path uses no meta-property, so it compiles and runs on
// both, and still yields the real CJS require the suite needs for require.cache mocking.
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const fs = nodeRequire("fs") as typeof import("fs");
const repoRoot = process.cwd();
const modulePath = nodeRequire.resolve(
  path.join(
    repoRoot,
    "Core/program_settings/program_settings/ExternalIntentRouter.js",
  ),
);

function loadRouterWithCommands(commands: any[]) {
  delete nodeRequire.cache[modulePath];
  const rawRouter = nodeRequire(modulePath);
  const router = rawRouter?.default || rawRouter;

  const originalReadFileSync = fs.readFileSync;
  const originalWatch = fs.watch;

  fs.readFileSync = (() =>
    JSON.stringify(commands)) as unknown as typeof fs.readFileSync;
  // `on` is part of the FSWatcher surface the router uses to drop a broken watch.
  fs.watch = (() => ({
    close: () => {},
    on: () => {},
  })) as unknown as typeof fs.watch;

  // The registry resolves its path from the extension context, so the router reports no
  // commands until it is initialised. readFileSync is stubbed above, so the directory
  // never has to exist.
  router.initExternalCommandRegistry({
    globalStorageUri: { fsPath: path.join(repoRoot, ".test-global-storage") },
    subscriptions: [],
  });

  return {
    router,
    restore: () => {
      fs.readFileSync = originalReadFileSync;
      fs.watch = originalWatch;
      delete nodeRequire.cache[modulePath];
    },
  };
}

suite("ExternalIntentRouter fuzzy matching", () => {
  test("matches reversed phrase order like 'new terminal'", () => {
    const { router, restore } = loadRouterWithCommands([
      {
        id: "workbench.action.terminal.new",
        title: "New Terminal",
        keywords: ["terminal new", "terminal"],
      },
    ]);

    try {
      const result = router.matchExternalCommand("new terminal");
      assert.ok(result);
      assert.equal(result.id, "workbench.action.terminal.new");
    } finally {
      restore();
    }
  });

  test("matches minor STT typo for terminal command", () => {
    const { router, restore } = loadRouterWithCommands([
      {
        id: "workbench.action.terminal.new",
        title: "New Terminal",
        keywords: ["new terminal"],
      },
    ]);

    try {
      const result = router.matchExternalCommand("new termnal");
      assert.ok(result);
      assert.equal(result.id, "workbench.action.terminal.new");
    } finally {
      restore();
    }
  });

  test("returns null for unrelated transcript", () => {
    const { router, restore } = loadRouterWithCommands([
      {
        id: "workbench.action.terminal.new",
        title: "New Terminal",
        keywords: ["new terminal"],
      },
    ]);

    try {
      const result = router.matchExternalCommand("open markdown preview");
      assert.equal(result, null);
    } finally {
      restore();
    }
  });
});
