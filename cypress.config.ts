import { defineConfig } from 'cypress';
import { setupVerdaccioTasks } from './tools/e2e-ui/build/index.js';

const registryUrl = process.env.VERDACCIO_URL || 'http://localhost:4873';

export default defineConfig({
  e2e: {
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    setupNodeEvents(on) {
      setupVerdaccioTasks(on, { registryUrl });
    },
  },
  video: false,
  screenshotOnRunFailure: false,
});
