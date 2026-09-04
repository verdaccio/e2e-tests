/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Session lifecycle tests around the token stored in localStorage.
 *
 * A JWT that expired must never leave the UI half-logged-in: the header
 * greeting a user whose token the server treats as anonymous was the
 * "private packages vanish but I look logged in" bug fixed in
 * verdaccio/verdaccio#6210.
 */

/** Unsigned JWT-shaped token with the given exp (seconds since epoch). */
function fakeJwt(exp: number): string {
  const b64 = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=+$/, '');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ name: 'e2e-expired', exp })}.sig`;
}

export function sessionTests(config: RegistryConfig) {
  const { features } = config;
  const { header } = config.testIds;

  describe('session token lifecycle', () => {
    const visitWithExpiredToken = () => {
      const expired = fakeJwt(Math.floor(Date.now() / 1000) - 3600);
      cy.visit(config.registryUrl, {
        onBeforeLoad(win) {
          win.localStorage.setItem('username', 'e2e-expired');
          win.localStorage.setItem('token', expired);
        },
      });
      cy.getByTestId(header.container).should('be.visible');
    };

    maybeIt(features.session.expiredTokenLoggedOut)(
      'an expired stored token must boot the UI logged out',
      () => {
        visitWithExpiredToken();

        // login button visible, no greeting for the stale user
        cy.getByTestId(header.loginButton).should('be.visible');
        cy.getByTestId(header.logInDialogIcon).should('not.exist');
      }
    );

    maybeIt(features.session.expiredTokenPurged)(
      'an expired stored token must also be purged from localStorage',
      () => {
        visitWithExpiredToken();
        cy.getByTestId(header.loginButton).should('be.visible');

        // otherwise the api client keeps attaching the stale bearer and
        // the server quietly treats every request as anonymous
        cy.window().its('localStorage').invoke('getItem', 'token').should('be.null');
      }
    );
  });
}
