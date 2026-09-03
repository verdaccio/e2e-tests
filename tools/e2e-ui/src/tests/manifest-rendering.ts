/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Manifest-shape rendering tests.
 *
 * npm does not validate these fields on publish: `repository`, `funding`
 * and `bugs` are all valid in string form, `funding` also as an array,
 * and contributors commonly ship without an email. Real packuments carry
 * all of these — the UI must render them instead of silently dropping
 * whole sections (the bug family fixed in verdaccio/verdaccio#6210,
 * where every probe here failed).
 *
 * Requires the `manifest` override support in the publishPackage task.
 */
export function manifestRenderingTests(config: RegistryConfig) {
  const { features } = config;
  const { package: pkg } = config.testIds;

  describe('manifest rendering', () => {
    const pkgName = '@verdaccio/manifest-fixture';
    let tempFolder: string | null = null;

    const publishWith = (manifest: Record<string, unknown>) =>
      cy
        .task('publishPackage', {
          pkgName,
          version: '1.0.0',
          unique: true,
          manifest,
        })
        .then((result) => {
          tempFolder = result?.tempFolder ?? null;
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

    maybeIt(features.manifestRendering.stringForms)(
      'string repository, funding array and string bugs must all render',
      () => {
        // NOTE: the npm CLI normalizes string `repository`/`bugs` into their
        // object forms on publish, so what reaches the registry here is the
        // normalized shape with the git:// protocol kept. The RAW string
        // forms only arrive via uplink packuments and stay pinned by the
        // ui-components unit tests; this spec pins what survives publish:
        // the git:// -> https rewrite, the funding array and the bugs url.
        publishWith({
          repository: 'git://github.com/verdaccio/verdaccio.git',
          funding: [{ type: 'opencollective', url: 'https://opencollective.com/verdaccio' }],
          bugs: 'https://github.com/verdaccio/verdaccio/issues',
        });

        cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);
        cy.getByTestId(pkg.sidebar, { timeout: 10000 }).should('be.visible');

        // repository: rendered, rewritten to a browsable https url
        // (prefix match: normalization may or may not keep the .git suffix)
        cy.getByTestId(pkg.sidebar)
          .find('a[href^="https://github.com/verdaccio/verdaccio"]')
          .should('be.visible');
        // funding (array form): the fund button links to the first entry
        cy.getByTestId(pkg.sidebar)
          .find('a[href="https://opencollective.com/verdaccio"]')
          .should('exist');
        // bugs (string form): open-an-issue action links to it
        cy.get('a[href="https://github.com/verdaccio/verdaccio/issues"]').should('exist');
      }
    );

    maybeIt(features.manifestRendering.gravatarAvatars)(
      'maintainer emails must render gravatar avatars on the sidebar',
      () => {
        publishWith({
          contributors: [{ name: 'Ava Tester', email: 'ava@example.com' }],
        });

        cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);
        cy.getByTestId(pkg.sidebar, { timeout: 10000 }).should('be.visible');

        // the sidebar endpoint computes the gravatar url server-side;
        // the avatar <img> must actually carry it
        cy.getByTestId(pkg.sidebar)
          .find('img[src*="gravatar.com/avatar"]')
          .should('have.length.at.least', 1);
      }
    );

    maybeIt(features.manifestRendering.developersWithoutEmail)(
      'contributors without email must not collapse into one',
      () => {
        publishWith({
          contributors: [{ name: 'alice-noemail' }, { name: 'bob-noemail' }],
        });

        cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);
        cy.getByTestId(pkg.sidebar, { timeout: 10000 }).should('be.visible');

        // each Person renders data-testid=<name>; both must survive dedupe
        cy.getByTestId('alice-noemail').should('exist');
        cy.getByTestId('bob-noemail').should('exist');
      }
    );
  });
}
