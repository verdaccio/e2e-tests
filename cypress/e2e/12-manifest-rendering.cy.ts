// @ts-ignore — resolved at runtime after build
import { createRegistryConfig, manifestRenderingTests } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';

// All flags stay on their defaults (false): released UIs drop the string
// forms of repository/funding/bugs, never render sidebar gravatars
// (`_avatar` vs `avatar`) and collapse email-less contributors — the
// whole family ships fixed in verdaccio/verdaccio#6210.
const config = createRegistryConfig({ registryUrl });

manifestRenderingTests(config);
