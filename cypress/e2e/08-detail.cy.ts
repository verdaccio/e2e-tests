// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, detailTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';

// `versionNotFound` stays on its default (false): released lines
// silently fall back to `latest` for unknown versions — the 404
// behavior ships with verdaccio/verdaccio#6210.
const config = createRegistryConfig({ registryUrl });

detailTests(config);
