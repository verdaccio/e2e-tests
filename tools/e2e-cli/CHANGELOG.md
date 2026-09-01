# @verdaccio/e2e-cli

## 3.1.0

### Minor Changes

- 536ab30: chore: trigger release

## 3.0.0

### Major Changes

- 696bcfb: Drop support for end-of-life package managers:

  - **npm**: only majors 10, 11 and 12 are supported (npm 8 and 9 removed).
    npm 12 is stable now, so the CI matrix runs `npm@12` instead of a pinned
    pre-release.
  - **pnpm**: minimum supported major is 10 (pnpm 8 and 9 removed).
  - **Yarn Classic (v1)**: removed entirely — the `yarn-classic` adapter is gone
    and `--pm yarn-classic` / `--pm yarn1` now fail with a clear error pointing
    to `yarn-modern` (Yarn 3+).

  The npm and pnpm adapters now validate the resolved version and fail fast
  with an explicit error when an unsupported version is requested (or found in
  PATH), instead of running the suite against a client that is no longer
  maintained.

### Minor Changes

- 696bcfb: Add `scenario:search` — a contract battery for `GET /-/v1/search` pinning the
  registry.npmjs.org spec and what npm CLI 12 actually consumes: result shape
  (`maintainers` must be an array), real `total` vs page size, `from`/`size`
  pagination over local results and over results merged with an uplink, 400
  `ERR_TEXT_MISSING` without `text`, ISO 8601 `time`, the npmjs size clamp, and
  a real `npm search --json` on top. The shared mock uplink now implements
  `/-/v1/search` the way npmjs does (it applies `from`/`size` itself and reports
  the real `total`), which is what exposes double pagination in the registry
  under test. The contract checks run independently and are all reported before
  the scenario fails, so one run lists every divergence.

  The checks that are red against every current Verdaccio (real `total`, 400
  without `text`, ISO `time`, merged local+uplink pagination) ship disabled
  behind `PENDING_CONTRACT_CHECKS_ENABLED` so the scenario stays green in CI;
  flip the flag once the registry-side fixes land.

- 696bcfb: Add an HTTP-protocol e2e battery and the harness support it needs:

  - `scenario:tarballs`: publishes a large (~30 MB, incompressible) package and
    exercises the tarball endpoints — full download with Content-Length +
    shasum/integrity verification, repeated client aborts mid-download,
    concurrent downloads, 404s (missing package/version/mismatched filename),
    scoped `%2f`-encoded URLs, and an end-to-end install through the package
    manager.
  - `scenario:metadata`: packument battery — full packument shape (versions,
    dist-tags, readme, time), abbreviated metadata
    (`Accept: application/vnd.npm.install-v1+json`), `ETag`/`If-None-Match`
    → 304 revalidation, `dist.tarball` URL rewriting, scoped `%2f` URLs, 404
    error body, and coherence after publish/unpublish.
  - `scenario:uplink-failure`: starts a controllable mock uplink and verifies
    registry behavior when the uplink is healthy, drops the connection
    mid-tarball (no client hang, no poisoned cache), is slower than the
    configured timeout, or is down (cached packages still served, clean errors
    otherwise). Gated on `--uplink-port` / `E2E_UPLINK_PORT`.
  - New `--print-config` flag printing the recommended registry config for the
    full battery (`max_body_size: 100mb`, mock uplink wiring) so every consuming
    repo starts Verdaccio from the same single source of truth.
  - New `--uplink-port` flag and support for per-test minimum timeouts in
    `TestDefinition`.
  - The whole suite now runs fully offline: the generated config has no npmjs
    uplink, and every test publishes the packages it consumes (install, ci,
    audit, info and search no longer depend on react/is-odd/jquery/npmjs).
    Adapters that cannot publish (deno) get their fixtures through the raw
    registry HTTP API. Project `.npmrc` files disable npm's implicit
    audit/fund requests, and client-side tests always run from a prepared
    project so a stale token in the developer's global `~/.npmrc` cannot break
    them. The audit test skips cleanly when the audit upstream is unreachable.

### Patch Changes

- 696bcfb: Harden `scenario:metadata`: the abbreviated (install-v1) check now asserts
  `_id`, `_rev` and `readmeFilename` are absent (not just `readme` — all of them
  leaked once), and a new sub-test verifies the packument ETag changes after a
  new version is published, so a stuck ETag serving 304 forever fails the suite.
- 696bcfb: Harden the remaining scenarios:

  - `scenario:tarballs`: shasum/integrity assertions are now hard (their absence
    on a locally published version is a bug, not a skip), aborts now exercise
    three depths into the stream (first chunk, 25%, 50%) via a new `onChunk`
    download hook, and two gated contract checks pin that tarball responses
    should advertise `Content-Length` and must not be re-compressed for
    gzip-accepting clients (red against current registries — behind
    `PENDING_CONTRACT_CHECKS_ENABLED`).
  - `scenario:uplink-failure`: new sub-test for an uplink answering 500 (cached
    package still served, unknown fails cleanly, registry stays up), and the
    slow-uplink assertion tightened from 9s to 6s so retry/timeout
    multiplication regressions are caught earlier.
  - `scenario:install-multiple-deps`: the re-install phase now verifies the
    version that actually lands in `node_modules` — `^1.0.0` must resolve to
    1.0.0 even though `dist-tags.latest` points at 2.0.0 (npm/pnpm/bun; yarn
    PnP has no `node_modules`).

## 2.10.4

### Patch Changes

- 268bf03: chore: update dependencies (get-port 7, js-yaml 5, and tooling)

## 2.10.3

### Patch Changes

- 7250c67: Update Yarn modern login tests for Verdaccio without incoming Basic authentication. The login scenario now treats duplicate legacy login as unsupported and uses fresh users for publish and switch-user checks.

## 2.10.2

### Patch Changes

- 513ed8d: fix: support npm 12 in e2e-cli

  npm 12 wraps `npm info <pkg> --json` output in a single-element array instead of
  a bare object, which made the info, deprecate and install-multiple-deps tests read
  an `undefined` package name. Added a `normalizeInfo` helper that unwraps the array
  (backward-compatible with older npm).

  Also pin `min-release-age=0` in the generated project `.npmrc` so npm 12's new
  release-age cooldown — if set in a developer's global `~/.npmrc` — no longer rejects
  the freshly published packages the tests install.

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
