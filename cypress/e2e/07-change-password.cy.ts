// @ts-ignore — resolved at runtime after build
import { changePasswordTests, createRegistryConfig } from '../../tools/e2e-ui/build/esm/index.js';

const registryUrl = Cypress.env('VERDACCIO_URL') || 'http://localhost:4873';

// The happy-path test is skipped because every published verdaccio 6.x
// (through 6.5.0) ships an inverted conditional in
// `build/api/web/api/user.js` reset_password handler: a *valid* new
// password gates the error branch, so the call returns HTTP 400
// (`PASSWORD_VALIDATION`) instead of rotating the password. The bug
// is fixed on main but has not been released in any 6.x tag, and
// `scripts/run-e2e-ui.sh` always installs `verdaccio@6` from npmjs.
// Re-enable once a fixed 6.x is published (or when this spec runs
// against a non-6.x runtime).
const config = createRegistryConfig({
  registryUrl,
  features: { changePassword: { happyPath: false } },
});

changePasswordTests(config);
