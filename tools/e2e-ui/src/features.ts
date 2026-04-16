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
 * Every flag defaults to `true` (test runs). Override to `false` to
 * convert the test into a Mocha `it.skip` call — the suite still
 * reports the test but marks it as pending.
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
     * Whether to run the "raw viewer dialog opens + closes" test.
     * Depends on `web.showRaw` (defaults to true).
     */
    rawViewer: boolean;
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
    rawViewer: true,
  },
  changePassword: {
    happyPath: true,
    validation: true,
    wrongOldPassword: true,
  },
};

import type { DeepPartial } from './testIds';

/**
 * Merge user overrides into the default feature flags. Per-section,
 * one level deep — matching the style of `mergeTestIds`.
 */
export function mergeFeatures(
  defaults: Features,
  overrides?: DeepPartial<Features>
): Features {
  if (!overrides) return defaults;
  return {
    search: { ...defaults.search, ...overrides.search },
    home: { ...defaults.home, ...overrides.home },
    settings: { ...defaults.settings, ...overrides.settings },
    signin: { ...defaults.signin, ...overrides.signin },
    layout: { ...defaults.layout, ...overrides.layout },
    publish: { ...defaults.publish, ...overrides.publish },
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
