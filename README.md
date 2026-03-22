# Verdaccio E2E Testing

End-to-end tests for [Verdaccio](https://verdaccio.org) across all popular package managers.

## `@verdaccio/e2e-cli`

A standalone CLI tool that runs the full Verdaccio e2e test suite against **any running registry**. No need to copy test files per branch — just point it at your Verdaccio instance.

### Install

```bash
pnpm install
pnpm --filter @verdaccio/e2e-cli build
```

### Usage

```bash
# Start your Verdaccio instance first, then:
verdaccio-e2e --registry http://localhost:4873

# Test specific package managers
verdaccio-e2e -r http://localhost:4873 --pm npm --pm pnpm

# Test specific commands only
verdaccio-e2e -r http://localhost:4873 --test publish --test install

# Use a custom binary path
verdaccio-e2e -r http://localhost:4873 --pm npm=/path/to/npm

# Yarn modern requires the binary path
verdaccio-e2e -r http://localhost:4873 --pm yarn-modern=/path/to/yarn.js

# Pass an existing token instead of creating a user
verdaccio-e2e -r http://localhost:4873 --token your-auth-token

# Verbose output (debug logs)
verdaccio-e2e -r http://localhost:4873 -v
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --registry <url>` | Verdaccio registry URL **(required)** | — |
| `--pm <name[=path]>` | Package manager to test (repeatable) | `npm` |
| `-t, --test <name>` | Filter tests by name (repeatable) | all supported |
| `--token <token>` | Auth token (skips user creation) | auto-created |
| `--timeout <ms>` | Per-test timeout | `50000` |
| `-v, --verbose` | Enable debug output | `false` |

### Supported Package Managers

| Adapter | `--pm` value | Notes |
|---------|-------------|-------|
| npm | `npm` | Uses `--registry` flag |
| pnpm | `pnpm` | Uses `--registry` flag |
| Yarn Classic (v1) | `yarn-classic` | Uses `--registry` and `--cwd` flags |
| Yarn Modern (v2+) | `yarn-modern=/path/to/yarn.js` | Uses `.yarnrc.yml` for registry config |

### Tests

Tests are plain async functions (no test framework dependency). Each test auto-skips when the adapter doesn't support the required command.

| Test | Commands Required | npm | pnpm | yarn-classic | yarn-modern |
|------|-------------------|-----|------|--------------|-------------|
| publish | `publish` | yes | yes | yes | yes |
| install | `install` | yes | yes | yes | yes |
| info | `info` | yes | yes | yes | yes |
| audit | `audit` | yes | yes | yes | skip |
| deprecate | `deprecate` | yes | yes | skip | skip |
| dist-tags | `dist-tag` | yes | yes | skip | skip |
| ping | `ping` | yes | yes | skip | skip |
| search | `search` | yes | yes | skip | skip |
| star | `star` | yes | yes | skip | skip |
| unpublish | `unpublish` | yes | yes | skip | skip |

### Programmatic API

The CLI can also be used as a library:

```ts
import { createNpmAdapter, createPnpmAdapter, allTests, runAll } from '@verdaccio/e2e-cli';

const adapters = [createNpmAdapter(), createPnpmAdapter()];
const { results, exitCode } = await runAll(adapters, allTests, 'http://localhost:4873', token, {
  timeout: 50000,
  concurrency: 1,
});
```

### How It Works

1. The CLI pings the registry to ensure it's reachable
2. Creates a test user on the registry (or uses a provided `--token`)
3. For each package manager adapter:
   - Iterates through all test definitions
   - Skips tests requiring commands the adapter doesn't support
   - Each test scaffolds a temp project with `package.json` + `.npmrc` (or `.yarnrc.yml`)
   - Runs the PM command and asserts on the output
4. Reports results with pass/fail/skip per adapter

### Architecture

```
tools/e2e-cli/
├── bin/e2e-cli.js              # CLI entry point (ESM)
├── vite.config.ts              # Vite 8 build config (library mode)
├── src/
│   ├── index.ts                # CLI main + programmatic exports
│   ├── types.ts                # PackageManagerAdapter interface, TestDefinition, etc.
│   ├── runner.ts               # Test orchestrator with timeout
│   ├── reporter.ts             # Colored console output (PASS/FAIL/SKIP)
│   ├── adapters/               # One adapter per PM family
│   │   ├── npm.ts
│   │   ├── pnpm.ts
│   │   ├── yarn-classic.ts
│   │   └── yarn-modern.ts
│   ├── tests/                  # Framework-free test definitions (assert)
│   │   ├── publish.ts
│   │   ├── install.ts
│   │   ├── audit.ts
│   │   ├── info.ts
│   │   ├── deprecate.ts
│   │   ├── dist-tags.ts
│   │   ├── ping.ts
│   │   ├── search.ts
│   │   ├── star.ts
│   │   └── unpublish.ts
│   └── utils/
│       ├── process.ts          # Child process spawn wrapper
│       ├── project.ts          # Temp folder + package.json scaffolding
│       └── registry-client.ts  # User creation + ping via HTTP
```

### Build

Built with **Vite 8** in library mode. Pure ESM output, no Babel.

```bash
pnpm --filter @verdaccio/e2e-cli build   # vite build + tsc declarations
pnpm --filter @verdaccio/e2e-cli clean   # remove build/
```

## Legacy Test Packages

The `e2e/cli/` directory contains the original per-version test packages (e.g., `e2e-npm10`, `e2e-pnpm9`, `e2e-yarn4`). These use Vitest and start their own Verdaccio instance per test suite. The `@verdaccio/e2e-cli` package is the replacement — a single CLI that runs all tests against any external registry.

## UI Tests

Cypress-based UI tests are in `e2e/ui/`. They run against a Verdaccio Docker container.

```bash
pnpm test:ui
```

## Docker Tests

Docker Compose setups for proxy testing (nginx, apache) are in the `docker/` directory, run via GitHub Actions workflows.
