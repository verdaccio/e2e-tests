/**
 * Configurable DOM selectors used by the e2e-ui test suites.
 *
 * The Verdaccio UI is a moving target — data-testids can and do change
 * between majors — so every selector referenced by a test lives here
 * and can be overridden by consumers of `@verdaccio/e2e-ui` via
 * `createRegistryConfig({ testIds, selectors })`.
 *
 * The defaults below match Verdaccio 6.x as of the last time we audited
 * the ui-components source. If a selector moves, override just the
 * affected field instead of forking the suite.
 */

/**
 * Map of data-testid values used by the test suites, grouped by UI
 * section. Each field holds the bare testid string (no `data-testid="…"`
 * wrapping) — the test helpers pass it through `cy.getByTestId(...)`.
 */
export interface TestIds {
  home: {
    /** Help card shown on the empty-registry landing page. */
    helpCard: string;
    /** 404 "not found" container. */
    notFound: string;
  };
  header: {
    /** Outermost `<NavBar>` element. */
    container: string;
    /** Inner wrapper inside the nav bar. */
    innerNavBar: string;
    /** Right-side action cluster wrapper. */
    right: string;
    /** Wrapper around the header search input. */
    searchContainer: string;
    /** Default SVG Verdaccio logo. */
    defaultLogo: string;
    /** Custom (user-provided) logo image. */
    customLogo: string;
    /** "Login" button shown when logged out. */
    loginButton: string;
    /** Gear icon that opens the settings dialog. */
    settingsTooltip: string;
    /** Info icon that opens the registry info dialog. */
    infoTooltip: string;
    /**
     * Theme switch button shown while in LIGHT mode (clicking it
     * flips to dark). The underlying component swaps between this
     * and `themeSwitchDark` based on `isDarkMode`.
     */
    themeSwitchLight: string;
    /** Theme switch button shown while in DARK mode. */
    themeSwitchDark: string;
    /** Menu icon shown after login (opens the logged-in menu). */
    logInDialogIcon: string;
    /** "Log out" entry inside the logged-in menu. */
    logOutDialogIcon: string;
    /** "Hi <username>" label inside the logged-in menu. */
    greetingsLabel: string;
  };
  footer: {
    /** Outer footer wrapper. */
    container: string;
    /** "Powered by" version text on the right side of the footer. */
    version: string;
  };
  login: {
    /** Login dialog container (the MUI Dialog root). */
    dialog: string;
    /** DialogContent wrapper inside the login dialog. */
    dialogContent: string;
    /**
     * Error banner shown inside the login dialog when the server
     * rejects credentials (or any other `errors.root` message the form
     * sets). Renders inside the `LoginDialogFormError` component.
     */
    error: string;
  };
  package: {
    /** Wrapper around the list of packages on the home page. */
    itemList: string;
    /** Package name link in the package list (home + search results). */
    title: string;
    /** Readme container on the package detail page. */
    readme: string;
    /** Sidebar container on the package detail page. */
    sidebar: string;
    /** Install commands section list. */
    installList: string;
    /** Individual install line for npm. */
    installNpm: string;
    /** Individual install line for yarn. */
    installYarn: string;
    /** Individual install line for pnpm. */
    installPnpm: string;
    /** Keyword list below the install section. */
    keywordList: string;
    /** Tab that reveals the dependencies view. */
    dependenciesTab: string;
    /** Dependencies list wrapper (one entry per dep). */
    dependencies: string;
    /** Tab that reveals the versions view. */
    versionsTab: string;
    /** "latest" tag row inside the versions view. */
    tagLatest: string;
    /** Tab that reveals the uplinks view. */
    uplinksTab: string;
    /** Empty-state message when the package has no uplinks. */
    noUplinks: string;
    /** Action-bar tarball download FAB. */
    downloadTarballBtn: string;
    /** Action-bar "view raw manifest" FAB. */
    rawBtn: string;
    /** Full-screen dialog that opens when `rawBtn` is clicked. */
    rawViewerDialog: string;
    /** Close button inside the raw viewer dialog. */
    closeRawViewer: string;
  };
}

/**
 * CSS selectors (not data-testids) used by the test suites. These are
 * things like form-field IDs and framework-specific class names that
 * Verdaccio's UI exposes as plain selectors rather than testids.
 */
export interface Selectors {
  /** Class applied to the parsed README markdown body. */
  markdownBody: string;
  loginDialog: {
    /** Username text input inside the login dialog. */
    usernameInput: string;
    /** Password text input inside the login dialog. */
    passwordInput: string;
    /** Submit button inside the login dialog. */
    submitButton: string;
  };
}

/**
 * Defaults matching Verdaccio 6.x (bundled ui-theme@9.0.0-next-9.x).
 * Overridable via `createRegistryConfig({ testIds: { ... } })`.
 */
export const DEFAULT_TEST_IDS: TestIds = {
  home: {
    helpCard: 'help-card',
    notFound: '404',
  },
  header: {
    container: 'header',
    innerNavBar: 'inner-nav-bar',
    right: 'header-right',
    searchContainer: 'search-container',
    defaultLogo: 'default-logo',
    customLogo: 'custom-logo',
    loginButton: 'header--button-login',
    settingsTooltip: 'header--tooltip-settings',
    infoTooltip: 'header--tooltip-info',
    themeSwitchLight: 'header--button--light',
    themeSwitchDark: 'header--button--dark',
    logInDialogIcon: 'logInDialogIcon',
    logOutDialogIcon: 'logOutDialogIcon',
    greetingsLabel: 'greetings-label',
  },
  footer: {
    container: 'footer',
    version: 'version-footer',
  },
  login: {
    dialog: 'login--dialog',
    dialogContent: 'dialogContentLogin',
    error: 'error',
  },
  package: {
    itemList: 'package-item-list',
    title: 'package-title',
    readme: 'readme',
    sidebar: 'sidebar',
    installList: 'installList',
    installNpm: 'installListItem-npm',
    installYarn: 'installListItem-yarn',
    installPnpm: 'installListItem-pnpm',
    keywordList: 'keyword-list',
    dependenciesTab: 'dependencies-tab',
    dependencies: 'dependencies',
    versionsTab: 'versions-tab',
    tagLatest: 'tag-latest',
    uplinksTab: 'uplinks-tab',
    noUplinks: 'no-uplinks',
    downloadTarballBtn: 'download-tarball-btn',
    rawBtn: 'raw-btn',
    rawViewerDialog: 'rawViewer--dialog',
    closeRawViewer: 'close-raw-viewer',
  },
};

/**
 * Defaults for non-testid CSS selectors. Overridable via
 * `createRegistryConfig({ selectors: { ... } })`.
 */
export const DEFAULT_SELECTORS: Selectors = {
  markdownBody: '.markdown-body',
  loginDialog: {
    usernameInput: '#login--dialog-username',
    passwordInput: '#login--dialog-password',
    submitButton: '#login--dialog-button-submit',
  },
};

/** Deep-partial helper — every field of a nested object becomes optional. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Merge user overrides into the default testIds map. Merging is
 * per-section (one level deep): `overrides.header` replaces individual
 * fields under `defaults.header` without touching `defaults.footer`.
 * The shape is fixed and small, so we enumerate sections by hand
 * rather than relying on a recursive generic merger.
 */
export function mergeTestIds(
  defaults: TestIds,
  overrides?: DeepPartial<TestIds>
): TestIds {
  if (!overrides) return defaults;
  return {
    home: { ...defaults.home, ...overrides.home },
    header: { ...defaults.header, ...overrides.header },
    footer: { ...defaults.footer, ...overrides.footer },
    login: { ...defaults.login, ...overrides.login },
    package: { ...defaults.package, ...overrides.package },
  };
}

/** Same idea as `mergeTestIds`, for the CSS-selector block. */
export function mergeSelectors(
  defaults: Selectors,
  overrides?: DeepPartial<Selectors>
): Selectors {
  if (!overrides) return defaults;
  return {
    markdownBody: overrides.markdownBody ?? defaults.markdownBody,
    loginDialog: { ...defaults.loginDialog, ...overrides.loginDialog },
  };
}
