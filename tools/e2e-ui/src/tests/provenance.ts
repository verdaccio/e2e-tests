/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * "Provenance" sidebar section (9.x, verdaccio/verdaccio#6447).
 *
 * registry.npmjs.org attaches `dist.signatures` and `dist.attestations` to
 * every version it signs; the UI shows them without verifying anything in
 * the browser. The fixtures below publish those fields themselves (npm keeps
 * extra `dist` fields on publish), so the suite runs offline and does not
 * need an uplink. The build details come from the registry only when it
 * announces the endpoint, so against this fixture the dialog ends at the
 * summary.
 */
export function provenanceTests(config: RegistryConfig) {
  const { features } = config;
  const { package: pkg } = config.testIds;

  const attestations = {
    url: 'https://registry.npmjs.org/-/npm/v1/attestations/e2e-provenance@1.0.0',
    provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
  };
  const signatures = [{ keyid: 'SHA256:e2e-fixture-key', sig: 'MEUCIQDe2e' }];

  describe('provenance', () => {
    describe('with provenance metadata', () => {
      const pkgName = '@verdaccio/provenance-fixture';
      let tempFolder: string | null = null;

      beforeEach(() => {
        cy.task('publishPackage', {
          pkgName,
          version: '1.0.0',
          unique: true,
          manifest: { dist: { signatures, attestations } },
        }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
        });
      });

      afterEach(() => {
        cy.task('unpublishPackage', { pkgName, tempFolder: tempFolder ?? undefined });
        if (tempFolder) {
          cy.task('cleanupPublished', tempFolder);
        }
        tempFolder = null;
      });

      maybeIt(features.provenance.sidebarSection)(
        'should show the provenance chip and open the dialog with the summary',
        () => {
          cy.intercept('GET', `/-/verdaccio/data/sidebar/${pkgName}*`).as('sidebar');
          cy.intercept('GET', `/-/verdaccio/data/package/provenance/${pkgName}*`).as('details');

          cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);
          cy.wait('@sidebar', { timeout: 10000 });

          // the sidebar scrolls on its own; bring the chip into its viewport first
          cy.getByTestId(pkg.provenanceBadge)
            .scrollIntoView()
            .should('be.visible')
            .and('contain.text', 'Provenance')
            .and('contain.text', 'SLSA v1');

          cy.getByTestId(pkg.provenanceBadge).click();
          cy.getByTestId(pkg.provenanceDialog).should('be.visible');
          cy.getByTestId(pkg.provenanceDialog).within(() => {
            cy.contains(`${pkgName}@`);
            cy.contains('SLSA v1');
            cy.contains(signatures[0].keyid);
            cy.contains('registry.npmjs.org/-/npm/v1/attestations/e2e-provenance@1.0.0').should(
              'have.attr',
              'href',
              attestations.url
            );
            cy.contains('cryptographic verification has not been performed');
          });

          // the build details are asked for only once the dialog is open; this
          // fixture has no uplink holding the bundle, so the registry answers 404
          // and the dialog keeps the summary
          cy.wait('@details', { timeout: 10000 }).then((interception: any) => {
            expect(interception.response?.statusCode).to.equal(404);
          });
          cy.getByTestId(pkg.provenanceDialog).should('not.contain.text', 'Built on');
        }
      );
    });

    describe('with a registry signature only', () => {
      const pkgName = '@verdaccio/signature-fixture';
      let tempFolder: string | null = null;

      beforeEach(() => {
        cy.task('publishPackage', {
          pkgName,
          version: '1.0.0',
          unique: true,
          manifest: { dist: { signatures } },
        }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
        });
      });

      afterEach(() => {
        cy.task('unpublishPackage', { pkgName, tempFolder: tempFolder ?? undefined });
        if (tempFolder) {
          cy.task('cleanupPublished', tempFolder);
        }
        tempFolder = null;
      });

      maybeIt(features.provenance.sidebarSection)(
        'should show the registry signature chip without requesting build details',
        () => {
          cy.intercept('GET', `/-/verdaccio/data/package/provenance/${pkgName}*`).as('details');

          cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);

          cy.getByTestId(pkg.provenanceBadge)
            .scrollIntoView()
            .should('be.visible')
            .and('contain.text', 'Registry signature');
          cy.getByTestId(pkg.provenanceBadge).click();
          cy.getByTestId(pkg.provenanceDialog).within(() => {
            cy.contains(signatures[0].keyid);
          });
          // no attestation, so the dialog never asks the registry for build details
          cy.get('@details.all').should('have.length', 0);
        }
      );
    });

    describe('without provenance metadata', () => {
      const pkgName = '@verdaccio/plain-fixture';
      let tempFolder: string | null = null;

      beforeEach(() => {
        cy.task('publishPackage', { pkgName, version: '1.0.0', unique: true }).then((result) => {
          tempFolder = result?.tempFolder ?? null;
        });
      });

      afterEach(() => {
        cy.task('unpublishPackage', { pkgName, tempFolder: tempFolder ?? undefined });
        if (tempFolder) {
          cy.task('cleanupPublished', tempFolder);
        }
        tempFolder = null;
      });

      maybeIt(features.provenance.sidebarSection)('should not render the section', () => {
        cy.visit(`${config.registryUrl}/-/web/detail/${pkgName}`);
        cy.getByTestId(pkg.sidebar).should('be.visible');
        cy.getByTestId(pkg.provenanceBadge).should('not.exist');
      });
    });
  });
}
