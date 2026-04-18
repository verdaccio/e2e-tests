# @verdaccio/e2e-ui

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
