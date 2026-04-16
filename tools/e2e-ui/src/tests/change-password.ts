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
 * `id`/testid attributes on its inputs, but every field is registered
 * via react-hook-form's `register('<name>')`, which sets a stable
 * `name` attribute on the underlying `<input>`. The labels themselves
 * are `t('security.changePassword.*')` calls — when the i18n bundle
 * hasn't finished loading (or isn't loaded at all on this route), MUI
 * renders the literal i18n key as the label, so any selector that
 * matches on visible label text silently misses every field and the
 * form stays empty (which would also make the mismatch test "pass"
 * for the wrong reason: the submit button is disabled because the
 * form is empty, not because yup rejected the mismatch).
 *
 * The stable, i18n-independent contract from ChangePassword.tsx is:
 *   register('username')         → input[name="username"]
 *   register('oldPassword')      → input[name="oldPassword"]
 *   register('newPassword')      → input[name="newPassword"]
 *   register('confirmPassword')  → input[name="confirmPassword"]
 *   submit button                → form button[type="submit"]
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

    /**
     * Capability check. The ChangePassword page's `useEffect` redirects
     * to `/` whenever `configuration.flags.changePassword` is not truthy
     * — which is the case on any registry that either (a) didn't set
     * `flags.changePassword: true` in its config, or (b) runs a
     * verdaccio build whose middleware doesn't yet propagate the flag
     * into `__VERDACCIO_BASENAME_UI_OPTIONS` (older `verdaccio:6`
     * tagged images fall in this bucket).
     *
     * In either case the suite has nothing to exercise, so skip the
     * whole describe with a clear reason rather than burning five
     * seconds per test on cy.contains timeouts.
     */
    before(function () {
      cy.visit(config.registryUrl);
      cy.window().then((win) => {
        const opts = (win as any).__VERDACCIO_BASENAME_UI_OPTIONS;
        const enabled = !!opts?.flags?.changePassword;
        if (!enabled) {
          // eslint-disable-next-line no-console
          console.warn(
            '[change-password] server did not advertise flags.changePassword=true ' +
              '— skipping suite. ui-options.flags: ' +
              JSON.stringify(opts?.flags ?? {})
          );
          this.skip();
        }
      });
    });

    beforeEach(() => {
      // Intercept the login POST and wait on it explicitly instead of
      // leaning on a visual sentinel — mirrors the pattern used by
      // signinTests and avoids a race between cy.login's fire-and-forget
      // submit and the next cy.visit.
      cy.intercept('POST', '/-/verdaccio/sec/login').as('signChangePwd');
      cy.visit(config.registryUrl);
      cy.login(user, currentPassword, {
        loginButton: header.loginButton,
        ...loginDialog,
      });
      cy.wait('@signChangePwd').its('response.statusCode').should('eq', 200);

      cy.visit(CHANGE_PASSWORD_PATH);
      // If flags.changePassword is off server-side, the component's
      // useEffect redirects to `/` and this assertion times out — which
      // is the correct signal that the registry is misconfigured.
      // Use the stable `type="submit"` selector so the assertion is
      // independent of whether the i18n bundle has resolved by now.
      cy.get('form button[type="submit"]', { timeout: 5000 }).should('be.visible');
    });

    after(() => {
      // Restore the original password so subsequent spec files
      // (and retries) can still log in with `config.credentials`.
      if (currentPassword === password) return;
      cy.intercept('POST', '/-/verdaccio/sec/login').as('signChangePwdRestore');
      cy.visit(config.registryUrl);
      cy.login(user, currentPassword, {
        loginButton: header.loginButton,
        ...loginDialog,
      });
      cy.wait('@signChangePwdRestore').its('response.statusCode').should('eq', 200);
      cy.visit(CHANGE_PASSWORD_PATH);
      cy.get('input[name="username"]').type(user);
      cy.get('input[name="oldPassword"]').type(currentPassword);
      cy.get('input[name="newPassword"]').type(password);
      cy.get('input[name="confirmPassword"]').type(password);
      cy.get('form button[type="submit"]').click();
      currentPassword = password;
    });

    // ── Validation (client-side yup) ─────────────────────────────

    maybeIt(features.changePassword.validation)(
      'should disable the submit button while the form is empty',
      () => {
        cy.get('form button[type="submit"]').should('be.disabled');
      }
    );

    maybeIt(features.changePassword.validation)(
      'should keep submit disabled when new and confirm passwords mismatch',
      () => {
        cy.get('input[name="username"]').type(user);
        cy.get('input[name="oldPassword"]').type(currentPassword);
        cy.get('input[name="newPassword"]').type('newSecretPass123');
        cy.get('input[name="confirmPassword"]').type('different-value');
        // yup schema rejects mismatch → isValid stays false → button disabled.
        cy.get('form button[type="submit"]').should('be.disabled');
      }
    );

    // ── Server error path ────────────────────────────────────────

    maybeIt(features.changePassword.wrongOldPassword)(
      'should show an error banner when the old password is wrong',
      () => {
        cy.intercept('PUT', '/-/verdaccio/sec/reset_password').as('reset');
        cy.get('input[name="username"]').type(user);
        cy.get('input[name="oldPassword"]').type('definitely-wrong-xyz');
        cy.get('input[name="newPassword"]').type('newSecretPass123');
        cy.get('input[name="confirmPassword"]').type('newSecretPass123');
        cy.get('form button[type="submit"]')
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

        cy.get('input[name="username"]').type(user);
        cy.get('input[name="oldPassword"]').type(currentPassword);
        cy.get('input[name="newPassword"]').type(newPassword);
        cy.get('input[name="confirmPassword"]').type(newPassword);
        cy.get('form button[type="submit"]')
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
