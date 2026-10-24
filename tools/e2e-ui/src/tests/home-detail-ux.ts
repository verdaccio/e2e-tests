/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Home and package page UX that ships with the 9.x web UI: the package
 * list toolbar, the tab in the address, the welcome guide, the install
 * box (bun and `.npmrc`), copy feedback and search grouped by origin.
 *
 * Every test is a probe (flag defaults to `false`): released lines do
 * not have these features yet.
 */
export function homeDetailUxTests(config: RegistryConfig) {
  const { features } = config;
  const flags = features.homeDetailUx;
  const { header, home, package: pkg, search } = config.testIds;

  describe('home and detail ux', () => {
    describe('with an empty registry', () => {
      beforeEach(() => {
        cy.intercept('GET', '/-/verdaccio/data/packages').as('pkgs');
        cy.visit(config.registryUrl);
        cy.wait('@pkgs');
      });

      maybeIt(flags.welcomeGuide)(
        'should guide the first publish with a setup tab per package manager',
        () => {
          cy.getByTestId(home.helpCard, { timeout: 10000 }).should('be.visible');
          // the e2e contract of the old card still holds
          cy.getByTestId(home.helpCard).contains('No Package Published Yet.');
          cy.getByTestId(home.helpCard).contains(`npm adduser --registry ${config.registryUrl}`);
          cy.getByTestId(home.helpCard).contains(`npm publish --registry ${config.registryUrl}`);

          cy.getByTestId(`${home.helpSetupTabPrefix}npm`).should('be.visible');
          cy.getByTestId(home.helpCard).contains(`npm config set registry ${config.registryUrl}`);
          // quoted: getByTestId does not escape the dot in `.npmrc`
          cy.get(`[data-testid="${home.helpSetupTabPrefix}.npmrc"]`).click();
          cy.getByTestId(home.helpCard).contains(`registry=${config.registryUrl}`);
          cy.getByTestId(home.helpUplinksNote).should('be.visible');
        }
      );
    });

    describe('with packages from two scopes', () => {
      const scopedPkg = '@verdaccio/ux-toolbar-fixture';
      const unscopedPkg = 'ux-toolbar-unscoped-fixture';
      const tempFolders: string[] = [];

      before(() => {
        if (!flags.homeToolbar) return;
        [scopedPkg, unscopedPkg].forEach((pkgName) => {
          cy.task('publishPackage', { pkgName, version: '1.0.0', unique: true }).then((r) => {
            if (r?.tempFolder) tempFolders.push(r.tempFolder);
          });
        });
      });

      after(() => {
        if (!flags.homeToolbar) return;
        [scopedPkg, unscopedPkg].forEach((pkgName) => cy.task('unpublishPackage', pkgName));
        cy.then(() => tempFolders.forEach((folder) => cy.task('cleanupPublished', folder)));
      });

      beforeEach(() => {
        cy.intercept('GET', '/-/verdaccio/data/packages').as('pkgs');
      });

      maybeIt(flags.homeToolbar)('should filter the list and keep the filter in ?q=', () => {
        cy.visit(config.registryUrl);
        cy.wait('@pkgs');
        cy.getByTestId(home.packageListToolbar, { timeout: 10000 }).should('be.visible');
        cy.getByTestId(pkg.title).should('have.length', 2);

        cy.getByTestId(home.packageListFilter).type('unscoped', { delay: 20 });
        cy.getByTestId(pkg.title).should('have.length', 1).and('contain', unscopedPkg);
        cy.location('search').should('eq', '?q=unscoped');

        // a reload keeps the filter: it lives in the address
        cy.reload();
        cy.getByTestId(home.packageListFilter, { timeout: 10000 }).should('have.value', 'unscoped');
        cy.getByTestId(pkg.title).should('have.length', 1);
      });

      maybeIt(flags.homeToolbar)('should restore the scope from ?scope=', () => {
        cy.visit(`${config.registryUrl}/?scope=@verdaccio`);
        cy.wait('@pkgs');
        cy.getByTestId(home.packageListScope, { timeout: 10000 }).should(
          'have.value',
          '@verdaccio'
        );
        cy.getByTestId(pkg.title).should('have.length', 1).and('contain', scopedPkg);
      });

      maybeIt(flags.homeToolbar)(
        'should say nothing matches instead of showing the onboarding card',
        () => {
          cy.visit(`${config.registryUrl}/?q=no-package-matches-this`);
          cy.wait('@pkgs');
          cy.getByTestId(home.packageListNoMatch, { timeout: 10000 }).should('be.visible');
          cy.getByTestId(home.helpCard).should('not.exist');
        }
      );
    });

    describe('with a published package', () => {
      const pkgName = '@verdaccio/ux-detail-fixture';
      const detailUrl = `${config.registryUrl}/-/web/detail/${pkgName}`;
      const needsPackage =
        flags.detailTabInUrl ||
        flags.installBunAndNpmrc ||
        flags.copyFeedback ||
        flags.searchGrouping ||
        flags.versionLink ||
        flags.settingsPublishTab;
      let tempFolder: string | null = null;
      let version = '1.0.0';

      before(() => {
        if (!needsPackage) return;
        cy.task('publishPackage', {
          pkgName,
          version: '1.0.0',
          dependencies: { debug: '4.0.0' },
          unique: true,
        }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
          // `unique: true` makes the version 1.0.0-t<timestamp>
          version = result?.version ?? version;
        });
      });

      after(() => {
        if (!needsPackage) return;
        cy.task('unpublishPackage', { pkgName, tempFolder: tempFolder ?? undefined });
        cy.then(() => {
          if (tempFolder) cy.task('cleanupPublished', tempFolder);
        });
      });

      maybeIt(flags.settingsPublishTab)(
        'should keep the publishing guide in the settings once packages exist',
        () => {
          cy.visit(config.registryUrl);
          cy.getByTestId(pkg.itemList, { timeout: 10000 }).should('exist');
          cy.getByTestId(header.settingsTooltip).click();
          cy.getByTestId(header.settingsPublishTab).click();
          cy.getByTestId(header.settingsPublishPanel).within(() => {
            cy.getByTestId(home.helpGuide).should('be.visible');
            // the dialog scrolls; at the default viewport the command sits below the fold
            cy.contains(`npm publish --registry ${config.registryUrl}`)
              .scrollIntoView()
              .should('be.visible');
          });
        }
      );

      maybeIt(flags.versionLink)('should open the version page from the home list', () => {
        cy.visit(config.registryUrl);
        cy.contains(`[data-testid="${pkg.itemList}"]`, pkgName, { timeout: 10000 })
          .find(`[data-testid="${pkg.versionLink}"]`)
          .click();
        // scoped names keep the literal slash in the path
        cy.location('pathname').should('eq', `/-/web/detail/${pkgName}/v/${version}`);
        cy.getByTestId(pkg.sidebar, { timeout: 10000 }).contains(version);
      });

      maybeIt(flags.detailTabInUrl)('should keep the selected tab in ?tab=', () => {
        cy.visit(detailUrl);
        cy.getByTestId(pkg.versionsTab, { timeout: 10000 }).click();
        cy.location('search').should('contain', 'tab=versions');
        cy.getByTestId(pkg.tagLatest).should('be.visible');

        cy.getByTestId(pkg.readmeTab).click();
        cy.location('search').should('not.contain', 'tab=');
      });

      maybeIt(flags.detailTabInUrl)('should open the tab a link points to', () => {
        cy.visit(`${detailUrl}?tab=dependencies`);
        cy.getByTestId(pkg.dependenciesTab, { timeout: 10000 }).should(
          'have.attr',
          'aria-selected',
          'true'
        );
        cy.getByTestId(pkg.dependencies).contains('debug');
      });

      maybeIt(flags.installBunAndNpmrc)(
        'should offer bun and the scoped .npmrc line in the install box',
        () => {
          cy.visit(detailUrl);
          cy.getByTestId(pkg.installBun, { timeout: 10000 }).contains(`bun add ${pkgName}`);
          cy.getByTestId(pkg.installNpmrc).contains(`@verdaccio:registry=${config.registryUrl}`);
        }
      );

      maybeIt(flags.copyFeedback)('should confirm a copy on the copy button', () => {
        cy.visit(detailUrl);
        cy.getByTestId(pkg.installNpmrcCopy, { timeout: 10000 }).click();
        cy.getByTestId(pkg.installNpmrcCopy).should('have.attr', 'aria-label', 'Copied');
      });

      maybeIt(flags.searchGrouping)(
        'should list a package published here under its own search group',
        () => {
          cy.intercept('GET', '**/-/verdaccio/data/search/**').as('webSearch');
          cy.visit(config.registryUrl);
          cy.get('input[placeholder*="earch"]', { timeout: 10000 }).type('ux-detail-fixture', {
            delay: 30,
          });
          cy.wait('@webSearch', { timeout: 10000 });
          cy.get('[role="listbox"]', { timeout: 5000 }).within(() => {
            cy.getByTestId(`${search.groupPrefix}private`).should('be.visible');
            cy.contains('[role="option"]', pkgName)
              .find(`[data-testid="${search.originPrefix}private"]`)
              .should('exist');
          });
        }
      );
    });
  });
}
