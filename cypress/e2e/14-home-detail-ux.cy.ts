// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, homeDetailUxTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';
// probes for the 9.x web UI; HOME_DETAIL_UX=true turns them all on
const enabled = String(Cypress.env('HOME_DETAIL_UX')) === 'true';
const config = createRegistryConfig({
  registryUrl,
  features: {
    homeDetailUx: {
      homeToolbar: enabled,
      detailTabInUrl: enabled,
      welcomeGuide: enabled,
      installBunAndNpmrc: enabled,
      copyFeedback: enabled,
      searchGrouping: enabled,
      versionLink: enabled,
      settingsPublishTab: enabled,
    },
  },
});

homeDetailUxTests(config);
