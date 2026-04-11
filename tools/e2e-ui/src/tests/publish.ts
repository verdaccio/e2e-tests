/// <reference types="cypress" />

import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

export function publishTests(config: RegistryConfig) {
  const { header, package: pkg } = config.testIds;
  const { markdownBody, loginDialog } = config.selectors;
  const { features } = config;

  describe('publish', () => {
    const pkgName = '@verdaccio/pkg-scoped';
    // Single source of truth for the dependency the publish fixture
    // writes into its package.json. The dependencies-tab assertion
    // reads these back to verify the UI rendered both fields.
    const depName = 'debug';
    const depVersion = '4.0.0';
    // Per-test state so afterEach can clean up the specific publish
    // that this test created (temp folder + registry entry).
    let tempFolder: string | null = null;

    /**
     * Log in once, reuse the session across every test in this suite.
     * `cy.session` caches cookies + localStorage keyed on the first
     * argument, so subsequent calls restore without hitting the network.
     */
    const loginOnce = () => {
      cy.session(
        ['publish-suite', config.credentials.user],
        () => {
          cy.visit(config.registryUrl);
          cy.login(config.credentials.user, config.credentials.password, {
            loginButton: header.loginButton,
            ...loginDialog,
          });
          cy.wait('@sign');
        },
        {
          validate() {
            cy.request({
              url: `${config.registryUrl}/-/verdaccio/data/packages`,
              failOnStatusCode: false,
            })
              .its('status')
              .should('be.oneOf', [200, 304]);
          },
          cacheAcrossSpecs: true,
        }
      );
    };

    beforeEach(() => {
      cy.intercept('POST', '/-/verdaccio/sec/login').as('sign');
      cy.intercept('GET', '/-/verdaccio/data/packages').as('pkgs');
      cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}`).as('sidebar');
      cy.intercept('GET', `/-/verdaccio/data/package/readme/${pkgName}`).as('readme');

      // Publish a fresh copy for this test. `unique: true` appends a
      // timestamp suffix so the version is distinct per test even when
      // the registry briefly has a stale copy from a prior afterEach.
      cy.task('publishPackage', {
        pkgName,
        version: '1.0.0',
        dependencies: { [depName]: depVersion },
        unique: true,
      }).then((result) => {
        tempFolder = result?.tempFolder ?? null;
      });

      loginOnce();
      cy.visit(config.registryUrl);
    });

    afterEach(() => {
      // Remove the package from the registry AND the local temp folder.
      // Run both regardless of test outcome so the next test starts
      // clean. `unpublishPackage` treats 404 as success, so a re-run
      // after a half-published state is still safe.
      cy.task('unpublishPackage', { pkgName, tempFolder: tempFolder ?? undefined });
      if (tempFolder) {
        cy.task('cleanupPublished', tempFolder);
      }
      tempFolder = null;
    });

    it('should have one published package', () => {
      cy.wait('@pkgs');
      cy.getByTestId(pkg.title).should('have.length.at.least', 1);
    });

    it('should navigate to page detail', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId(pkg.title).first().click();
    });

    it('should have readme content', () => {
      cy.wait('@pkgs');
      cy.getByTestId(pkg.title).first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      cy.getByTestId(pkg.readme).should('be.visible');
      cy.get(markdownBody).should('have.length', 1);
      // publishPackage writes a README whose body contains "e2e testing".
      cy.contains(markdownBody, /test/);
      cy.contains(`${markdownBody} h1`, pkgName).should('be.visible');
    });

    it('should render the sidebar with install commands for npm, yarn, pnpm', () => {
      cy.wait('@pkgs');
      cy.getByTestId(pkg.title).first().click();
      cy.wait('@sidebar');
      cy.getByTestId(pkg.sidebar).should('be.visible');
      cy.getByTestId(pkg.installList).within(() => {
        cy.getByTestId(pkg.installNpm).should('be.visible');
        cy.getByTestId(pkg.installYarn).should('be.visible');
        cy.getByTestId(pkg.installPnpm).should('be.visible');
      });
      cy.getByTestId(pkg.installNpm).should('contain.text', pkgName);
    });

    it('should render the sidebar keywords from the published manifest', () => {
      cy.wait('@pkgs');
      cy.getByTestId(pkg.title).first().click();
      cy.wait('@sidebar');
      // publishPackage writes `keywords: ['verdaccio', 'e2e', 'test']`
      // into the generated package.json.
      cy.getByTestId(pkg.keywordList).should('be.visible');
      cy.getByTestId(pkg.keywordList).should('contain.text', 'verdaccio');
      cy.getByTestId(pkg.keywordList).should('contain.text', 'e2e');
      cy.getByTestId(pkg.keywordList).should('contain.text', 'test');
    });

    it('should click on dependencies tab', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId(pkg.title).first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      cy.getByTestId(pkg.dependenciesTab).click();
      cy.wait(100);
      cy.getByTestId(pkg.dependencies).should('have.length', 1);

      // The dep Chip uses the dep name as its data-testid (dynamic
      // Verdaccio convention, see DependencyBlock.tsx:68), and its
      // label is `"${name}: ${version}"` via the `dependencies.
      // dependency-block` i18n key. Assert BOTH fields are rendered.
      cy.getByTestId(depName)
        .should('be.visible')
        .and('contain.text', depName)
        .and('contain.text', depVersion);

      // Also verify the Chip text matches the exact "name: version"
      // format so a regression in the label template would fail here
      // rather than pass via a loose substring match.
      cy.getByTestId(depName)
        .invoke('text')
        .should('match', new RegExp(`${depName}\\s*:\\s*${depVersion}`));
    });

    it('should click on versions tab', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId(pkg.title).first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      cy.getByTestId(pkg.versionsTab).click();
      // With `unique: true` the version becomes `1.0.0-t<timestamp>`,
      // but "1.0.0" still appears as a substring — match loosely.
      cy.getByTestId(pkg.tagLatest)
        .children()
        .invoke('text')
        .should('match', /1\.0\.0/);
    });

    it('should click on uplinks tab', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId(pkg.title).first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      cy.getByTestId(pkg.uplinksTab).click();
      cy.getByTestId(pkg.noUplinks).should('be.visible');
    });

    // ── Action-bar FABs: tarball download + raw viewer ─────────────
    // Both buttons live in the sidebar ActionBar. They're gated on
    // `web.showDownloadTarball` / `web.showRaw` (both default to true
    // in the ui-theme's AppConfigurationProvider) and each test is
    // also guarded by a feature flag so branches that ship a
    // different action bar can skip cleanly.

    maybeIt(features.publish.downloadTarball)(
      'should fetch the tarball when the download button is clicked',
      () => {
        // The download provider hits the package manifest's dist.tarball
        // URL directly. For our published fixture the filename looks
        // like `pkg-scoped-1.0.0-t<ts>.tgz`, served from
        // `/<pkg>/-/<filename>.tgz`. Intercept before clicking.
        cy.intercept('GET', '**/pkg-scoped-*.tgz').as('tarballFetch');

        cy.wait('@pkgs');
        cy.getByTestId(pkg.title).first().click();
        cy.wait('@sidebar');

        cy.getByTestId(pkg.downloadTarballBtn)
          .should('be.visible')
          .click();

        // The fetch should fire and return 200. We can't assert on the
        // actual file landing on disk — Cypress doesn't track OS-level
        // downloads — but a successful GET proves the end-to-end path
        // from click → download provider → registry.
        cy.wait('@tarballFetch', { timeout: 10000 })
          .its('response.statusCode')
          .should('eq', 200);
      }
    );

    maybeIt(features.publish.rawViewer)(
      'should open the raw manifest viewer when the raw button is clicked',
      () => {
        cy.wait('@pkgs');
        cy.getByTestId(pkg.title).first().click();
        cy.wait('@sidebar');

        // RawViewer is a full-screen MUI Dialog — initially unmounted
        // because `isOpen=false` keeps Dialog closed and Cypress won't
        // find it. Clicking the FAB flips `isOpen` to true.
        cy.getByTestId(pkg.rawBtn).should('be.visible').click();

        cy.getByTestId(pkg.rawViewerDialog, { timeout: 5000 }).should(
          'be.visible'
        );
        // The ReactJson viewer renders the package manifest — the
        // package name should appear somewhere in the serialized JSON.
        cy.getByTestId(pkg.rawViewerDialog).should('contain.text', pkgName);

        // Close via the X button and confirm the dialog goes away so
        // subsequent tests don't inherit an open overlay.
        cy.getByTestId(pkg.closeRawViewer).click();
        cy.getByTestId(pkg.rawViewerDialog).should('not.exist');
      }
    );
  });
}
