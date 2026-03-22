import { createRegistryConfig, homeTests, signinTests } from '@verdaccio/e2e-ui';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
const config = createRegistryConfig({ registryUrl });

homeTests(config);
signinTests(config);
