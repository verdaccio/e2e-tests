/// <reference types="cypress" />

import { RegistryConfig } from '../types';

export function publishTests(config: RegistryConfig) {
  describe('publish', () => {
    const pkgName = '@verdaccio/pkg-scoped';
    // Populated by the before() hook so after() can clean up. Using a
    // module-scoped variable is simpler than juggling Cypress aliases
    // across before/after boundaries.
    let tempFolder: string | null = null;

    /**
     * Log in once, reuse the session across every test in this suite.
     * Without `cy.session`, each test would POST /-/verdaccio/sec/login
     * and quickly trip Verdaccio's default userRateLimit (1000 req /
     * 15 min). `cy.session` caches cookies + localStorage keyed on the
     * first argument, so subsequent calls are no-ops.
     */
    const loginOnce = () => {
      cy.session(
        ['publish-suite', config.credentials.user],
        () => {
          cy.visit(config.registryUrl);
          cy.login(config.credentials.user, config.credentials.password);
          cy.wait('@sign');
        },
        {
          validate() {
            // A cheap sanity check — the data/packages endpoint is
            // accessible once you're authenticated and the web UI has
            // booted. If the session is stale this re-runs setup.
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

    before(() => {
      // Publish once per suite. `unique: true` appends a timestamp
      // suffix to the version so reruns against a persistent registry
      // don't collide on 403.
      cy.task('publishPackage', {
        pkgName,
        version: '1.0.0',
        dependencies: { debug: '4.0.0' },
        unique: true,
      }).then((result: any) => {
        tempFolder = result?.tempFolder ?? null;
      });
    });

    after(() => {
      if (tempFolder) {
        cy.task('cleanupPublished', tempFolder);
        tempFolder = null;
      }
    });

    beforeEach(() => {
      cy.intercept('POST', '/-/verdaccio/sec/login').as('sign');
      cy.intercept('GET', '/-/verdaccio/data/packages').as('pkgs');
      cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}`).as('sidebar');
      cy.intercept('GET', `/-/verdaccio/data/package/readme/${pkgName}`).as('readme');
      loginOnce();
      cy.visit(config.registryUrl);
    });

    it('should have one published package', () => {
      cy.wait('@pkgs');
      cy.getByTestId('package-title').should('have.length.at.least', 1);
    });

    it('should navigate to page detail', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId('package-title').first().click();
    });

    it('should have readme content', () => {
      cy.wait('@pkgs');
      cy.getByTestId('package-title').first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      // `readme` is the Box wrapping the markdown body — assert both
      // the container and the parsed markdown render.
      cy.getByTestId('readme').should('be.visible');
      cy.get('.markdown-body').should('have.length', 1);
      // publishPackage writes a README whose body contains "e2e testing".
      cy.contains('.markdown-body', /test/);
      // Verify the package name heading from our generated README is
      // actually rendered through the markdown pipeline.
      cy.contains('.markdown-body h1', pkgName).should('be.visible');
    });

    it('should render the sidebar with install commands for npm, yarn, pnpm', () => {
      cy.wait('@pkgs');
      cy.getByTestId('package-title').first().click();
      cy.wait('@sidebar');
      cy.getByTestId('sidebar').should('be.visible');
      cy.getByTestId('installList').within(() => {
        cy.getByTestId('installListItem-npm').should('be.visible');
        cy.getByTestId('installListItem-yarn').should('be.visible');
        cy.getByTestId('installListItem-pnpm').should('be.visible');
      });
      // The npm install line must actually contain the package name.
      cy.getByTestId('installListItem-npm').should('contain.text', pkgName);
    });

    it('should render the sidebar keywords from the published manifest', () => {
      cy.wait('@pkgs');
      cy.getByTestId('package-title').first().click();
      cy.wait('@sidebar');
      // publishPackage writes `keywords: ['verdaccio', 'e2e', 'test']`
      // into the generated package.json.
      cy.getByTestId('keyword-list').should('be.visible');
      cy.getByTestId('keyword-list').should('contain.text', 'verdaccio');
      cy.getByTestId('keyword-list').should('contain.text', 'e2e');
      cy.getByTestId('keyword-list').should('contain.text', 'test');
    });

    it('should click on dependencies tab', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId('package-title').first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      cy.getByTestId('dependencies-tab').click();
      cy.wait(100);
      cy.getByTestId('dependencies').should('have.length', 1);
      // publishPackage pins `debug: 4.0.0` in the generated manifest.
      cy.getByTestId('debug')
        .children()
        .invoke('text')
        .should('match', /debug/);
    });

    it('should click on versions tab', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId('package-title').first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      cy.getByTestId('versions-tab').click();
      // With `unique: true` the version becomes `1.0.0-t<timestamp>`,
      // but "1.0.0" still appears as a substring — match loosely.
      cy.getByTestId('tag-latest')
        .children()
        .invoke('text')
        .should('match', /1\.0\.0/);
    });

    it('should click on uplinks tab', () => {
      cy.wait('@pkgs');
      cy.wait(300);
      cy.getByTestId('package-title').first().click();
      cy.wait('@readme');
      cy.wait('@sidebar');
      cy.getByTestId('uplinks-tab').click();
      cy.getByTestId('no-uplinks').should('be.visible');
    });
  });
}
