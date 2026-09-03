import type { DeepPartial } from './testIds';

/**
 * Per-test feature flags for enabling/disabling individual test cases
 * in the e2e-ui suites.
 *
 * The Verdaccio UI behaves differently across branches — search result
 * payload shape differs between the `/-/v1/search` and
 * `/-/verdaccio/data/search/*` endpoints, the language picker was
 * added in a specific minor, etc. Rather than forking the suite per
 * branch, consumers can disable individual tests via
 * `createRegistryConfig({ features: { … } })`.
 *
 * Most flags default to `true` (test runs). Compatibility probes for
 * unreleased server behavior may default to `false`; enable them in
 * consumers that run against a Verdaccio build with the feature.
 * A disabled flag converts the test into a Mocha `it.skip` call — the
 * suite still reports the test but marks it as pending.
 */
export interface Features {
  search: {
    /**
     * Whether to run the "results dropdown renders a matching
     * package" test. Disable on builds where the search result shape
     * or the Autocomplete rendering differs from the default assumption.
     */
    resultsDropdown: boolean;
    /**
     * Whether to run the "clicking a result navigates to detail" test.
     * Depends on the Autocomplete `onSelectItem` → router wiring.
     */
    resultClickNavigation: boolean;
  };
  home: {
    /**
     * Whether to run the `with a published package` sub-block inside
     * `homeTests` (publishes a throwaway package and asserts it
     * renders in the package list).
     */
    publishedPackageRendering: boolean;
  };
  settings: {
    /**
     * Whether to run the "change language via card click" test.
     * Depends on the `LanguageSwitch` component layout and its
     * translation sentinels ("Translations", "German"). Skip on
     * builds that lag behind the upstream translation file.
     */
    languageSwitcher: boolean;
  };
  signin: {
    /**
     * Whether to run the three validation tests (disabled submit
     * button, invalid credentials error banner). Depends on the
     * current yup schema and the hard-coded "Invalid username or
     * password" error string.
     */
    validationTests: boolean;
  };
  layout: {
    /**
     * Whether to run the dark/light theme switch test. Depends on
     * `web.showThemeSwitch` (defaults to true in ui-theme) and the
     * `header--button--light` / `header--button--dark` testids.
     */
    themeSwitch: boolean;
  };
  publish: {
    /**
     * Whether to run the "tarball download button fires a GET" test.
     * Depends on `web.showDownloadTarball` (defaults to true) and
     * the published package manifest having a valid `dist.tarball`.
     */
    downloadTarball: boolean;
    /**
     * Whether to run the private package tarball download tests from
     * the Web UI package list and sidebar.
     *
     * Enable only on Verdaccio builds that accept Web UI bearer tokens
     * on protected npm package/tarball routes. Verdaccio 6.x currently
     * returns HTTP 401 for this flow; the regression is tracked in
     * verdaccio/verdaccio#5765.
     */
    privateDownloadTarball: boolean;
    /**
     * Whether to run the "raw viewer dialog opens + closes" test.
     * Depends on `web.showRaw` (defaults to true).
     */
    rawViewer: boolean;
  };
  detail: {
    /**
     * Whether to run the "visiting /v/<version> pins that version" test
     * (asserts the sidebar request carries `?v=<version>`).
     */
    versionPinned: boolean;
    /**
     * Whether to run the wire-format test for scoped packages: the UI
     * must request `/-/verdaccio/data/sidebar/@scope/name` with the `@`
     * and `/` literal (npm registry convention), never `%40`-encoded.
     * Pins the regression caught by these suites in
     * verdaccio/verdaccio#6210.
     */
    scopedWireFormat: boolean;
    /**
     * Whether to run the "nonexistent version renders Not Found" test.
     * Requires the server to answer 404 for unknown `?v=` values
     * (verdaccio/verdaccio#6210); released lines silently fall back to
     * `latest`, so this defaults to `false` as a probe.
     */
    versionNotFound: boolean;
  };
  failureModes: {
    /**
     * Whether to run the "backend 5xx on the package list must not
     * render the empty-registry onboarding" test. Holds on every line
     * (a 5xx carries an HTTP code the UI always treated as an error).
     */
    homeServerError: boolean;
    /**
     * Whether to run the network-failure variant (request never
     * reaches the server). Released UIs treat a network failure as an
     * empty registry and show the onboarding card
     * (verdaccio/verdaccio#6210 fixes it), so this defaults to `false`
     * as a probe.
     */
    homeNetworkError: boolean;
    /**
     * Whether to run the "5xx on the detail page renders an error
     * state instead of a blank page" test. Requires the generic error
     * page from verdaccio/verdaccio#6210; released UIs render blank,
     * so this defaults to `false` as a probe.
     */
    detailErrorState: boolean;
  };
  i18n: {
    /**
     * Whether to scan the home and detail pages for raw i18n keys
     * (visible text like `sidebar.detail.version`). Holds on every
     * released line — these pages ship fully translated.
     */
    noRawKeysCorePages: boolean;
    /**
     * Whether to scan the security pages (login dialog, /-/web/login,
     * add-user, change-password) for raw i18n keys. The whole
     * `security.*` namespace is missing from every published ui-theme
     * bundle (fixed in verdaccio/verdaccio#6210), so this defaults to
     * `false` as a probe.
     */
    noRawKeysSecurityPages: boolean;
  };
  signup: {
    /**
     * Whether to run the create-user happy path (fill the form on
     * /-/web/add-user, submit, land on the success page) and assert
     * the wire contract: `PUT /-/verdaccio/sec/signup` with a 36-char
     * `sessionId`. Requires the server flag `createUser: true` AND the
     * fixed signup form from verdaccio/verdaccio#6210 — every
     * published ui-theme posts to a URL that only serves the SPA, so
     * this defaults to `false` as a probe.
     */
    happyPath: boolean;
    /**
     * Whether to run the client-side validation tests on the add-user
     * form (invalid email shows a message, url-unsafe username blocks
     * submit). Same requirements as `happyPath`.
     */
    validation: boolean;
  };
  changePassword: {
    /**
     * Whether to run the happy-path test (submit valid change,
     * expect navigation to the success page, then restore the
     * original password in `after()`).
     *
     * The suite targets /-/web/change-password, which renders only
     * when the server is configured with `flags.changePassword: true`.
     * Disable on registries that do not enable the flag.
     *
     * Also disable on **published verdaccio 6.x** (all lines through
     * 6.5.0): the reset_password handler in
     * `verdaccio/build/api/web/api/user.js` ships with an inverted
     * conditional — `validatePassword(...) === false` gates the
     * `auth.changePassword(...)` call, so a *valid* new password
     * always returns HTTP 400 (`PASSWORD_VALIDATION`). The bug is
     * fixed on the development branch but has not been released
     * in any 6.x tag, so the happy path cannot succeed against an
     * `npm install verdaccio@6` runtime.
     */
    happyPath: boolean;
    /**
     * Whether to run the client-side validation tests (submit button
     * stays disabled while fields are empty / mismatched confirm).
     * Depends on the yup `changePasswordSchema`.
     */
    validation: boolean;
    /**
     * Whether to run the "wrong old password shows error banner" test.
     * Depends on the server rejecting the call and the onSubmit catch
     * block surfacing `"Failed to change password"` via
     * `LoginDialogFormError`.
     */
    wrongOldPassword: boolean;
  };
}

/** Defaults: all flags on. */
export const DEFAULT_FEATURES: Features = {
  search: {
    resultsDropdown: true,
    resultClickNavigation: true,
  },
  home: {
    publishedPackageRendering: true,
  },
  settings: {
    languageSwitcher: true,
  },
  signin: {
    validationTests: true,
  },
  layout: {
    themeSwitch: true,
  },
  publish: {
    downloadTarball: true,
    privateDownloadTarball: false,
    rawViewer: true,
  },
  detail: {
    versionPinned: true,
    scopedWireFormat: true,
    versionNotFound: false,
  },
  failureModes: {
    homeServerError: true,
    homeNetworkError: false,
    detailErrorState: false,
  },
  i18n: {
    noRawKeysCorePages: true,
    noRawKeysSecurityPages: false,
  },
  signup: {
    happyPath: false,
    validation: false,
  },
  changePassword: {
    happyPath: true,
    validation: true,
    wrongOldPassword: true,
  },
};

/**
 * Merge user overrides into the default feature flags. Per-section,
 * one level deep — matching the style of `mergeTestIds`.
 */
export function mergeFeatures(defaults: Features, overrides?: DeepPartial<Features>): Features {
  if (!overrides) return defaults;
  return {
    search: { ...defaults.search, ...overrides.search },
    home: { ...defaults.home, ...overrides.home },
    settings: { ...defaults.settings, ...overrides.settings },
    signin: { ...defaults.signin, ...overrides.signin },
    layout: { ...defaults.layout, ...overrides.layout },
    publish: { ...defaults.publish, ...overrides.publish },
    detail: { ...defaults.detail, ...overrides.detail },
    failureModes: { ...defaults.failureModes, ...overrides.failureModes },
    i18n: { ...defaults.i18n, ...overrides.i18n },
    signup: { ...defaults.signup, ...overrides.signup },
    changePassword: { ...defaults.changePassword, ...overrides.changePassword },
  };
}

/**
 * Helper that returns either `it` or `it.skip` depending on an
 * enabled flag. Usage:
 *
 *   maybeIt(features.search.resultsDropdown)('…', () => { … });
 */
export function maybeIt(enabled: boolean): Mocha.TestFunction | Mocha.PendingTestFunction {
  return enabled ? it : it.skip;
}
