/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Find element by data-testid attribute
       */
      getByTestId(selector: string, ...args: any[]): Chainable<JQuery<HTMLElement>>;
      /**
       * Login to Verdaccio UI
       */
      login(user: string, password: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('getByTestId', (selector: string, ...args: any[]) => {
  return cy.get(`[data-testid=${selector}]`, ...args);
});

Cypress.Commands.add('login', (user: string, password: string) => {
  cy.getByTestId('header--button-login').click();
  cy.wait(300);
  cy.get('#login--dialog-username').type(user);
  cy.wait(200);
  cy.get('#login--dialog-password').type(password);
  cy.wait(500);
  cy.get('#login--dialog-button-submit').click();
});

export {};
