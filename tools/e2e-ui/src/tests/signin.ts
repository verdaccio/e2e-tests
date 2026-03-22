/// <reference types="cypress" />

import { RegistryConfig } from '../types';

export function signinTests(config: RegistryConfig) {
  describe('sign in / sign out', () => {
    beforeEach(() => {
      cy.intercept('POST', '/-/verdaccio/sec/login').as('sign');
    });

    it('should login user', () => {
      cy.visit(config.registryUrl);
      cy.login(config.credentials.user, config.credentials.password);
      cy.wait('@sign');
      cy.getByTestId('logInDialogIcon').click();
      cy.wait(100);
      cy.getByTestId('greetings-label').contains(config.credentials.user);
    });

    it('should logout a user', () => {
      cy.visit(config.registryUrl);
      cy.login(config.credentials.user, config.credentials.password);
      cy.wait('@sign');
      cy.getByTestId('logInDialogIcon').click();
      cy.wait(100);
      cy.getByTestId('logOutDialogIcon').click();
      cy.wait(200);
      cy.getByTestId('header--button-login').contains('Login');
    });
  });
}
