import { createRegistryConfig, homeTests } from '../../tools/e2e-ui/build/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
const config = createRegistryConfig({ registryUrl });

homeTests(config);
