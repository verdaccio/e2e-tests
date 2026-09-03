// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, failureModeTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';

// `homeNetworkError` and `detailErrorState` stay on their defaults
// (false): released UIs show the empty-registry onboarding on network
// failure and a blank detail page on 5xx — the error states ship with
// verdaccio/verdaccio#6210.
const config = createRegistryConfig({ registryUrl });

failureModeTests(config);
