/// <reference types="cypress" />

import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

export function signinTests(config: RegistryConfig) {
  const { header, login } = config.testIds;
  const { loginDialog } = config.selectors;
  const { features } = config;

  describe('sign in / sign out', () => {
    beforeEach(() => {
      cy.intercept('POST', '/-/verdaccio/sec/login').as('sign');
      cy.visit(config.registryUrl);
    });

    it('should login user', () => {
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

    // ── Validation tests ───────────────────────────────────────────
    // The login form uses a yup schema (username >= 2 chars + URL-safe,
    // password >= 2 chars) and the submit button is `disabled={!isValid}`.
    // Server rejection renders an error banner with `data-testid="error"`
    // inside `LoginDialogFormError`. Gated on
    // `features.signin.validationTests` so builds with a different
    // schema or error string can skip without forking.

    maybeIt(features.signin.validationTests)(
      'should disable the submit button while the form is empty',
      () => {
        cy.getByTestId(header.loginButton).click();
        cy.getByTestId(login.dialog).should('be.visible');
        // Neither field filled → schema invalid → button disabled.
        cy.get(loginDialog.submitButton).should('be.disabled');
      }
    );

    maybeIt(features.signin.validationTests)(
      'should keep the submit button disabled when only the username is filled',
      () => {
        cy.getByTestId(header.loginButton).click();
        cy.getByTestId(login.dialog).should('be.visible');
        cy.get(loginDialog.usernameInput).type(config.credentials.user);
        // Password still empty → schema still invalid.
        cy.get(loginDialog.submitButton).should('be.disabled');
      }
    );

    maybeIt(features.signin.validationTests)(
      'should show an error banner on invalid credentials',
      () => {
        cy.login(config.credentials.user, 'definitely-wrong-password-xyz', {
          loginButton: header.loginButton,
          ...loginDialog,
        });
        // The request goes through (valid schema), the server rejects it.
        cy.wait('@sign').its('response.statusCode').should('not.eq', 200);
        // The form sets errors.root which renders via LoginDialogFormError
        // with a fixed English string ("Invalid username or password").
        cy.getByTestId(login.error, { timeout: 5000 }).should('be.visible');
        cy.getByTestId(login.error).should(
          'contain.text',
          'Invalid username or password'
        );
        // Dialog should still be open so the user can retry.
        cy.getByTestId(login.dialog).should('be.visible');
      }
    );
  });
}
