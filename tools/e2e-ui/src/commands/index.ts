/// <reference types="cypress" />

/**
 * Default login form selectors. Kept in sync with `DEFAULT_SELECTORS`
 * in ../testIds.ts — duplicating them here (as plain constants) lets
 * `cy.login` call sites that don't pass an explicit selectors object
 * still work without importing anything.
 */
const DEFAULT_LOGIN_SELECTORS = {
  loginButton: 'header--button-login',
  usernameInput: '#login--dialog-username',
  passwordInput: '#login--dialog-password',
  submitButton: '#login--dialog-button-submit',
};

export interface LoginSelectors {
  /** data-testid of the header "Login" button that opens the dialog. */
  loginButton?: string;
  /** CSS selector for the username input. */
  usernameInput?: string;
  /** CSS selector for the password input. */
  passwordInput?: string;
  /** CSS selector for the submit button. */
  submitButton?: string;
}

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Find element by data-testid attribute.
       */
      getByTestId(selector: string, ...args: any[]): Chainable<JQuery<HTMLElement>>;
      /**
       * Login to Verdaccio UI. Selectors default to Verdaccio 6.x
       * conventions; pass `selectors` to override any subset for
       * non-default builds.
       */
      login(
        user: string,
        password: string,
        selectors?: LoginSelectors
      ): Chainable<void>;
    }
  }
}

Cypress.Commands.add('getByTestId', (selector: string, ...args: any[]) => {
  return cy.get(`[data-testid=${selector}]`, ...args);
});

Cypress.Commands.add(
  'login',
  (user: string, password: string, selectors: LoginSelectors = {}) => {
    const loginButton = selectors.loginButton ?? DEFAULT_LOGIN_SELECTORS.loginButton;
    const usernameInput =
      selectors.usernameInput ?? DEFAULT_LOGIN_SELECTORS.usernameInput;
    const passwordInput =
      selectors.passwordInput ?? DEFAULT_LOGIN_SELECTORS.passwordInput;
    const submitButton =
      selectors.submitButton ?? DEFAULT_LOGIN_SELECTORS.submitButton;

    cy.getByTestId(loginButton).click();
    cy.wait(300);
    cy.get(usernameInput).type(user);
    cy.wait(200);
    cy.get(passwordInput).type(password);
    cy.wait(500);
    cy.get(submitButton).click();
  }
);

export {};
