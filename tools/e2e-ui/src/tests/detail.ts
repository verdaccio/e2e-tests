/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Package detail page tests: version-pinned URLs and the wire format of
 * the UI's data requests.
 *
 * The wire format is an observable contract, not an implementation
 * detail: proxies, intercepts and every npm client expect scoped names
 * as literal `/@scope/name`. A ui-components refactor that
 * percent-encoded the `@` broke exactly these suites
 * (verdaccio/verdaccio#6210), which is why it is pinned here on purpose.
 */
export function detailTests(config: RegistryConfig) {
  const { features } = config;
  const { package: pkg, home } = config.testIds;

  describe('package detail', () => {
    describe('with a published package', () => {
      const pkgName = '@verdaccio/detail-fixture';
      let tempFolder: string | null = null;
      // `unique: true` uniquifies the VERSION (1.0.0-t<ts>), not the name
      let version = '1.0.0';

      beforeEach(() => {
        cy.task('publishPackage', {
          pkgName,
          version: '1.0.0',
          unique: true,
        }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
          version = result?.version ?? '1.0.0';
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

      maybeIt(features.detail.scopedWireFormat)(
        'should request sidebar and readme with the scope literal (@, not %40)',
        () => {
          // Literal-path intercepts: if the UI ever encodes `@` or `/`,
          // these never match and the waits below time out.
          cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}*`).as('sidebar');
          cy.intercept('GET', `/-/verdaccio/data/package/readme/${pkgName}*`).as('readme');

          cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);

          cy.wait('@sidebar', { timeout: 10000 }).then((interception: any) => {
            expect(interception.request.url).to.contain(`/sidebar/${pkgName}`);
            expect(interception.request.url).to.not.contain('%40');
          });
          cy.wait('@readme', { timeout: 10000 });
          cy.getByTestId(pkg.sidebar).should('be.visible');
        }
      );

      maybeIt(features.detail.versionPinned)(
        'should pin the requested version via the ?v= query on /v/<version> urls',
        () => {
          cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}*`).as('sidebar');

          cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}/v/${version}`);

          cy.wait('@sidebar', { timeout: 10000 }).then((interception: any) => {
            expect(interception.request.url).to.contain(`v=${version}`);
          });
          cy.getByTestId(pkg.sidebar).should('be.visible');
          cy.getByTestId(pkg.sidebar).contains(version);
        }
      );

      maybeIt(features.detail.versionNotFound)(
        'should render Not Found for a version that does not exist',
        () => {
          cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}*`).as('sidebar');

          cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}/v/9.9.9`);

          // The server answers 404 for unknown versions instead of
          // silently serving `latest` under the requested title.
          cy.wait('@sidebar', { timeout: 10000 }).then((interception: any) => {
            expect(interception.response?.statusCode).to.eq(404);
          });
          cy.getByTestId(home.notFound, { timeout: 10000 }).should('be.visible');
        }
      );
    });
  });
}
