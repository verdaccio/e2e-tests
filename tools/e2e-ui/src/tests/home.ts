/// <reference types="cypress" />

import { RegistryConfig } from '../types';

export function homeTests(config: RegistryConfig) {
  const { home, header, package: pkg } = config.testIds;
  const { features } = config;

  // Only register the `with a published package` nested describe when
  // the corresponding feature flag is on. Using a plain `if` is simpler
  // than wrapping `describe` itself in `describe.skip`, and it avoids
  // emitting a pending describe block in reports.
  const registerPublishedPackageBlock = features.home.publishedPackageRendering;

  describe('home', () => {
    beforeEach(() => {
      cy.intercept('GET', '/-/verdaccio/data/packages').as('pkgs');
      cy.visit(config.registryUrl);
      // Wait for the app to render
      cy.get('body').should('be.visible');
    });

    afterEach(() => {
      cy.wait(2000);
    });

    it('title should be correct', () => {
      cy.location('pathname').should('include', '/');
      cy.title().should('eq', config.title);
    });

    it('should fetch the package list from the API', () => {
      // The home page always fires /-/verdaccio/data/packages on mount;
      // verifying the endpoint is healthy is the cheapest way to catch
      // registry-side regressions before any DOM assertions.
      //
      // Accept both 200 (fresh fetch) and 304 (cache hit from a prior
      // spec run in the same session) — both indicate a healthy endpoint.
      // 304 responses have no body, so only assert array-shape on 200.
      cy.wait('@pkgs', { timeout: 10000 }).then((interception) => {
        const status = interception.response?.statusCode;
        expect(status).to.be.oneOf([200, 304]);
        if (status === 200) {
          expect(interception.response?.body).to.be.an('array');
        }
      });
    });

    it('should match title with no packages published', () => {
      cy.wait('@pkgs');
      cy.getByTestId(home.helpCard, { timeout: 10000 }).should('be.visible');
      cy.getByTestId(home.helpCard).contains('No Package Published Yet.');
    });

    it('should display instructions on help card', () => {
      cy.wait('@pkgs');
      cy.getByTestId(home.helpCard, { timeout: 10000 }).should('be.visible');
      cy.getByTestId(home.helpCard).contains(
        `npm adduser --registry ${config.registryUrl}`
      );
      cy.getByTestId(home.helpCard).contains(
        `npm publish --registry ${config.registryUrl}`
      );
    });

    it('should render the header logo and login button', () => {
      cy.getByTestId(header.container).should('be.visible');
      cy.get(
        `[data-testid="${header.defaultLogo}"], [data-testid="${header.customLogo}"]`
      ).should('be.visible');
      cy.getByTestId(header.loginButton).should('be.visible');
    });

    it('should navigate back to home when clicking the header logo', () => {
      // Land on the 404 page, then click the logo — URL should reset.
      cy.visit(`${config.registryUrl}/-/web/detail/@verdaccio/not-found`);
      cy.getByTestId(home.notFound, { timeout: 10000 }).should('be.visible');
      cy.get(
        `[data-testid="${header.defaultLogo}"], [data-testid="${header.customLogo}"]`
      )
        .first()
        .click();
      cy.location('pathname').should('eq', '/');
      cy.getByTestId(home.helpCard).should('be.visible');
    });

    it('should go to 404 page', () => {
      cy.visit(`${config.registryUrl}/-/web/detail/@verdaccio/not-found`);
      cy.getByTestId(home.notFound, { timeout: 10000 }).should('be.visible');
      cy.getByTestId(home.notFound).contains("Sorry, we couldn't find it.");
    });

    // ── Rendering assertions that require real package data ─────────
    // Publishes a throwaway package before each test in this block so
    // we can verify the home page actually renders the list (not just
    // the empty state) and cleans up after each test so the outer
    // "empty registry" assertions above keep working in isolation.
    //
    // Gated on `features.home.publishedPackageRendering` so builds
    // where this shape doesn't apply can skip it without forking.
    (registerPublishedPackageBlock ? describe : describe.skip)('with a published package', () => {
      const pkgName = '@verdaccio/home-fixture';
      let tempFolder: string | null = null;

      beforeEach(() => {
        cy.task('publishPackage', {
          pkgName,
          version: '1.0.0',
          unique: true,
        }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
        });
        // Re-visit so the page picks up the just-published package.
        cy.visit(config.registryUrl);
      });

      afterEach(() => {
        cy.task('unpublishPackage', {
          pkgName,
          tempFolder: tempFolder ?? undefined,
        });
        if (tempFolder) {
          cy.task('cleanupPublished', tempFolder);
        }
        tempFolder = null;
      });

      it('should render the package list when a package exists', () => {
        cy.wait('@pkgs');
        cy.getByTestId(pkg.itemList).should('be.visible');
        cy.getByTestId(pkg.title).should('have.length.at.least', 1);
      });

      it('should show the published package name in the list', () => {
        cy.wait('@pkgs');
        cy.contains(`[data-testid="${pkg.title}"]`, pkgName).should(
          'be.visible'
        );
      });
    });
  });
}
