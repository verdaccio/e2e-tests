/// <reference types="cypress" />

import { RegistryConfig } from '../types';

export function homeTests(config: RegistryConfig) {
  const { home } = config.testIds;

  describe('home', () => {
    beforeEach(() => {
      cy.visit(config.registryUrl);
      // Wait for the app to render
      cy.get('body').should('be.visible');
    });

    afterEach(() => {
      cy.wait(2000);
    });

    it('title should be correct', () => {
      cy.location('pathname').should('include', '/');
      cy.title().should('eq', config.title);
    });

    it('should match title with no packages published', () => {
      cy.getByTestId(home.helpCard, { timeout: 10000 }).should('be.visible');
      cy.getByTestId(home.helpCard).contains('No Package Published Yet.');
    });

    it('should display instructions on help card', () => {
      cy.getByTestId(home.helpCard, { timeout: 10000 }).should('be.visible');
      cy.getByTestId(home.helpCard).contains(
        `npm adduser --registry ${config.registryUrl}`
      );
      cy.getByTestId(home.helpCard).contains(
        `npm publish --registry ${config.registryUrl}`
      );
    });

    it('should go to 404 page', () => {
      cy.visit(`${config.registryUrl}/-/web/detail/@verdaccio/not-found`);
      cy.getByTestId(home.notFound, { timeout: 10000 }).should('be.visible');
      cy.getByTestId(home.notFound).contains("Sorry, we couldn't find it.");
    });
  });
}
