# Verdaccio E2E Testing

End-to-end tests for [Verdaccio](https://verdaccio.org) across all popular package managers and the web UI.

## Packages

| Package | Description |
|---------|-------------|
| [`@verdaccio/e2e-cli`](tools/e2e-cli) | CLI e2e tests (publish, install, audit, etc.) |
| [`@verdaccio/e2e-ui`](tools/e2e-ui) | Cypress UI e2e tests (home, signin, publish) |

## Quick Start

```bash
pnpm install
pnpm build

# CLI tests — run against any Verdaccio
./scripts/run-e2e.sh 6 npm

# UI tests — run Cypress against any Verdaccio
./scripts/run-e2e-ui.sh 6

# Full matrix (all PMs x Verdaccio 5+6)
./scripts/run-e2e-matrix.sh
```

---

## `@verdaccio/e2e-cli`

A standalone CLI tool that runs the full Verdaccio e2e test suite against **any running registry**. No test framework dependency — just plain `assert`.

### Usage

```bash
verdaccio-e2e --registry http://localhost:4873
verdaccio-e2e -r http://localhost:4873 --pm npm --pm pnpm
verdaccio-e2e -r http://localhost:4873 --test publish --test install
verdaccio-e2e -r http://localhost:4873 --pm yarn-modern=/path/to/yarn.js
verdaccio-e2e -r http://localhost:4873 -v   # verbose — shows each command
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --registry <url>` | Verdaccio registry URL **(required)** | — |
| `--pm <name[=path]>` | Package manager to test (repeatable) | `npm` |
| `-t, --test <name>` | Filter tests by name (repeatable) | all supported |
| `--token <token>` | Auth token (skips user creation) | auto-created |
| `--timeout <ms>` | Per-test timeout | `50000` |
| `-v, --verbose` | Show each command executed | `false` |

### Supported Package Managers

| Adapter | `--pm` value | Notes |
|---------|-------------|-------|
| npm | `npm` | Uses `--registry` flag |
| pnpm | `pnpm` | Uses `--registry` flag |
| Yarn Classic (v1) | `yarn-classic` | Requires Yarn 1.x in PATH |
| Yarn Modern (v2+) | `yarn-modern=/path/to/yarn.js` | Uses `.yarnrc.yml` for registry config |

### Tests

| Test | npm | pnpm ≤10 | pnpm ≥11 | yarn-classic | yarn-modern |
|------|-----|----------|----------|--------------|-------------|
| publish | yes | yes | yes | yes | yes |
| install | yes | yes | yes | yes | yes |
| info | yes | yes | yes | yes | yes |
| audit | yes | yes | yes | yes | skip |
| deprecate | yes | yes | yes | skip | yes |
| dist-tags | yes | yes | skip | skip | skip |
| login | skip | skip | skip | skip | yes |
| ping | yes | yes | skip | skip | yes |
| search | yes | yes | skip | skip | skip |
| star | yes | yes | skip | skip | skip |
| unpublish | yes | yes | yes | skip | skip |

> **pnpm ≥11 notes:** pnpm v11 reimplemented many commands natively and removed `ping`, `search`, `star`, and `dist-tag`. Un-deprecate uses the new `pnpm undeprecate` command (other package managers use `deprecate pkg ""` with an empty message).

See [docs/cli-tests.md](docs/cli-tests.md) for detailed descriptions of what each test asserts.

### Programmatic API

```ts
import { createNpmAdapter, createPnpmAdapter, allTests, runAll } from '@verdaccio/e2e-cli';

const adapters = [createNpmAdapter(), createPnpmAdapter()];
const { results, exitCode } = await runAll(adapters, allTests, 'http://localhost:4873', token, {
  timeout: 50000,
  concurrency: 1,
});
```

---

## `@verdaccio/e2e-ui`

A Cypress plugin that provides reusable Verdaccio UI test suites. Run the same tests against any Verdaccio version without copying test files.

### Install

```bash
npm install @verdaccio/e2e-ui cypress
```

### Setup

**`cypress.config.ts`**

```ts
import { defineConfig } from 'cypress';
import { setupVerdaccioTasks } from '@verdaccio/e2e-ui';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4873',
    setupNodeEvents(on) {
      setupVerdaccioTasks(on, { registryUrl: 'http://localhost:4873' });
    },
  },
});
```

**`cypress/support/e2e.ts`**

```ts
import '@verdaccio/e2e-ui/commands';
```

**`cypress/e2e/verdaccio.cy.ts`**

```ts
import { createRegistryConfig, registerAllTests } from '@verdaccio/e2e-ui';

const config = createRegistryConfig({ registryUrl: 'http://localhost:4873' });
registerAllTests(config);
```

Or pick individual suites:

```ts
import { createRegistryConfig, homeTests, signinTests } from '@verdaccio/e2e-ui';

const config = createRegistryConfig({
  registryUrl: 'http://localhost:4873',
  title: 'My Verdaccio',           // optional, default: 'Verdaccio'
  credentials: { user: 'admin', password: 'admin' },  // optional
});

homeTests(config);
signinTests(config);
```

### Test Suites

| Suite | Tests |
|-------|-------|
| `homeTests` | Page title, help card (empty registry), 404 page |
| `signinTests` | Login, logout |
| `publishTests` | Publish package, navigate detail, readme, dependencies, versions, uplinks |

### Custom Commands

Importing `@verdaccio/e2e-ui/commands` adds:

| Command | Description |
|---------|-------------|
| `cy.getByTestId(id)` | Find element by `data-testid` attribute |
| `cy.login(user, password)` | Login to Verdaccio UI |

### Exports

| Export | Description |
|--------|-------------|
| `setupVerdaccioTasks(on, options)` | Register Cypress tasks |
| `createRegistryConfig(options)` | Build config with defaults |
| `registerAllTests(config)` | Register all test suites |
| `homeTests(config)` | Home page tests |
| `signinTests(config)` | Login/logout tests |
| `publishTests(config)` | Package publish + detail tests |

---

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/run-e2e.sh [version] [pm]` | Run CLI tests against a Verdaccio version |
| `./scripts/run-e2e-ui.sh [version]` | Run Cypress UI tests against a Verdaccio version |
| `./scripts/run-e2e-matrix.sh` | Run CLI tests for all detected PMs x Verdaccio 5+6 |

All scripts accept `--docker` to use Docker images instead of local npm install.

```bash
./scripts/run-e2e.sh 6 npm                # CLI: verdaccio@6, npm
./scripts/run-e2e.sh 5 pnpm               # CLI: verdaccio@5, pnpm
./scripts/run-e2e.sh --docker 6 npm       # CLI: Docker verdaccio@6
./scripts/run-e2e-ui.sh 6                  # UI: verdaccio@6
./scripts/run-e2e-ui.sh --docker 6         # UI: Docker verdaccio@6
./scripts/run-e2e-ui.sh --open             # UI: interactive Cypress
./scripts/run-e2e-matrix.sh               # Full CLI matrix
./scripts/run-e2e-matrix.sh --docker      # Full CLI matrix via Docker
```

## Build

All packages built with **Vite 8** in library mode. Pure ESM, no Babel.

```bash
pnpm build        # build all tools
pnpm clean        # clean build output
```
