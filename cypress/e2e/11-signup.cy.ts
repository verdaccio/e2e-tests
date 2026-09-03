// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, signupTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';

// Both flags stay on their defaults (false): the signup form in every
// published ui-theme posts to a URL that only serves the SPA, so the
// flow cannot succeed until verdaccio/verdaccio#6210 ships. Enable in
// consumers running against a fixed build with `flags.createUser: true`.
const config = createRegistryConfig({ registryUrl });

signupTests(config);
