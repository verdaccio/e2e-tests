import { defineConfig } from 'cypress';
// @ts-ignore — resolved at runtime after build
import { setupVerdaccioTasks } from './tools/e2e-ui/build/esm/index.js';

const registryUrl = process.env.VERDACCIO_URL || 'http://localhost:4873';

export default defineConfig({
  e2e: {
    baseUrl: registryUrl,
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    setupNodeEvents(on) {
      setupVerdaccioTasks(on, { registryUrl });
    },
  },
  env: {
    VERDACCIO_URL: registryUrl,
  },
  video: false,
  screenshotOnRunFailure: false,
});
