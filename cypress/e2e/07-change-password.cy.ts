// @ts-ignore — resolved at runtime after build
import { changePasswordTests, createRegistryConfig } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
const config = createRegistryConfig({ registryUrl });

changePasswordTests(config);
