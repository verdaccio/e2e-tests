import { RegistryConfig, VerdaccioUiOptions } from './types';

export type { RegistryConfig, VerdaccioUiOptions } from './types';
export { homeTests, signinTests, publishTests } from './tests';

/**
 * Build a full RegistryConfig from user-provided options with defaults.
 */
export function createRegistryConfig(options: VerdaccioUiOptions): RegistryConfig {
  const url = new URL(options.registryUrl);
  return {
    registryUrl: options.registryUrl,
    port: options.port ?? (parseInt(url.port, 10) || 4873),
    credentials: options.credentials ?? { user: 'test', password: 'test' },
    title: options.title ?? 'Verdaccio',
  };
}

/**
 * Register Verdaccio Cypress tasks in setupNodeEvents.
 *
 * Usage in cypress.config.ts:
 *   import { setupVerdaccioTasks } from '@verdaccio/e2e-ui';
 *
 *   export default defineConfig({
 *     e2e: {
 *       setupNodeEvents(on) {
 *         setupVerdaccioTasks(on, { registryUrl: 'http://localhost:4873' });
 *       },
 *     },
 *   });
 */
export function setupVerdaccioTasks(
  on: Cypress.PluginEvents,
  options: VerdaccioUiOptions
): void {
  const config = createRegistryConfig(options);

  on('task', {
    registry() {
      return {
        registryUrl: config.registryUrl,
        port: config.port,
      };
    },
  });
}

/**
 * Register all Verdaccio UI tests.
 *
 * Usage in a spec file:
 *   import { registerAllTests, createRegistryConfig } from '@verdaccio/e2e-ui';
 *
 *   const config = createRegistryConfig({ registryUrl: 'http://localhost:4873' });
 *   registerAllTests(config);
 *
 * Or pick individual suites:
 *   import { homeTests, signinTests } from '@verdaccio/e2e-ui';
 *
 *   const config = createRegistryConfig({ registryUrl: 'http://localhost:4873' });
 *   homeTests(config);
 *   signinTests(config);
 */
export function registerAllTests(config: RegistryConfig): void {
  homeTests(config);
  signinTests(config);
  publishTests(config);
}

// Re-export for convenience
import { homeTests, signinTests, publishTests } from './tests';
