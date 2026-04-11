/// <reference types="cypress" />

import { RegistryConfig } from '../types';

export function signinTests(config: RegistryConfig) {
  const { header } = config.testIds;
  const { loginDialog } = config.selectors;

  describe('sign in / sign out', () => {
    beforeEach(() => {
      cy.intercept('POST', '/-/verdaccio/sec/login').as('sign');
    });

    it('should login user', () => {
      cy.visit(config.registryUrl);
      cy.login(config.credentials.user, config.credentials.password, {
        loginButton: header.loginButton,
        ...loginDialog,
      });
      cy.wait('@sign');
      cy.getByTestId(header.logInDialogIcon).click();
      cy.wait(100);
      cy.getByTestId(header.greetingsLabel).contains(config.credentials.user);
    });

    it('should logout a user', () => {
      cy.visit(config.registryUrl);
      cy.login(config.credentials.user, config.credentials.password, {
        loginButton: header.loginButton,
        ...loginDialog,
      });
      cy.wait('@sign');
      cy.getByTestId(header.logInDialogIcon).click();
      cy.wait(100);
      cy.getByTestId(header.logOutDialogIcon).click();
      cy.wait(200);
      cy.getByTestId(header.loginButton).contains('Login');
    });
  });
}
