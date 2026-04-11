/// <reference types="cypress" />

import { RegistryConfig } from '../types';

/**
 * Tests for the header Settings dialog and the Translations (language)
 * picker inside it.
 *
 * Requires `web.showSettings: true` in the registry config — the gear
 * icon only renders when the flag is on (see HeaderRight in Verdaccio's
 * ui-components package).
 *
 * Selector strategy: the language cards in LanguageSwitch do NOT have
 * data-testids, so this suite leans on:
 *   - MUI's ARIA roles: `[role="dialog"]`, `[role="tab"]`
 *   - The stable English labels "Configuration", "Translations",
 *     "English", "German", and the language description text, which are
 *     bundled into the ui-theme via `@verdaccio/ui-i18n`
 *   - The settings trigger's testid from Verdaccio's HeaderToolTipIcon:
 *     `header--tooltip-settings`
 */
export function settingsTests(config: RegistryConfig) {
  const { header } = config.testIds;

  describe('settings & language', () => {
    beforeEach(() => {
      cy.visit(config.registryUrl);
      cy.get('body').should('be.visible');
    });

    it('should open the settings dialog from the header', () => {
      cy.getByTestId(header.settingsTooltip).click();
      cy.get('[role="dialog"]').should('be.visible');
      // Dialog title key: dialog.settings.title → "Configuration" in EN.
      cy.contains('[role="dialog"]', 'Configuration').should('be.visible');
    });

    it('should show both Package Managers and Translations tabs', () => {
      cy.getByTestId(header.settingsTooltip).click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.get('[role="dialog"] [role="tab"]').should('have.length', 2);
      cy.contains('[role="dialog"] [role="tab"]', 'Translations').should(
        'be.visible'
      );
    });

    it('should switch to the Translations tab and list languages', () => {
      cy.getByTestId(header.settingsTooltip).click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('[role="dialog"] [role="tab"]', 'Translations').click();
      // language.description text is bundled in EN — good sentinel.
      cy.contains(
        '[role="dialog"]',
        /this is the configuration details for the language/i
      ).should('be.visible');
      // Sanity-check a couple of language cards are rendered.
      cy.contains('[role="dialog"]', 'English').should('be.visible');
      cy.contains('[role="dialog"]', 'German').should('be.visible');
    });

    it('should change the UI language when a language card is clicked', () => {
      cy.getByTestId(header.settingsTooltip).click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('[role="dialog"] [role="tab"]', 'Translations').click();

      // Before switching, capture the current dialog title so we can
      // assert it changes. This avoids hard-coding the German string.
      cy.contains('[role="dialog"]', 'Configuration')
        .invoke('text')
        .then((englishTitle) => {
          // Click the German card. We scope to the dialog + the MUI
          // card class to avoid matching other "German" text.
          cy.contains('[role="dialog"] .MuiCard-root', 'German').click({
            force: true,
          });

          // The English tab label "Translations" must no longer be
          // present anywhere in the dialog — strongest proof the
          // language actually switched.
          cy.contains('[role="dialog"] [role="tab"]', 'Translations').should(
            'not.exist'
          );
          // And the original dialog title text should also be gone.
          cy.contains('[role="dialog"]', englishTitle).should('not.exist');
        });
    });

    it('should close the settings dialog with Escape', () => {
      cy.getByTestId(header.settingsTooltip).click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.get('body').type('{esc}');
      cy.get('[role="dialog"]').should('not.exist');
    });
  });
}
