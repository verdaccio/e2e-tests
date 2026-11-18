/// <reference types="cypress" />
import type { RegistryConfig } from '../types';

export function prefixedRoutingTests(config: RegistryConfig) {
  describe('routing under a prefix with an asynchronous middleware plugin', () => {
    const pkgName = '@verdaccio/routing-fixture';
    let registryUrl: string;
    let tempFolder: string | undefined;

    before(() => {
      cy.task<{ registryUrl: string; publishUrl: string }>('startRoutingRegistry').then(
        ({ registryUrl: url, publishUrl }) => {
          registryUrl = url.replace(/\/$/, '');
          cy.task('publishPackage', {
            registryUrl: publishUrl,
            pkgName,
            version: '1.0.0',
            unique: true,
          }).then((result) => {
            tempFolder = result.tempFolder;
          });
        }
      );
    });

    after(() => {
      if (tempFolder) cy.task('cleanupPublished', tempFolder);
      cy.task('stopRoutingRegistry');
    });

    it('renders the published package and its detail using the prefixed web API', () => {
      const { testIds } = config;
      const prefix = new URL(registryUrl).pathname;
      assert.notStrictEqual(prefix, '/', 'the fixture must mount Verdaccio under a prefix');
      cy.intercept('GET', `${registryUrl}/-/verdaccio/data/packages*`).as('routingPackages');
      cy.intercept('GET', `${registryUrl}/-/verdaccio/data/sidebar/**`).as('routingSidebar');
      cy.intercept('GET', `${registryUrl}/-/verdaccio/data/package/readme/**`).as('routingReadme');

      cy.visit(`${registryUrl}/`);
      cy.wait('@routingPackages').then(({ response }) => {
        assert.strictEqual(response?.statusCode, 200);
        assert.include(
          response?.body.map((pkg: { name: string }) => pkg.name),
          pkgName
        );
      });
      cy.contains(`[data-testid="${testIds.package.title}"]`, pkgName).should('be.visible').click();
      cy.location('pathname').should('eq', `${prefix}/-/web/detail/${pkgName}`);
      cy.wait('@routingSidebar').then(({ response }) => {
        assert.strictEqual(response?.statusCode, 200);
        assert.strictEqual(response?.body.latest.name, pkgName);
      });
      cy.wait('@routingReadme').then(({ response }) => {
        assert.strictEqual(response?.statusCode, 200);
        assert.isString(response?.body);
        assert.isNotEmpty(response?.body);
      });
      cy.request(`${registryUrl}/-/ping`).its('status').should('eq', 200);
    });
  });
}
