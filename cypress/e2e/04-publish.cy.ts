// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, publishTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
const privateDownloadTarball = String(Cypress.env('PRIVATE_TARBALL_DOWNLOAD')) === 'true';
const config = createRegistryConfig({
  registryUrl,
  features: {
    publish: {
      privateDownloadTarball,
    },
  },
});

publishTests(config);
