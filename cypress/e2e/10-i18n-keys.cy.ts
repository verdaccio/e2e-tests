// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, i18nKeyTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';

// `noRawKeysSecurityPages` stays on its default (false): the whole
// `security.*` namespace is missing from every published ui-theme
// bundle (fixed in verdaccio/verdaccio#6210).
const config = createRegistryConfig({ registryUrl });

i18nKeyTests(config);
