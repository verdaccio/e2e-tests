/// <reference types="cypress" />

import { RegistryConfig } from '../types';

/**
 * Tests for the persistent page chrome: the header (nav bar, logo,
 * search container, action buttons) and the footer (version marker).
 * Also asserts that the runtime UI configuration endpoint
 * `/-/static/ui-options.js` loads successfully — this endpoint emits
 * `window.__VERDACCIO_BASENAME_UI_OPTIONS`, which the ui-theme relies
 * on for feature flags like showFooter / showSearch / showSettings. If
 * it fails the whole SPA degrades to whatever defaults the provider
 * ships with, so it's worth a direct network-level check.
 */
export function layoutTests(config: RegistryConfig) {
  const { header, footer } = config.testIds;

  describe('layout: header, footer, ui-options', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/-/static/ui-options.js').as('uiOptions');
      cy.visit(config.registryUrl);
      cy.get('body').should('be.visible');
    });

    it('should load /-/static/ui-options.js with HTTP 200', () => {
      cy.wait('@uiOptions', { timeout: 10000 })
        .its('response.statusCode')
        .should('eq', 200);
    });

    it('should serve ui-options.js with a JavaScript content-type', () => {
      cy.wait('@uiOptions', { timeout: 10000 }).then((interception: any) => {
        const contentType =
          interception.response?.headers?.['content-type'] || '';
        // Verdaccio serves this as `application/javascript` (possibly
        // with a charset suffix). Match loosely so small header tweaks
        // don't break the test.
        expect(contentType).to.match(/javascript/i);
      });
    });

    it('should expose window.__VERDACCIO_BASENAME_UI_OPTIONS at runtime', () => {
      cy.wait('@uiOptions', { timeout: 10000 });
      // ui-options.js sets this global before the React app boots, so
      // by the time the body is visible it should already be populated.
      cy.window()
        .its('__VERDACCIO_BASENAME_UI_OPTIONS')
        .should('be.an', 'object');
    });

    describe('header', () => {
      it('should render the header container', () => {
        cy.getByTestId(header.container).should('be.visible');
        cy.getByTestId(header.innerNavBar).should('be.visible');
      });

      it('should render the logo', () => {
        // Either the default SVG logo or a user-provided custom one.
        cy.get(
          `[data-testid="${header.defaultLogo}"], [data-testid="${header.customLogo}"]`
        ).should('be.visible');
      });

      it('should render the search container', () => {
        cy.getByTestId(header.searchContainer).should('be.visible');
      });

      it('should render the header-right action cluster', () => {
        cy.getByTestId(header.right).should('be.visible');
      });

      it('should render the login button when logged out', () => {
        cy.getByTestId(header.loginButton).should('be.visible');
      });

      it('should render the settings and info buttons', () => {
        // Both depend on `showSettings` / `showInfo` being truthy in
        // the ui-options response. On the default config provider
        // they default to true so no explicit registry config is
        // required.
        cy.getByTestId(header.settingsTooltip).should('be.visible');
        cy.getByTestId(header.infoTooltip).should('be.visible');
      });
    });

    describe('footer', () => {
      it('should render the footer container', () => {
        cy.getByTestId(footer.container).scrollIntoView().should('be.visible');
      });

      it('should render the version marker with the powered-by label', () => {
        // <PoweredBy> only renders when `configOptions.version` is
        // truthy, which Verdaccio sets automatically from its
        // package.json at startup.
        cy.getByTestId(footer.version)
          .scrollIntoView()
          .should('be.visible')
          .invoke('text')
          .should('have.length.greaterThan', 0);
      });

      it('should render a logo next to the version marker', () => {
        // The footer uses the default SVG logo as the link to
        // verdaccio.org.
        cy.getByTestId(footer.container)
          .find(
            `[data-testid="${header.defaultLogo}"], [data-testid="${header.customLogo}"]`
          )
          .should('exist');
      });
    });
  });
}
