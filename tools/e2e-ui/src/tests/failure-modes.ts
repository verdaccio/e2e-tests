/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Failure-mode tests: what the UI shows when the backend misbehaves.
 *
 * A registry that is down must never look like a healthy empty registry
 * (that invites the user to publish into the void), and a failed detail
 * request must render an error state instead of a blank page. These are
 * the failure classes fixed by verdaccio/verdaccio#6210 — the strict
 * assertions are feature-gated probes until that ships.
 */
export function failureModeTests(config: RegistryConfig) {
  const { features } = config;
  const { home, header, errors, package: pkg } = config.testIds;

  describe('failure modes', () => {
    maybeIt(features.failureModes.searchError)(
      'a search 5xx must show an error, not "no results found"',
      () => {
        cy.intercept('GET', '**/-/verdaccio/data/search/**', {
          statusCode: 500,
          body: { error: 'internal server error' },
        }).as('search');

        cy.visit(config.registryUrl);
        cy.getByTestId(header.searchContainer).find('input').type('anything', { delay: 20 });
        cy.wait('@search', { timeout: 10000 });

        // en-US bundle: autoComplete.error
        cy.contains('Something went wrong while searching', { timeout: 10000 }).should(
          'be.visible'
        );
        cy.contains('No results found').should('not.exist');
      }
    );

    maybeIt(features.failureModes.homeServerError)(
      'a 5xx on the package list must not render the empty-registry onboarding',
      () => {
        cy.intercept('GET', '/-/verdaccio/data/packages', {
          statusCode: 500,
          body: { error: 'internal server error' },
        }).as('pkgs');

        cy.visit(config.registryUrl);
        cy.wait('@pkgs', { timeout: 10000 });

        // The header must survive and the onboarding card must not
        // appear — a dead backend is not an empty registry.
        cy.getByTestId(header.container).should('be.visible');
        cy.getByTestId(home.helpCard).should('not.exist');
      }
    );

    maybeIt(features.failureModes.homeNetworkError)(
      'an unreachable backend must not render the empty-registry onboarding',
      () => {
        cy.intercept('GET', '/-/verdaccio/data/packages', { forceNetworkError: true }).as('pkgs');

        cy.visit(config.registryUrl);
        cy.wait('@pkgs', { timeout: 10000 });

        cy.getByTestId(header.container).should('be.visible');
        cy.getByTestId(home.helpCard).should('not.exist');
        cy.getByTestId(errors.genericError, { timeout: 10000 }).should('be.visible');
      }
    );

    describe('with a published package', () => {
      const pkgName = '@verdaccio/failure-fixture';
      let tempFolder: string | null = null;

      beforeEach(() => {
        cy.task('publishPackage', {
          pkgName,
          version: '1.0.0',
          unique: true,
        }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
        });
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

      maybeIt(features.failureModes.downloadError)(
        'a failed tarball download must show an error snackbar, not silence',
        () => {
          cy.intercept('GET', '**/*.tgz*', {
            statusCode: 500,
            body: 'boom',
          }).as('tarball');

          cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);
          cy.getByTestId(pkg.sidebar, { timeout: 10000 }).should('be.visible');
          cy.getByTestId(pkg.downloadTarballBtn).click();
          cy.wait('@tarball', { timeout: 10000 });

          // en-US bundle: error.download-tarball
          cy.contains('The tarball could not be downloaded', { timeout: 10000 }).should(
            'be.visible'
          );
        }
      );

      maybeIt(features.failureModes.detailErrorState)(
        'a 5xx on the detail data must render an error state, not a blank page',
        () => {
          cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}*`, {
            statusCode: 500,
            body: { error: 'internal server error' },
          }).as('sidebar');
          cy.intercept('GET', `/-/verdaccio/data/package/readme/${pkgName}*`, {
            statusCode: 500,
            body: { error: 'internal server error' },
          }).as('readme');

          cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);
          cy.wait('@sidebar', { timeout: 10000 });

          // Error page instead of a blank layout whose tabs crash the
          // whole app; the header must survive.
          cy.getByTestId(errors.genericError, { timeout: 10000 }).should('be.visible');
          cy.getByTestId(header.container).should('be.visible');
          cy.getByTestId(pkg.sidebar).should('not.exist');
        }
      );
    });
  });
}
