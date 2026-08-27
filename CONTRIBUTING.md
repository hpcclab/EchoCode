# Contributing to EchoCode

## Commit message convention

Every push to `main` runs [semantic-release](https://semantic-release.gitbook.io/), which computes the next
version number, updates `CHANGELOG.md`, tags the release, and publishes the extension to the VS Code
Marketplace automatically — no manual version bump required. It does this by reading your commit messages, so
commits on `main` (including squash-merge commit messages) must follow
[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

Common types and what they trigger:

| Type | Effect |
| --- | --- |
| `fix:` | Patch release (e.g. `2.1.0` → `2.1.1`) |
| `feat:` | Minor release (e.g. `2.1.0` → `2.2.0`) |
| `feat!:` or a footer starting with `BREAKING CHANGE:` | Major release (e.g. `2.1.0` → `3.0.0`) |
| `docs:`, `chore:`, `refactor:`, `style:`, `test:`, `ci:` | No release — tests still run, nothing is published |

Examples:

```
fix: correct guidance level not persisting across sessions
feat: add microphone auto-selection on startup
feat!: drop support for VS Code < 1.99

BREAKING CHANGE: minimum supported VS Code version is now 1.99.
```

If a merge to `main` contains no release-worthy commits, the `Release` workflow still runs the test suite but
publishes nothing.
