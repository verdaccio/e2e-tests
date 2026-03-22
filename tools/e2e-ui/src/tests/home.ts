/// <reference types="cypress" />

import { RegistryConfig } from '../types';

export function homeTests(config: RegistryConfig) {
  describe('home', () => {
    beforeEach(() => {
      cy.visit(config.registryUrl);
    });

    it('title should be correct', () => {
      cy.location('pathname').should('include', '/');
      cy.title().should('eq', config.title);
    });

    it('should match title with no packages published', () => {
      cy.getByTestId('help-card').contains('No Package Published Yet.');
    });

    it('should display instructions on help card', () => {
      cy.getByTestId('help-card').contains(
        `npm adduser --registry ${config.registryUrl}`
      );
      cy.getByTestId('help-card').contains(
        `npm publish --registry ${config.registryUrl}`
      );
    });

    it('should go to 404 page', () => {
      cy.visit(`${config.registryUrl}/-/web/detail/@verdaccio/not-found`);
      cy.getByTestId('404').contains("Sorry, we couldn't find it.");
    });
  });
}
