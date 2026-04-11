/// <reference types="cypress" />

import { RegistryConfig } from '../types';

export function publishTests(config: RegistryConfig) {
  const { header, package: pkg } = config.testIds;
  const { markdownBody, loginDialog } = config.selectors;

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

    before(() => {
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
      // The dep is rendered with its name as testid. This is a dynamic
      // Verdaccio convention (not configurable via testIds map).
      cy.getByTestId('debug').children().invoke('text').should('match', /debug/);
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
  });
}
