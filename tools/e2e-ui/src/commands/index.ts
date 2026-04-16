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
       * Find a form input whose associated <label> text matches `text`.
       *
       * Used by suites that target pages without stable `id`/testid
       * selectors on their inputs (e.g. the ChangePassword form).
       * Resolves the label's `for` attribute and returns the input
       * it points to, so `.type(...)` / `.clear()` work directly.
       *
       * `text` may be a string (substring match) or a RegExp.
       */
      getByLabel(text: string | RegExp): Chainable<JQuery<HTMLElement>>;
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

Cypress.Commands.add('getByLabel', (text: string | RegExp) => {
  // Resolve the associated input via the label's `for` attribute, which
  // MUI TextField sets to the auto-generated input id. Scoping through
  // `contains()` returns the <label> element itself.
  return cy.contains('label', text).then(($label) => {
    const inputId = $label.attr('for');
    if (!inputId) {
      throw new Error(
        `getByLabel: matching label has no "for" attribute (text=${String(text)})`
      );
    }
    return cy.get(`#${inputId}`);
  });
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
