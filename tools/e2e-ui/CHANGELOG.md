# @verdaccio/e2e-ui

## 2.7.0

### Minor Changes

- 661fe1f: Second wave of feature-gated coverage, closing the e2e gaps left by the verdaccio/verdaccio#6210 bug batch:

  - `publishPackage` task accepts a `manifest` override merged into the generated package.json, enabling fixtures with the manifest shapes real packuments carry (string `repository`, `funding` arrays, contributors without email, …)
  - `manifestRenderingTests` — repository rendered as a browsable https link (git:// rewrite), funding array, bugs url, sidebar gravatars and email-less contributors surviving dedupe
  - `sessionTests` — an expired token in localStorage boots the UI logged out (default on) and is purged from storage (probe)
  - `detailTests` gains a stale-state probe: the versions tab must show the current package after SPA navigation
  - `failureModeTests` gains search-5xx (error instead of "no results found") and failed-tarball-download (error snackbar instead of silence) probes
  - `settingsTests` gains a dayjs-locale probe: relative dates must follow the selected language

  Probes default `false` (they need the #6210 fixes); everything else runs against released lines. Validated green against published verdaccio@6 with defaults and 19/19 with every probe enabled against a #6210 master build.

- 661fe1f: second wave of coverage: session token lifecycle suite (expired stored token boots logged out, optional purge probe), manifest-rendering suite (string/array `repository`, `funding`, `bugs` and email-less contributors), publishPackage task accepts manifest overrides, and new feature-gated probes in the detail, failure-modes and settings suites.

  Also makes the change-password wrong-old-password assertion text-agnostic: the error banner wording differs across verdaccio lines (published ui-theme shows "Failed to change password", master surfaces the server message via `authErrorMessage`), so it now asserts a non-empty banner rather than an exact string, while still failing on the raw "Cannot PUT" 404 that means the `reset_password` route was not registered.

## 2.6.0

### Minor Changes

- 2e03661: Four new feature-gated test suites, born from the verdaccio/verdaccio#6210 bug batch (30 UI bugs, most of them invisible to the previous e2e coverage):

  - `detailTests` — version-pinned `/v/<version>` urls and the wire format of the UI's data requests (scoped names must stay literal `@scope/name`, never `%40`-encoded; pins the regression these suites caught in #6210). `versionNotFound` probe for the new 404-on-unknown-version behavior.
  - `failureModeTests` — a dead backend must not look like a healthy empty registry, and a 5xx on the detail page must render an error state instead of a blank page (strict assertions gated as probes until #6210 ships).
  - `i18nKeyTests` — raw-i18n-key detector: no page may render untranslated keys like `security.addUser.title`; catches the whole "namespace missing from the bundle" class.
  - `signupTests` — the create-user flow end to end, including the `PUT /-/verdaccio/sec/signup` wire contract (36-char `sessionId`); gated as a probe because every published ui-theme posts to a URL that only serves the SPA.

  New `errors.genericError` testid group, `signup` selector group, and feature flags `detail.*`, `failureModes.*`, `i18n.*`, `signup.*` (probes default `false`, everything else `true`). Validated green against published verdaccio@6 with defaults and against a #6210 build with all probes enabled.

## 2.5.0

### Minor Changes

- 536ab30: chore: trigger release

## 2.4.3

### Patch Changes

- 151c3a7: Add Web UI coverage for downloading authenticated private package tarballs from the home package list and package sidebar, covering verdaccio/verdaccio#5765.

## 2.4.2

### Patch Changes

- a439118: Remove the non-deterministic "no results" search test from `searchTests`.

  Verdaccio 7+ removed the `searchRemote` flag (verdaccio/verdaccio#5801), so the
  Web UI search now always queries configured uplinks. When the registry proxies
  to `registry.npmjs.org`, npm's `/-/v1/search` returns fuzzy/fallback matches for
  any non-empty text, so no query reliably yields an empty result and renders the
  autocomplete's "No results found" state. This made the empty-state assertion fail
  on `next-7`/`next-9` (it only ever passed on `6.x`, where search stayed local by
  default). The search flow stays covered by the remaining input/request/clear tests
  and the published-package result tests.

## 2.4.1

### Patch Changes

- a6947dd: fix: add summary

## 2.4.0

### Minor Changes

- cb74ddd: Add a Cypress suite for the Change Password page and a `cy.getByLabel` helper.
  - **`changePasswordTests(config)`**: new exported suite covering the `/-/web/change-password` flow. Drives the form via rendered label text (the page does not ship stable id/testid attributes), asserts client-side validation (submit disabled on empty form and on mismatched confirm), exercises the server error path (wrong old password → non-200 + generic error banner), and walks the happy path through to `/-/web/success`. An `after()` hook rotates the password back so the target registry is left in its original state for subsequent specs.
  - **`cy.getByLabel(text)`**: new custom command that resolves a form input via its `<label for>` attribute. Accepts a string (substring match) or RegExp. Used by the change-password suite and available to consumers whose pages lack stable input selectors.
  - **`features.changePassword`**: new feature-flag section (`happyPath`, `validation`, `wrongOldPassword`) so consumers on builds without the `flags.changePassword` server option, or with a non-English UI, can disable scenarios without forking the suite.
  - **`registerAllTests`** now includes `changePasswordTests`.

## 2.3.0

### Minor Changes

- 8395f2a: feat: add more ui tests

## 2.2.0

### Minor Changes

- 6b43c92: Add configurable test-id/selector overrides, new test suites, and a reusable publish task.
  - **New test suites**: `searchTests`, `settingsTests` (opens the settings dialog and switches language), `layoutTests` (header, footer, `/-/static/ui-options.js` health check).
  - **Configurable selectors**: every `data-testid` used by the suites lives in `TestIds` / `Selectors` and can be overridden per-section via `createRegistryConfig({ testIds, selectors })`. Exports `DEFAULT_TEST_IDS` and `DEFAULT_SELECTORS`.
  - **`publishPackage` task**: `cy.task('publishPackage', { pkgName, version, dependencies, unique })` publishes a throwaway package to the target registry so downstream specs have real data to assert on. Creates a throwaway user per call to obtain a legacy auth token, scaffolds a temp project with an `.npmrc`, spawns `npm publish --tag latest`. Pair with `cy.task('cleanupPublished', tempFolder)` in `after()`.
  - **Strongly typed tasks**: `cy.task('publishPackage', …)` and `cy.task('cleanupPublished', …)` are now typed via ambient `Cypress.Chainable` augmentation — unknown task names fail at compile time and return values are fully typed.
  - **`cy.login` selector overrides**: accepts an optional third argument `{ loginButton, usernameInput, passwordInput, submitButton }` so non-default Verdaccio builds can redirect the form interactions without forking the suite.
  - **`publishTests` re-enabled**: the previously dormant publish suite now runs end-to-end and asserts the readme container, markdown body, sidebar (install commands for npm/yarn/pnpm, keyword list), and the dependencies/versions/uplinks tabs. Uses `cy.session` to memoize login across the suite.
  - **README**: added with quick-start, suite table, configuration, publish task, and the minimum Verdaccio `config.yaml` requirements (`showSettings`, `userRateLimit`, publish ACL).

## 2.1.1

### Patch Changes

- f2fe5f8: fix: add build folder

## 2.1.0

### Minor Changes

- 2d37347: Add dual CJS/ESM output format for both packages. Build now produces `build/esm/` (ES modules) and `build/cjs/` (CommonJS) via Vite 8 with separate rollup output configs. Package exports map `import` to ESM and `require` to CJS.

## 2.0.0

### Major Changes

- cfc77c9: feat: first release
