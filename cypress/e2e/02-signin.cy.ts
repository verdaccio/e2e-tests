// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, signinTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
const config = createRegistryConfig({ registryUrl });

signinTests(config);
