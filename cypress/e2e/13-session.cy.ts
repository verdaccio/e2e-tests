// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, sessionTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';

// `expiredTokenPurged` stays on its default (false): released UIs leave
// the expired token in localStorage (purge ships with
// verdaccio/verdaccio#6210); the logged-out boot assertion runs everywhere.
const config = createRegistryConfig({ registryUrl });

sessionTests(config);
