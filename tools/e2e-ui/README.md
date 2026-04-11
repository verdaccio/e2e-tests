# @verdaccio/e2e-ui

Reusable Cypress test suites for the Verdaccio web UI. Targets Verdaccio.

## Install

```bash
pnpm add -D @verdaccio/e2e-ui cypress
```

## Wire up

`cypress.config.ts`:

```ts
import { defineConfig } from 'cypress';
import { setupVerdaccioTasks } from '@verdaccio/e2e-ui';

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
  env: { VERDACCIO_URL: registryUrl },
});
```

`cypress/support/e2e.ts`:

```ts
import '@verdaccio/e2e-ui/commands';
```

Spec file (one per suite, or use `registerAllTests`):

```ts
import { createRegistryConfig, homeTests } from '@verdaccio/e2e-ui';

const config = createRegistryConfig({
  registryUrl: Cypress.env('VERDACCIO_URL'),
});

homeTests(config);
```

## Available suites

| Export | Covers |
|---|---|
| `homeTests` | Empty-registry landing page, help card, 404 |
| `signinTests` | Login dialog, greeting, logout |
| `layoutTests` | `/-/static/ui-options.js` health, header chrome, footer |
| `searchTests` | Search input, query fires, empty state, clear |
| `settingsTests` | Settings dialog, language picker, language switch |
| `publishTests` | Publishes via `cy.task`, asserts readme / sidebar / tabs |

## Configuration

```ts
createRegistryConfig({
  registryUrl: 'http://localhost:4873',
  credentials: { user: 'test', password: 'test' },    // optional
  testIds: { header: { settingsTooltip: 'my-btn' } }, // optional per-field override
  selectors: { loginDialog: { submitButton: '#go' } },// optional per-field override
});
```

Every data-testid referenced by the suites is configurable. See
[`src/testIds.ts`](./src/testIds.ts) for the full `TestIds` + `Selectors`
shapes and defaults. Overrides are merged per section — unspecified fields
inherit from `DEFAULT_TEST_IDS` / `DEFAULT_SELECTORS`.

## `publishPackage` task

Publishes a throwaway package so downstream specs have something to assert on.

```ts
cy.task('publishPackage', {
  pkgName: '@verdaccio/pkg-scoped',
  version: '1.0.0',
  dependencies: { debug: '4.0.0' },
  unique: true, // appends -t<timestamp> so reruns don't collide on 403
}).then((result) => {
  // result: { pkgName, version, tempFolder, stdout, stderr, exitCode }
});

// in after():
cy.task('cleanupPublished', tempFolder);
```

Under the hood: creates a throwaway user via `PUT /-/user/...`, scaffolds a
temp project with an `.npmrc` carrying the legacy auth token, spawns
`npm publish --tag latest`.

## Verdaccio config requirements

```yaml
web:
  enable: true
  login: true
  showSettings: true  # required by settingsTests

userRateLimit:
  windowMs: 1000
  max: 10000          # default (1000 / 15min) is too tight for a full suite run

packages:
  '**':
    access: $all
    publish: $anonymous $authenticated
    unpublish: $anonymous $authenticated
    proxy: npmjs
```

Restart Verdaccio after changing these — it reads them at startup.

## Custom commands

- `cy.getByTestId(selector)` — shortcut for `cy.get('[data-testid=<selector>]')`
- `cy.login(user, password, selectors?)` — fills + submits the login dialog;
  pass `selectors` to override form field IDs for non-default builds

Task calls are strongly typed — `cy.task('publishPackage', …)` returns
`Chainable<PublishPackageResult>`, unknown task names fail at compile time.

## License

MIT
