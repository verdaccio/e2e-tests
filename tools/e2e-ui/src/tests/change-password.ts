/// <reference types="cypress" />

import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Tests for the Change Password page at /-/web/change-password.
 *
 * The page renders only when the server is started with
 * `flags.changePassword: true` (otherwise the React component
 * redirects to `/` on mount). Each test logs in first, navigates
 * directly to the page, and drives the form.
 *
 * Selector strategy: the ChangePassword form does not ship stable
 * `id`/testid attributes on its inputs, so the suite locates fields
 * via their rendered label text using `cy.getByLabel`. The English
 * labels come from `@verdaccio/ui-i18n` (`security.changePassword.*`
 * in `crowdin/ui.json`):
 *
 *   Username             → "Username"
 *   Old / Current        → "Current Password"
 *   New password         → "New Password"
 *   Confirm              → "Confirm New Password"
 *   Submit button        → "Change Password"
 *
 * Regexes below deliberately allow wording drift (e.g. the historical
 * "Old Password" variant).
 */
export function changePasswordTests(config: RegistryConfig) {
  const { header, login } = config.testIds;
  const { loginDialog } = config.selectors;
  const { features } = config;

  // The onSubmit catch block in ChangePassword.tsx sets a hardcoded
  // English string — if the upstream component ever localizes this,
  // this constant and the wrongOldPassword test will need updating.
  const GENERIC_FAILURE_TEXT = 'Failed to change password';

  describe('change password', () => {
    const CHANGE_PASSWORD_PATH = '/-/web/change-password';
    const { user, password } = config.credentials;

    /**
     * Tests mutate the user's password. We track the "current" value
     * across tests so the `after()` hook can restore the original,
     * leaving the registry in the same state other suites assume.
     */
    let currentPassword = password;

    beforeEach(() => {
      cy.visit(config.registryUrl);
      cy.login(user, currentPassword, {
        loginButton: header.loginButton,
        ...loginDialog,
      });
      // Wait for the login request to settle before navigating.
      cy.getByTestId(header.logInDialogIcon, { timeout: 5000 }).should('be.visible');
      cy.visit(`${config.registryUrl}${CHANGE_PASSWORD_PATH}`);
      // If the flag is off server-side, the component useEffect redirects
      // to `/`. Failing here means the registry is misconfigured — every
      // test below needs the form to be present.
      cy.contains(/Change Password/i, { timeout: 5000 }).should('be.visible');
    });

    after(() => {
      // Restore the original password so subsequent spec files
      // (and retries) can still log in with `config.credentials`.
      if (currentPassword === password) return;
      cy.visit(config.registryUrl);
      cy.login(user, currentPassword, {
        loginButton: header.loginButton,
        ...loginDialog,
      });
      cy.getByTestId(header.logInDialogIcon, { timeout: 5000 }).should('be.visible');
      cy.visit(`${config.registryUrl}${CHANGE_PASSWORD_PATH}`);
      cy.getByLabel(/Username/i).type(user);
      cy.getByLabel(/Current Password|Old Password/i).type(currentPassword);
      cy.getByLabel(/^New Password$/i).type(password);
      cy.getByLabel(/Confirm( New)? Password/i).type(password);
      cy.contains('button', /Change Password/i).click();
      currentPassword = password;
    });

    // ── Validation (client-side yup) ─────────────────────────────

    maybeIt(features.changePassword.validation)(
      'should disable the submit button while the form is empty',
      () => {
        cy.contains('button', /Change Password/i).should('be.disabled');
      }
    );

    maybeIt(features.changePassword.validation)(
      'should keep submit disabled when new and confirm passwords mismatch',
      () => {
        cy.getByLabel(/Username/i).type(user);
        cy.getByLabel(/Current Password|Old Password/i).type(currentPassword);
        cy.getByLabel(/^New Password$/i).type('newSecretPass123');
        cy.getByLabel(/Confirm( New)? Password/i).type('different-value');
        // yup schema rejects mismatch → isValid stays false → button disabled.
        cy.contains('button', /Change Password/i).should('be.disabled');
      }
    );

    // ── Server error path ────────────────────────────────────────

    maybeIt(features.changePassword.wrongOldPassword)(
      'should show an error banner when the old password is wrong',
      () => {
        cy.intercept('PUT', '/-/verdaccio/sec/reset_password').as('reset');
        cy.getByLabel(/Username/i).type(user);
        cy.getByLabel(/Current Password|Old Password/i).type('definitely-wrong-xyz');
        cy.getByLabel(/^New Password$/i).type('newSecretPass123');
        cy.getByLabel(/Confirm( New)? Password/i).type('newSecretPass123');
        cy.contains('button', /Change Password/i)
          .should('not.be.disabled')
          .click();
        // Server rejects (htpasswd → plain Error → handler returns 4xx).
        cy.wait('@reset').its('response.statusCode').should('not.eq', 200);
        // onSubmit's catch sets errors.root → rendered via LoginDialogFormError.
        cy.getByTestId(login.error, { timeout: 5000 })
          .should('be.visible')
          .and('contain.text', GENERIC_FAILURE_TEXT);
        // Still on the change-password page so the user can retry.
        cy.location('pathname').should('include', CHANGE_PASSWORD_PATH);
      }
    );

    // ── Happy path (mutates state; keeps `currentPassword` in sync) ─

    maybeIt(features.changePassword.happyPath)(
      'should change the password and navigate to the success page',
      () => {
        const newPassword = `${currentPassword}-rotated`;
        cy.intercept('PUT', '/-/verdaccio/sec/reset_password').as('reset');

        cy.getByLabel(/Username/i).type(user);
        cy.getByLabel(/Current Password|Old Password/i).type(currentPassword);
        cy.getByLabel(/^New Password$/i).type(newPassword);
        cy.getByLabel(/Confirm( New)? Password/i).type(newPassword);
        cy.contains('button', /Change Password/i)
          .should('not.be.disabled')
          .click();

        cy.wait('@reset').its('response.statusCode').should('eq', 200);
        // Post-submit the component navigates to Route.SUCCESS with a
        // messageType query param. Assert the pathname; the message text
        // is i18n-driven and out of scope for this selector layer.
        cy.location('pathname', { timeout: 5000 }).should('include', '/-/web/success');

        // Track the rotation so `after()` can restore it.
        currentPassword = newPassword;
      }
    );
  });
}
