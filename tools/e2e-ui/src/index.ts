import {
  cleanupPublished,
  publishPackage,
  PublishPackageInput,
  PublishPackageResult,
} from './tasks';
import { RegistryConfig, VerdaccioUiOptions } from './types';

export type { RegistryConfig, VerdaccioUiOptions } from './types';
export type { PublishPackageInput, PublishPackageResult } from './tasks';
export { publishPackage, cleanupPublished } from './tasks';
export {
  homeTests,
  signinTests,
  publishTests,
  searchTests,
  settingsTests,
  layoutTests,
} from './tests';

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
    /**
     * Publish a throwaway package to the registry.
     *
     * Usage from a Cypress spec:
     *
     *   cy.task('publishPackage', { pkgName: '@verdaccio/pkg-scoped' });
     *
     * Any field not provided falls back to the values configured here
     * (registryUrl, credentials). The task returns a PublishPackageResult.
     */
    async publishPackage(
      input: Partial<PublishPackageInput> & { pkgName: string }
    ): Promise<PublishPackageResult> {
      return publishPackage({
        registryUrl: input.registryUrl ?? config.registryUrl,
        credentials: input.credentials ?? config.credentials,
        pkgName: input.pkgName,
        version: input.version,
        dependencies: input.dependencies,
        devDependencies: input.devDependencies,
        unique: input.unique,
      });
    },
    /**
     * Remove a temp project folder returned by a previous publishPackage
     * call. Returns null (Cypress tasks must return something serializable).
     *
     *   cy.task('cleanupPublished', result.tempFolder);
     */
    async cleanupPublished(tempFolder: string): Promise<null> {
      await cleanupPublished(tempFolder);
      return null;
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
  layoutTests(config);
  searchTests(config);
  settingsTests(config);
  publishTests(config);
}

// Re-export for convenience
import {
  homeTests,
  signinTests,
  publishTests,
  searchTests,
  settingsTests,
  layoutTests,
} from './tests';
