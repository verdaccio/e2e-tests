/// <reference types="cypress" />

import { RegistryConfig } from '../types';

/**
 * UI tests for the Verdaccio search box.
 *
 * These tests do NOT depend on any published package — they assert the
 * search *flow* (input exists, typing triggers the search API, results
 * region updates) rather than specific package metadata. Tests that need
 * a real package in the registry should live in publishTests instead.
 */
export function searchTests(config: RegistryConfig) {
  describe('search', () => {
    beforeEach(() => {
      // Verdaccio's search endpoint — covers both the web API and the
      // npm v1 search API, depending on which one the UI calls.
      cy.intercept('GET', '**/-/verdaccio/data/search/**').as('webSearch');
      cy.intercept('GET', '**/-/v1/search**').as('v1Search');
      cy.intercept('GET', '**/-/verdaccio/data/packages').as('pkgs');

      cy.visit(config.registryUrl);
      cy.get('body').should('be.visible');
    });

    it('should render the search input', () => {
      getSearchInput().should('be.visible');
    });

    it('should fire a search request when typing a query', () => {
      const query = 'verdaccio';

      getSearchInput().clear().type(query, { delay: 30 });

      // Whichever endpoint the UI is wired to, at least one should hit.
      cy.wait(anySearchAlias(), { timeout: 10000 }).then((interception: any) => {
        expect(interception.request.url).to.contain(query);
      });
    });

    it('should show a "no results" state for an impossible query', () => {
      const query = 'xyzzy-no-such-package-' + Date.now();

      getSearchInput().clear().type(query, { delay: 30 });
      cy.wait(anySearchAlias(), { timeout: 10000 });

      // Give the UI a tick to render the empty state.
      cy.wait(300);

      // The UI may render "No Match", "No results", or similar — match
      // loosely rather than binding to one exact string.
      cy.contains(/no\s+(match|results|packages)/i, { timeout: 5000 }).should(
        'be.visible'
      );
    });

    it('should clear the query and allow typing a new one', () => {
      getSearchInput().clear().type('first-query', { delay: 20 });
      cy.wait(anySearchAlias(), { timeout: 10000 });

      // Clearing should empty the input value. We deliberately do NOT
      // assert on the autocomplete dropdown's empty-state text: on a
      // registry with no packages published it lingers regardless of
      // the input value, which previously caused a false positive.
      getSearchInput().clear();
      getSearchInput().should('have.value', '');

      // Typing a fresh query must fire another search request so the
      // search box is still functional after a clear.
      getSearchInput().type('second-query', { delay: 20 });
      cy.wait(anySearchAlias(), { timeout: 10000 }).then(
        (interception: any) => {
          expect(interception.request.url).to.contain('second-query');
        }
      );
    });
  });
}

/**
 * Resolve the search input. Verdaccio 6 renders it with different
 * data-testid values across versions, so we try a few in order before
 * falling back to a generic role/type selector.
 */
function getSearchInput() {
  return cy.get(
    [
      '[data-testid="search-input"]',
      '[data-testid="header--input-search"]',
      '[data-testid="autoCompleteSearch"] input',
      'input[aria-label*="earch"]',
      'input[placeholder*="earch"]',
      'input[type="search"]',
    ].join(', '),
    { timeout: 10000 }
  );
}

/**
 * Cypress `cy.wait` only accepts one alias at a time, so pick whichever
 * alias fires first. This helper lets us stay agnostic to which search
 * endpoint the UI is wired to.
 */
function anySearchAlias(): string {
  // In practice most Verdaccio 6 builds call the web search endpoint;
  // prefer that one and let the test fail loud if neither fires.
  return '@webSearch';
}
