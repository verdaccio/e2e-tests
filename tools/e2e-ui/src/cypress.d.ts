/// <reference types="cypress" />

// Ambient type augmentations for Verdaccio e2e-ui custom Cypress commands.
// The runtime implementations live in src/commands/index.ts and are
// registered via cypress/support/e2e.ts. This file exists purely so the
// TypeScript language server in test files can see `cy.getByTestId` and
// `cy.login` without having to import the commands module (which would
// drag runtime code into every test's module graph).

declare namespace Cypress {
  interface Chainable<Subject = any> {
    /**
     * Find element by data-testid attribute.
     */
    getByTestId(
      selector: string,
      ...args: any[]
    ): Chainable<JQuery<HTMLElement>>;

    /**
     * Log in to the Verdaccio UI via the login dialog.
     */
    login(user: string, password: string): Chainable<void>;
  }
}
