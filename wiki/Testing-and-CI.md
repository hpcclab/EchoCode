# Testing and CI

> **Developer page.**

## Running the tests

```bash
npm test
```

51 tests, ~60ms. `pretest` runs `npm run compile` (`tsc -p ./`) first.

```bash
npm run compile      # tsc -p ./  — the TS scaffold, not the extension
npm run lint         # BROKEN — see below
```

## What is covered

| Suite | Covers |
|---|---|
| `aiProviderSetup.test.ts` | The provider wizard end to end — Copilot, Ollama, hosted API, failure paths |
| `aiRequestRouting.test.ts` | Backend selection in `AIrequest.js` |
| `voiceCommandRouter.test.ts` | Fuzzy matching, student-mode locking, routing decisions |
| `externalIntentRouter.test.ts` | External command matching |
| `rootExtension.integration.test.ts` | `activate()` with every dependency stubbed |
| `annotationsCommands.test.ts`, `extension.test.ts` | Command registration |

Not covered: speech internals, the venv bootstrap, the C++ parser, the File Connector, anything needing a real editor.

## The harness

```
node --loader ./test/alias-loader.mjs mocha
  --require ts-node/register
  --require test/setup.mjs
  --recursive test/**/*.test.ts
```

Three pieces:

**`test/helpers/vscodeMock.js`** — a hand-written `vscode` API mock. Exports ESM-shaped members *and* attaches `globalThis.vscode`, because some code paths take each route. Provides `commands`, `window`, `workspace`, `env`, `Disposable`, `Position`/`Range`/`Selection`, and `__createMockContext()`.

**`test/alias-loader.mjs`** — an ESM resolve hook mapping `import "vscode"` to the mock.

**`test/setup.mjs`** — patches `Module.prototype.require` so `require("vscode")` also resolves to the mock.

Both interception routes are needed: the mock must be reachable whether a module is loaded as ESM or CommonJS.

### Mocking pattern

Tests inject dependencies by writing into `require.cache` before loading the module under test:

```js
nodeRequire.cache[modulePath] = {
  id: modulePath, filename: modulePath, loaded: true,
  exports: { speakMessage: async () => {} },
};
delete nodeRequire.cache[targetModulePath];
const target = nodeRequire(targetModulePath);
```

That requires a **real CommonJS `require`**, because only the CJS loader consults `require.cache`. Which leads to the harness's one genuinely tricky constraint.

## The dual-runtime constraint

Read this before touching any test file.

The test files must load under two **incompatible** Node behaviours:

| | Node 20/22 | Node 24 |
|---|---|---|
| Who loads `.ts` | `ts-node` → **CommonJS** | native type-strip → **ESM** |
| `require` | exists | **undefined** |
| `import.meta` | **TS1470 compile error** | fine |

`tsconfig.json` has `module: Node16` and `package.json` has no `"type": "module"`, so ts-node emits CommonJS — where `import.meta` is a hard compile error. Node 24 strips types natively and infers ESM from the `import` statements — where `require` does not exist.

So both of the obvious fixes are wrong:

- `const nodeRequire = require` → works on 20/22, **fails on 24**
- `createRequire(import.meta.url)` → works on 24, **fails on 20/22** with TS1470

The working form uses no meta-property at all:

```js
import { createRequire } from "module";
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
```

`createRequire` only needs a resolution base. A plain path compiles and runs on both.

Every test file carries a comment explaining this. **Keep it** — the next person to "clean up" `createRequire(import.meta.url)` breaks CI, which has already happened once.

### Verifying across versions locally

```bash
npx --yes node@20 -e "console.log(process.execPath)"   # get a Node 20 binary
```

Then run mocha with it directly. A compile check alone is not enough — reproduce the CI error with:

```bash
npx tsc --noEmit --module Node16 --moduleResolution Node16 --target ES2022 --skipLibCheck test/*.test.ts
```

## CI

Four workflows in `.github/workflows/`:

| Workflow | Triggers | Does |
|---|---|---|
| `echocode-tests.yml` | push + PR, all branches | **The real test job.** Matrix: Node 20, 22, 24 |
| `release.yml` | release | Tests on Node 20, then publishes |
| `main.yml` | push to main/dev, PR | Calls `ci.yml` |
| `ci.yml` | `workflow_call` | **Runs no tests** — see below |

Tests run under `xvfb-run -a` because some paths touch a display.

### Why the matrix

```yaml
strategy:
  fail-fast: false
  matrix:
    node-version: [20, 22, 24]
```

Because of the dual-runtime constraint above — code can be correct on one major and a hard failure on another. Node 20 is closest to what ships (VS Code 1.99's extension host bundles Node 20 via Electron), while contributors on a current install hit the Node 24 behaviour.

`fail-fast: false` matters: cancelling siblings on the first failure hides which majors are affected, which is the whole point.

`release.yml` stays pinned to a single version deliberately — a release should build on one known runtime.

### ci.yml verifies nothing

```yaml
      - name: Say Hello
        run: echo "Hello World!"
      - name: Install Dependencies
        run: npm install say
```

That is the entire job. It echoes a string and installs one package. `main.yml` calls it on every push to `main`/`dev` and every PR, so it presents as a green check that **cannot fail**.

A green check that can't fail is worse than no check — it reads as coverage. Either delete it and `main.yml` (since `echocode-tests.yml` already runs on all branches), or make it a real Windows test job. Windows is where the speech and voice paths diverge most, so genuine Windows coverage has real value.

## Known harness issues

**`npm run lint` is broken.** ESLint 9 requires `eslint.config.js` and the repo has none — it still has the old `.eslintrc` style, and `.gitignore` even ignores `**/eslint.config.mjs`. The `lint` script fails immediately.

**A `MODULE_TYPELESS_PACKAGE_JSON` warning** appears on every run for `vscodeMock.js` — Node cannot tell its module type and re-parses it as ESM. Harmless, but it is the same ambiguity that caused the dual-runtime problem. Adding `"type": "commonjs"` to `package.json` would silence it, but needs checking against the extension's own loading first.

**`__createMockContext()` was missing `globalStorageUri`** until recently — real VS Code always provides it. If you add a feature that writes to a context path, check the mock supplies it; a missing field surfaces as a confusing `undefined` deep in a path join.

## Writing a test

1. `import "./helpers/vscodeMock.js"` first — it must load before anything requiring `vscode`.
2. Use the `createRequire(path.join(process.cwd(), "package.json"))` form.
3. Stub the speech handler. The real one is audible and adds seconds per case.
4. Inject dependencies through `require.cache`, and restore them in a `finally`.
5. Save and restore any `globalThis.vscode` members you override — suites share one mock instance.
6. Verify on Node 20 as well as your local version.
