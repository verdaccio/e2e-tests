/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Raw-i18n-key detector: no page may render untranslated keys like
 * `security.addUser.title` as visible text.
 *
 * This pins the whole "namespace missing from the shipped bundle" class
 * (the `security.*` namespace was absent from every published ui-theme
 * until verdaccio/verdaccio#6210): a missing key makes i18next return
 * the key itself, which this scan catches regardless of which key
 * regressed.
 */

/**
 * Namespaces of the ui-theme translation file. Restricting the scan to
 * known prefixes keeps false positives out (package names like
 * `lodash.merge` or readme prose with dots must not trip it).
 */
const I18N_NAMESPACES = [
  'security',
  'dialog',
  'header',
  'sidebar',
  'package',
  'versions',
  'search',
  'form',
  'form-placeholder',
  'form-validation',
  'button',
  'error',
  'uplinks',
  'dependencies',
  'autoComplete',
  'footer',
  'stage',
  'help',
].join('|');

const RAW_KEY_PATTERN = new RegExp(`(?:^|[\\s>])(?:${I18N_NAMESPACES})\\.[a-zA-Z][a-zA-Z.-]+`);

function assertNoRawI18nKeys(context: string) {
  cy.get('body')
    .invoke('text')
    .then((text: string) => {
      const match = text.match(RAW_KEY_PATTERN);
      expect(match, `raw i18n key rendered on ${context}: ${match?.[0] ?? ''}`).to.be.null;
    });
}

export function i18nKeyTests(config: RegistryConfig) {
  const { features } = config;
  const { header } = config.testIds;

  describe('i18n keys', () => {
    maybeIt(features.i18n.noRawKeysCorePages)('home page must not render raw i18n keys', () => {
      cy.visit(config.registryUrl);
      cy.getByTestId(header.container).should('be.visible');
      assertNoRawI18nKeys('home');
    });

    maybeIt(features.i18n.noRawKeysSecurityPages)(
      'login dialog and security pages must not render raw i18n keys',
      () => {
        // login dialog
        cy.visit(config.registryUrl);
        cy.getByTestId(config.testIds.header.loginButton).click();
        cy.getByTestId(config.testIds.login.dialogContent).should('be.visible');
        assertNoRawI18nKeys('login dialog');

        // standalone security pages (render regardless of the `next`
        // param except /-/web/login, which needs a valid one to show
        // the form — the NotFound fallback is translated too, so the
        // scan still applies)
        for (const path of ['/-/web/login', '/-/web/add-user', '/-/web/change-password']) {
          cy.visit(`${config.registryUrl}${path}`, { failOnStatusCode: false });
          cy.get('body').should('be.visible');
          assertNoRawI18nKeys(path);
        }
      }
    );
  });
}
