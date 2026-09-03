/// <reference types="cypress" />
import { maybeIt } from '../features';
import { RegistryConfig } from '../types';

/**
 * Create-user (web signup) tests.
 *
 * Requires the server flag `createUser: true` (the /-/web/add-user page
 * redirects home without it) and the fixed signup form from
 * verdaccio/verdaccio#6210 — every published ui-theme posted to
 * `PUT /-/web/add-user:<user>`, a URL that only serves the SPA, so the
 * form could never succeed. That is exactly why this suite exists: the
 * bug lived for months because no e2e ever clicked through the flow.
 */
export function signupTests(config: RegistryConfig) {
  const { features } = config;
  const { signup } = config.selectors;

  describe('signup (create user)', () => {
    beforeEach(() => {
      cy.visit(`${config.registryUrl}/-/web/add-user`);
      cy.get('body').should('be.visible');
    });

    maybeIt(features.signup.happyPath)(
      'should create a user through the real signup endpoint and land on success',
      () => {
        const username = `e2e-signup-${Date.now()}`;

        cy.intercept('PUT', '/-/verdaccio/sec/signup').as('signup');

        cy.get(signup.usernameInput).type(username);
        cy.get(signup.passwordInput).type('e2e-password');
        cy.get(signup.emailInput).type(`${username}@example.com`);
        cy.get(signup.submitButton).should('not.be.disabled').click();

        // Wire contract: the request must carry name/password/email and
        // the 36-char sessionId the endpoint validates before anything.
        cy.wait('@signup', { timeout: 10000 }).then((interception: any) => {
          const body = interception.request.body;
          expect(body.name).to.eq(username);
          expect(body.email).to.eq(`${username}@example.com`);
          expect(body.sessionId).to.be.a('string').with.length(36);
          expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
        });

        cy.location('pathname', { timeout: 10000 }).should('contain', '/-/web/success');
      }
    );

    maybeIt(features.signup.validation)(
      'an invalid email must show a visible message and keep submit disabled',
      () => {
        cy.get(signup.usernameInput).type('e2e-validation-user');
        cy.get(signup.passwordInput).type('e2e-password');
        cy.get(signup.emailInput).type('not-an-email');

        cy.get(signup.submitButton).should('be.disabled');
        // The reason must be visible, not a silently disabled button.
        cy.get(signup.emailInput)
          .closest('div.MuiFormControl-root')
          .find('.MuiFormHelperText-root')
          .should('be.visible')
          .and('not.be.empty');
      }
    );

    maybeIt(features.signup.validation)(
      'a username with spaces must block submit with a visible message',
      () => {
        cy.get(signup.usernameInput).type('user name');
        cy.get(signup.passwordInput).type('e2e-password');
        cy.get(signup.emailInput).type('valid@example.com');

        cy.get(signup.submitButton).should('be.disabled');
        cy.get(signup.usernameInput)
          .closest('div.MuiFormControl-root')
          .find('.MuiFormHelperText-root')
          .should('be.visible')
          .and('not.be.empty');
      }
    );
  });
}
