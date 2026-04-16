---
"@verdaccio/e2e-ui": minor
---

Add a Cypress suite for the Change Password page and a `cy.getByLabel` helper.

- **`changePasswordTests(config)`**: new exported suite covering the `/-/web/change-password` flow. Drives the form via rendered label text (the page does not ship stable id/testid attributes), asserts client-side validation (submit disabled on empty form and on mismatched confirm), exercises the server error path (wrong old password → non-200 + generic error banner), and walks the happy path through to `/-/web/success`. An `after()` hook rotates the password back so the target registry is left in its original state for subsequent specs.
- **`cy.getByLabel(text)`**: new custom command that resolves a form input via its `<label for>` attribute. Accepts a string (substring match) or RegExp. Used by the change-password suite and available to consumers whose pages lack stable input selectors.
- **`features.changePassword`**: new feature-flag section (`happyPath`, `validation`, `wrongOldPassword`) so consumers on builds without the `flags.changePassword` server option, or with a non-English UI, can disable scenarios without forking the suite.
- **`registerAllTests`** now includes `changePasswordTests`.
