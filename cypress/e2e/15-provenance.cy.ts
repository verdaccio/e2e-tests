// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, provenanceTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
// probe for the 9.x "Provenance" sidebar section; PROVENANCE_UI=true turns it on
const enabled = String(Cypress.env('PROVENANCE_UI')) === 'true';
const config = createRegistryConfig({
  registryUrl,
  features: { provenance: { sidebarSection: enabled } },
});

provenanceTests(config);
