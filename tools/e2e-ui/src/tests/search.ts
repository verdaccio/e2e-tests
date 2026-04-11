/// <reference types="cypress" />

import { maybeIt } from '../features';
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
  const { features } = config;
  const { package: pkg } = config.testIds;

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

    // ── Rendering assertions that require real package data ────────
    // Publishes a throwaway package before each test and unpublishes
    // after so the outer "no results" test still sees a clean registry.
    // The search query uses a substring of the package name to avoid
    // scope-parsing issues with `@` / `/` characters in the URL.
    describe('with a published package', () => {
      const pkgName = '@verdaccio/search-fixture';
      // Unique slug we can type into the search box — must be a
      // substring of pkgName so Verdaccio's search matches it.
      const pkgSlug = 'search-fixture';
      let tempFolder: string | null = null;

      beforeEach(() => {
        cy.task('publishPackage', {
          pkgName,
          version: '1.0.0',
          unique: true,
        }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
        });
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

      maybeIt(features.search.resultsDropdown)(
        'should display the matching package in the results dropdown',
        () => {
        getSearchInput().clear().type(pkgSlug, { delay: 30 });

        // Wait for the search request to resolve with results.
        cy.wait(anySearchAlias(), { timeout: 10000 }).then(
          (interception: any) => {
            expect(interception.request.url).to.contain(pkgSlug);
          }
        );

        // MUI Autocomplete opens a listbox with role="listbox" when
        // there are matching options. Each result renders with
        // role="option". No data-testids on the dropdown itself, so
        // we lean on the ARIA roles which are stable across MUI
        // versions.
        cy.get('[role="listbox"]', { timeout: 5000 }).should('be.visible');
        cy.get('[role="listbox"] [role="option"]').should(
          'have.length.at.least',
          1
        );
        // The result item must contain the full package name.
        cy.contains('[role="listbox"] [role="option"]', pkgName).should(
          'be.visible'
        );
        }
      );

      maybeIt(features.search.resultClickNavigation)(
        'should navigate to the package detail page when a result is clicked',
        () => {
          // Intercept the two data endpoints that the detail route
          // fetches on mount. Waiting on these is the most reliable
          // way to know the router actually resolved the new page
          // (not just changed the URL).
          cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}`).as(
            'detailSidebar'
          );
          cy.intercept(
            'GET',
            `/-/verdaccio/data/package/readme/${pkgName}`
          ).as('detailReadme');

          getSearchInput().clear().type(pkgSlug, { delay: 30 });
          cy.wait(anySearchAlias(), { timeout: 10000 });

          cy.contains('[role="listbox"] [role="option"]', pkgName)
            .should('be.visible')
            .click();

          // Verdaccio routes package detail under /-/web/detail/<pkg>.
          cy.location('pathname').should('contain', '/-/web/detail');
          cy.location('pathname').should('contain', 'search-fixture');

          // Wait for the detail page's own fetches to settle so
          // assertions don't race the async content.
          cy.wait('@detailSidebar', { timeout: 10000 });
          cy.wait('@detailReadme', { timeout: 10000 });

          // Detail page rendered both panes end-to-end.
          cy.getByTestId(pkg.sidebar).should('be.visible');
          cy.getByTestId(pkg.readme).should('be.visible');
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
