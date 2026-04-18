# CLI E2E Test Reference

Detailed description of what each `@verdaccio/e2e-cli` test asserts.

## publish

Publishes four packages (two unscoped, two scoped) and validates the output format.

| Sub-test | Assertion |
|----------|-----------|
| Publish each package | **yarn-modern**: output matches `Package archive published`. **yarn-classic**: output length > 0. **npm/pnpm**: JSON contains `name` matching the package and `files` is defined. |

- **yarn-modern** runs `install` before each publish to generate the lockfile.
- Tests both scoped (`@verdaccio/foo-*`) and unscoped (`verdaccio-*`) packages.

## install

Installs `react@18.2.0` as a dependency and validates the result.

| Sub-test | Assertion |
|----------|-----------|
| Install dependency | **npm**: JSON contains `added` and `audit` fields. **pnpm/yarn**: exit code 0 is sufficient. |

## info

Fetches package info for `verdaccio` from the registry.

| Sub-test | Assertion |
|----------|-----------|
| Fetch info | **yarn-classic**: NDJSON output contains a line with `type === "inspect"`. **npm/pnpm/yarn-modern**: JSON has `name: "verdaccio"` and `dependencies` is defined. |

## audit

Runs `audit` against a project with `jquery@3.6.1` as a dependency.

| Sub-test | Assertion |
|----------|-----------|
| Audit unscoped package | **npm**: JSON contains `metadata`, `auditReportVersion`, and `vulnerabilities`. **pnpm/yarn**: valid JSON response is returned. |
| Audit scoped package | Same assertions as above with a `@verdaccio/` scoped name. |

- Runs `install` first to generate the lock file before auditing.

## deprecate

Three sub-tests covering deprecate, un-deprecate, and multi-version deprecation.

| Sub-test | Assertion |
|----------|-----------|
| 1. Deprecate single version | Publishes `dep1@1.0.0`, deprecates it. `info` returns `deprecated: "some message"`. |
| 2. Un-deprecate | Publishes `dep2@1.0.0`, deprecates it, verifies `deprecated` is set, then un-deprecates with an empty string. Asserts `deprecated` is `undefined`. |
| 3. Deprecate all versions | Publishes `dep3` at 4 versions (1.0.0 - 1.3.0), deprecates all by passing the bare package name. Asserts all 4 versions have `deprecated` set. Then publishes 1.4.0 and asserts it is **not** deprecated. |

- **yarn-modern**: imports `@verdaccio/yarn-plugin-npm-deprecate` via `importPlugin`, runs `install` before each publish, and omits `--json` on the deprecate command.

## login

Tests user creation and authentication via non-interactive legacy auth (yarn-modern only).

| Sub-test | Assertion |
|----------|-----------|
| 1. Create new user + whoami | Runs `yarn npm login --auth-type=legacy` with `--user`, `--password`, `--email` to create a new user. Asserts output contains "Logged in" or "token saved". Then runs `yarn npm whoami` and asserts it returns the created username. |
| 2. Login existing user + whoami | Logs in again with the same credentials (authenticates existing user, not creating). Asserts login succeeds and `whoami` returns the same username. |

- **yarn-modern**: imports `@verdaccio/yarn-plugin-npm-login` via `importPlugin`. Uses fully non-interactive flags.
- **npm/pnpm**: not implemented (npm login requires TTY interaction).

## dist-tags

Three sub-tests covering listing, removing, and adding dist-tags.

| Sub-test | Assertion |
|----------|-----------|
| 1. List tags | Publishes v1.0.0, then v1.1.0 with `--tag beta`. `dist-tag ls --json` output contains `beta: 1.1.0` and `latest: 1.0.0`. |
| 2. Remove tag | Publishes v1.0.0 and v1.1.0 with `--tag beta`. `dist-tag rm beta` output contains `-beta: pkg@1.1.0`. |
| 3. Add tag | Publishes v1.0.0 and v1.1.0. `dist-tag add pkg@1.1.0 alfa` output contains `+alfa: pkg@1.1.0`. |

## ping

Pings the registry to verify it is reachable.

| Sub-test | Assertion |
|----------|-----------|
| Ping registry | **npm/pnpm**: JSON contains `registry` matching the registry URL with trailing slash. **yarn-modern**: exit code 0 is sufficient (no JSON output). |

- **yarn-modern**: creates a project context and imports `@verdaccio/yarn-plugin-npm-ping` via `importPlugin`.

## search

Searches for `@verdaccio/cli` in the registry.

| Sub-test | Assertion |
|----------|-----------|
| Search by name | JSON array response contains an entry with `name: "@verdaccio/cli"`. |

## star

Two sub-tests covering starring and unstarring a package.

| Sub-test | Assertion |
|----------|-----------|
| 1. Star | Publishes a package, stars it. Output includes the package name. |
| 2. Unstar | Publishes a package, stars it, then unstars it. Output includes the package name. |

## unpublish

Two sub-tests covering full unpublish and single-version unpublish.

| Sub-test | Assertion |
|----------|-----------|
| 1. Unpublish entire package | Publishes 4 versions (1.0.0, 1.1.0, 1.2.0, 2.0.0), then `unpublish --force`. Output includes the package name. |
| 2. Unpublish single version | Publishes 2 versions (1.0.0, 1.1.0), then `unpublish pkg@1.0.0 --force`. Output includes `pkg@1.0.0`. |
