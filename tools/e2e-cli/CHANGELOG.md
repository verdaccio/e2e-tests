# @verdaccio/e2e-cli

## 2.10.1

### Patch Changes

- c855e2c: Remove the `star`/`unstar` CLI e2e test

  The `star` test (covering both starring and unstarring a package) has been removed, along with the `star`/`stars`/`unstar` command capabilities from the npm and pnpm adapters and the related documentation.

## 2.10.0

### Minor Changes

- 5a179ad: Add a pnpm scenario testing `minimumReleaseAge` with `minimumReleaseAgeExclude`

  A new `scenario:minimum-release-age` exercises pnpm's release-age cooldown (`minimumReleaseAge: 10080`) together with `minimumReleaseAgeExclude` (`@verdaccio/*`, `verdaccio-*`). It verifies that excluded packages install despite being freshly published while a non-excluded fresh package is blocked by the cooldown. The scenario is gated via a new `appliesTo` predicate on `TestDefinition` to pnpm 11.1.0+ (the cooldown is silently ignored in 11.0.x) and is skipped for other package managers.

## 2.9.0

### Minor Changes

- d788be0: feat: disable hardened mode for yarn 4

## 2.8.0

### Minor Changes

- 4986546: Add Bun and Deno package manager adapters for e2e CLI tests
  - Bun: supports publish, install, info, and audit commands
  - Deno: supports install and info commands (reads registry from .npmrc)

## 2.7.0

### Minor Changes

- 5d67472: Add ci test, install-multiple-deps scenario, and audit test improvements
  - Add `ci` test that verifies lockfile-based install (npm ci, pnpm --frozen-lockfile, yarn --frozen-lockfile/--immutable)
  - Add `scenario:install-multiple-deps` scenario that publishes a dependency tree and installs them in a consumer project
  - Restrict audit test to npm only and skip gracefully when the registry does not support the audit endpoint
  - Fix install test to work with npm@7 (removed audit field assertion)
  - Add verdaccio next-7 to CI matrix
  - Update CI to use .nvmrc for node version

## 2.6.0

### Minor Changes

- 881408e: feat: add pnpm v11 support with version-aware command handling

## 2.5.0

### Minor Changes

- c59d6cb: add login e2e for yarn
- 3f6c864: feat: add deprecate support for yarn modern adapter using @verdaccio/yarn-plugin-npm-deprecate
- 20b0092: feat: add ping support for yarn modern adapter using @verdaccio/yarn-plugin-npm-ping

## 2.4.0

### Minor Changes

- ad5b749: Replace `got` HTTP client with Node.js built-in `fetch`. Removes `got`, `p-cancelable` dependencies and pnpm overrides. Requires Node.js 18+.

## 2.3.0

### Minor Changes

- 92a6041: feat: add temp folder

## 2.2.0

### Minor Changes

- 43b958f: feat: add versions

## 2.1.1

### Patch Changes

- f2fe5f8: fix: add build folder

## 2.1.0

### Minor Changes

- 2d37347: Add dual CJS/ESM output format for both packages. Build now produces `build/esm/` (ES modules) and `build/cjs/` (CommonJS) via Vite 8 with separate rollup output configs. Package exports map `import` to ESM and `require` to CJS.

## 2.0.0

### Major Changes

- cfc77c9: feat: first release
