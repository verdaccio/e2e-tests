# Verdaccio E2E Testing

End-to-end tests for [Verdaccio](https://verdaccio.org) across all popular package managers and the web UI.

## Packages

| Package                               | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| [`@verdaccio/e2e-cli`](tools/e2e-cli) | CLI e2e tests (publish, install, audit, etc.) |
| [`@verdaccio/e2e-ui`](tools/e2e-ui)   | Cypress UI e2e tests (home, signin, publish)  |

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
verdaccio-e2e -r http://localhost:4873 --pm bun --pm deno
verdaccio-e2e -r http://localhost:4873 --test publish --test install
verdaccio-e2e -r http://localhost:4873 --pm yarn-modern=/path/to/yarn.js
verdaccio-e2e -r http://localhost:4873 -v   # verbose — shows each command
```

### CLI Options

| Option                 | Description                                                         | Default            |
| ---------------------- | ------------------------------------------------------------------- | ------------------ |
| `-r, --registry <url>` | Verdaccio registry URL **(required)**                               | —                  |
| `--pm <name[=path]>`   | Package manager to test (repeatable)                                | `npm`              |
| `-t, --test <name>`    | Filter tests by name (repeatable)                                   | all supported      |
| `--token <token>`      | Auth token (skips user creation)                                    | auto-created       |
| `--timeout <ms>`       | Per-test timeout                                                    | `50000`            |
| `--uplink-port <port>` | Port for the mock uplink used by `scenario:uplink-failure`          | `$E2E_UPLINK_PORT` |
| `--print-config`       | Print the recommended registry config for the full battery and exit | —                  |
| `-v, --verbose`        | Show each command executed                                          | `false`            |

The suite runs **fully offline**: every test publishes the packages it consumes, the generated registry config has no npmjs uplink, and the prepared projects disable npm's implicit audit/fund requests. Nothing in the suite depends on npmjs.org being reachable.

#### Running the full battery

The HTTP-protocol scenarios need a registry started with a specific config (`max_body_size` for the large-tarball tests, a mock uplink for the failure tests). The CLI prints that config so every consumer starts Verdaccio from the same source of truth:

```bash
verdaccio-e2e --print-config --uplink-port 4874 > /tmp/verdaccio-e2e/config.yaml
verdaccio --config /tmp/verdaccio-e2e/config.yaml --listen 4873 &
verdaccio-e2e --registry http://localhost:4873 --uplink-port 4874
```

Without `--uplink-port`, `scenario:uplink-failure` is skipped and the rest of the suite runs against any plain registry.

### Supported Package Managers

| Adapter           | `--pm` value                   | Notes                                                       |
| ----------------- | ------------------------------ | ----------------------------------------------------------- |
| npm (10-12)       | `npm`                          | Uses `--registry` flag                                      |
| pnpm (10+)        | `pnpm`                         | Uses `--registry` flag                                      |
| Yarn Modern (v3+) | `yarn-modern=/path/to/yarn.js` | Uses `.yarnrc.yml` for registry config                      |
| Bun               | `bun`                          | Uses `--registry` flag (except `info` which reads `.npmrc`) |
| Deno              | `deno`                         | Reads registry from `.npmrc`, install and info only         |

> Dropped: npm 8/9, pnpm 8/9 and Yarn Classic (v1) are end-of-life and no
> longer supported by the suite.

### Tests

| Test      | npm  | pnpm 10 | pnpm ≥11 | yarn-modern | bun  | deno |
| --------- | ---- | ------- | -------- | ----------- | ---- | ---- |
| publish   | yes  | yes     | yes      | yes         | yes  | skip |
| install   | yes  | yes     | yes      | yes         | yes  | yes  |
| ci        | yes  | yes     | yes      | yes         | yes  | skip |
| info      | yes  | yes     | yes      | yes         | yes  | yes  |
| audit     | yes  | yes     | yes      | skip        | yes  | skip |
| deprecate | yes  | yes     | yes      | yes         | skip | skip |
| dist-tags | yes  | yes     | skip     | skip        | skip | skip |
| login     | skip | skip    | skip     | yes         | skip | skip |
| ping      | yes  | yes     | skip     | yes         | skip | skip |
| search    | yes  | yes     | skip     | skip        | skip | skip |
| unpublish | yes  | yes     | yes      | skip        | skip | skip |

> **pnpm ≥11 notes:** pnpm v11 reimplemented many commands natively and removed `ping`, `search`, and `dist-tag`. Un-deprecate uses the new `pnpm undeprecate` command (other package managers use `deprecate pkg ""` with an empty message).
>
> **Bun notes:** `bun info` reads the registry from `.npmrc` (does not accept `--registry`). All other commands use `--registry`.
>
> **Deno notes:** Deno reads the registry entirely from `.npmrc`. Only `install` and `info` are supported. `deno info` uses `npm:<pkg>` specifiers with `--node-modules-dir=auto`.

### Scenarios

Scenarios are complex, multi-step tests that simulate real-world workflows beyond single-command operations. They exercise the registry under realistic conditions — many parallel requests, transitive dependency resolution, version updates, etc.

| Scenario                         | Description                                                                                                                                                                                                    | Requires                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `scenario:install-multiple-deps` | Publishes a tree of packages (leaf, shared, intermediate with transitive deps), installs them all in a consumer project, verifies metadata, then publishes updated versions and re-installs with semver ranges | `publish`, `install`, `info`                     |
| `scenario:minimum-release-age`   | Exercises pnpm's `minimumReleaseAge` cooldown + `minimumReleaseAgeExclude` globs: excluded fresh packages install, non-excluded ones are blocked                                                               | pnpm 11.1+                                       |
| `scenario:tarballs`              | HTTP-level tarball battery over a large (~30 MB) package: full download integrity, client aborts mid-download, concurrent downloads, 404s, scoped `%2f` URLs, end-to-end install                               | npm adapter                                      |
| `scenario:metadata`              | HTTP-level packument battery: full and abbreviated (install-v1) metadata shape, `ETag`/304 revalidation, `dist.tarball` URL rewriting, 404 error body, coherence after publish/unpublish                       | npm adapter                                      |
| `scenario:search`                | Contract battery for `GET /-/v1/search`: result shape, real `total`, `from`/`size` pagination (local and merged with an uplink), 400 without `text`, ISO `time`, size clamp, plus a real `npm search` on top   | npm adapter (uplink checks need `--uplink-port`) |
| `scenario:uplink-failure`        | Starts a controllable mock uplink and verifies registry behavior when the upstream is healthy, cuts the connection mid-tarball, is slower than the timeout, or is down                                         | npm adapter, `--uplink-port` + battery config    |

Run a specific scenario:

```bash
verdaccio-e2e -r http://localhost:4873 -t scenario:install-multiple-deps
```

#### `scenario:install-multiple-deps`

Simulates a realistic `npm install` that triggers many parallel registry requests. The test has four phases:

1. **Publish seed packages** — publishes 5 leaf packages, a shared package, and an intermediate package that depends on some leaves + shared (8 packages total)
2. **Install all dependencies** — creates a consumer project that depends on all packages (including transitive overlap via the intermediate), runs `install`
3. **Verify installed packages** — asserts every package is in the registry with correct name, version, and dependency metadata
4. **Update and re-install** — publishes v2.0.0 of selected packages, creates a new consumer using `^` ranges, installs, and verifies `dist-tags.latest` reflects the update

#### `scenario:tarballs`

Publishes a large (~30 MB, incompressible) package and exercises the tarball endpoints directly over HTTP:

- full download with `Content-Length` + shasum/integrity verification
- repeated client aborts mid-download — the response must terminate, never leave the client hanging, and the registry must survive
- concurrent downloads of the same tarball
- correct 404s for missing package, missing version, and mismatched filename
- scoped packages through `%2f`-encoded URLs
- a final end-to-end install through the package manager

#### `scenario:metadata`

Packument battery over HTTP:

- full packument shape (`versions`, `dist-tags`, `readme`, `time`)
- abbreviated metadata via `Accept: application/vnd.npm.install-v1+json` — asserts internal fields (`_id`, `_rev`, `readme`) are **not** leaked, matching the npm registry contract
- `ETag` / `If-None-Match` → `304` revalidation
- `dist.tarball` URLs rewritten to the serving registry
- scoped `%2f` URLs, 404 error body shape, and metadata coherence after publish/unpublish

#### `scenario:search`

Pins the registry.npmjs.org `GET /-/v1/search` contract (spec + what npm CLI 12 actually consumes). Publishes a set of uniquely-prefixed packages and asserts over raw HTTP:

- result shape npm CLI depends on: `package.name`/`version` and `maintainers` as an **array** (npm CLI maps it without a guard — a non-array crashes `npm search`)
- `total` is the real number of matches, not the size of the returned page
- `from`/`size` pagination walks the local result set without gaps or overlaps
- **merged local + uplink pagination happens exactly once** — the mock uplink implements `/-/v1/search` the way npmjs does (it applies `from` itself), so a registry that slices again produces empty or shifted pages
- missing `text` → 400 `ERR_TEXT_MISSING` (spec), not an empty 200
- `time` is an ISO 8601 date-time
- oversized `size` requests are clamped (npmjs caps at 250), not an error
- a real `npm search <prefix> --json` finds every published package

The contract checks run independently and are all reported before the scenario fails, so a single run lists every divergence at once. The two uplink sub-tests are gated on `--uplink-port` / `E2E_UPLINK_PORT`.

> **Temporarily disabled** behind `PENDING_CONTRACT_CHECKS_ENABLED` (in `scenarios/search.ts`): the real-`total`, 400-without-`text`, ISO-`time`, and merged local+uplink pagination checks. They pin the correct npmjs contract but are red against every current Verdaccio — flip the flag once the registry-side fixes land.

#### `scenario:uplink-failure`

Starts a **controllable mock uplink** (on `--uplink-port`) and verifies how the registry behaves when its upstream misbehaves:

- healthy uplink: packages proxy normally
- uplink drops the connection mid-tarball: the client must not hang and the cache must not be poisoned
- uplink slower than the configured timeout: the request fails fast instead of multiplying retries
- uplink down: cached packages are still served, everything else fails cleanly

Requires the registry to be started with the config from `--print-config` (it wires the mock uplink in). Gated on `--uplink-port` / `E2E_UPLINK_PORT` — skipped otherwise.

See [docs/cli-tests.md](docs/cli-tests.md) for detailed descriptions of what each test asserts.

### Programmatic API

```ts
import {
  allTests,
  createBunAdapter,
  createDenoAdapter,
  createNpmAdapter,
  createPnpmAdapter,
  runAll,
} from '@verdaccio/e2e-cli';

const adapters = [createNpmAdapter(), createPnpmAdapter(), createBunAdapter(), createDenoAdapter()];
const { results, exitCode } = await runAll(adapters, allTests, 'http://localhost:4873', token, {
  timeout: 50000,
  concurrency: 1,
});
```

Run only scenarios:

```ts
import { allScenarios, createNpmAdapter, runAll } from '@verdaccio/e2e-cli';

const { results, exitCode } = await runAll(
  [createNpmAdapter()],
  allScenarios,
  'http://localhost:4873',
  token,
  {
    timeout: 120000,
    concurrency: 1,
  }
);
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
  title: 'My Verdaccio', // optional, default: 'Verdaccio'
  credentials: { user: 'admin', password: 'admin' }, // optional
});

homeTests(config);
signinTests(config);
```

### Test Suites

| Suite          | Tests                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| `homeTests`    | Page title, help card (empty registry), 404 page                          |
| `signinTests`  | Login, logout                                                             |
| `publishTests` | Publish package, navigate detail, readme, dependencies, versions, uplinks |

### Custom Commands

Importing `@verdaccio/e2e-ui/commands` adds:

| Command                    | Description                             |
| -------------------------- | --------------------------------------- |
| `cy.getByTestId(id)`       | Find element by `data-testid` attribute |
| `cy.login(user, password)` | Login to Verdaccio UI                   |

### Exports

| Export                             | Description                    |
| ---------------------------------- | ------------------------------ |
| `setupVerdaccioTasks(on, options)` | Register Cypress tasks         |
| `createRegistryConfig(options)`    | Build config with defaults     |
| `registerAllTests(config)`         | Register all test suites       |
| `homeTests(config)`                | Home page tests                |
| `signinTests(config)`              | Login/logout tests             |
| `publishTests(config)`             | Package publish + detail tests |

---

## Scripts

| Script                                | Description                                               |
| ------------------------------------- | --------------------------------------------------------- |
| `./scripts/run-e2e.sh [version] [pm]` | Run CLI tests against a Verdaccio version                 |
| `./scripts/run-e2e-ui.sh [version]`   | Run Cypress UI tests against a Verdaccio version          |
| `./scripts/run-e2e-matrix.sh`         | Run CLI tests for all detected PMs x Verdaccio 5+6+next-7 |

All scripts accept `--docker` to use Docker images instead of local npm install.

```bash
./scripts/run-e2e.sh 6 npm                # CLI: verdaccio@6, npm
./scripts/run-e2e.sh 5 pnpm               # CLI: verdaccio@5, pnpm
./scripts/run-e2e.sh next-7 npm           # CLI: verdaccio@next-7, npm
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
