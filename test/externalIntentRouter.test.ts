import "./helpers/vscodeMock.js";
import { strict as assert } from "assert";
import { suite, test } from "mocha";
import * as path from "path";

const nodeRequire = require;
const fs = require("fs") as typeof import("fs");
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
  fs.watch = (() => ({ close: () => {} })) as unknown as typeof fs.watch;

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
