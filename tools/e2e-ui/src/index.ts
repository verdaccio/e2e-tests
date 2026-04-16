import {
  cleanupPublished,
  publishPackage,
  PublishPackageResult,
  PublishPackageTaskInput,
  unpublishPackage,
  UnpublishPackageInput,
  UnpublishPackageResult,
} from './tasks';
import { DEFAULT_FEATURES, mergeFeatures } from './features';
import {
  DEFAULT_SELECTORS,
  DEFAULT_TEST_IDS,
  mergeSelectors,
  mergeTestIds,
} from './testIds';
import { RegistryConfig, RegistryTaskResult, VerdaccioUiOptions } from './types';

export type {
  RegistryConfig,
  RegistryTaskResult,
  VerdaccioUiOptions,
} from './types';
export type {
  PublishPackageInput,
  PublishPackageTaskInput,
  PublishPackageResult,
  UnpublishPackageInput,
  UnpublishPackageResult,
} from './tasks';
export type { DeepPartial, Selectors, TestIds } from './testIds';
export type { Features } from './features';
export { DEFAULT_SELECTORS, DEFAULT_TEST_IDS } from './testIds';
export { DEFAULT_FEATURES, maybeIt } from './features';
export { publishPackage, cleanupPublished, unpublishPackage } from './tasks';
export {
  homeTests,
  signinTests,
  publishTests,
  searchTests,
  settingsTests,
  layoutTests,
  changePasswordTests,
} from './tests';

/**
 * Build a full RegistryConfig from user-provided options with defaults.
 *
 * `testIds` and `selectors` are deep-merged per section with the
 * defaults in `./testIds`. Consumers targeting a non-default Verdaccio
 * build can override just the fields that drifted:
 *
 *   createRegistryConfig({
 *     registryUrl: 'http://localhost:4873',
 *     testIds: {
 *       header: { settingsTooltip: 'my-new-settings-btn' },
 *     },
 *   });
 */
export function createRegistryConfig(options: VerdaccioUiOptions): RegistryConfig {
  const url = new URL(options.registryUrl);
  return {
    registryUrl: options.registryUrl,
    port: options.port ?? (parseInt(url.port, 10) || 4873),
    credentials: options.credentials ?? { user: 'test', password: 'test' },
    title: options.title ?? 'Verdaccio',
    testIds: mergeTestIds(DEFAULT_TEST_IDS, options.testIds),
    selectors: mergeSelectors(DEFAULT_SELECTORS, options.selectors),
    features: mergeFeatures(DEFAULT_FEATURES, options.features),
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
    registry(): RegistryTaskResult {
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
      input: PublishPackageTaskInput
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
    /**
     * Unpublish a package from the registry so the next test starts
     * from a clean slate. Accepts either a package name or a full input
     * object (to reuse a prior tempFolder's token).
     *
     *   cy.task('unpublishPackage', '@verdaccio/pkg-scoped');
     *   cy.task('unpublishPackage', { pkgName, tempFolder });
     */
    async unpublishPackage(
      input: string | (Omit<UnpublishPackageInput, 'registryUrl'> & {
        registryUrl?: string;
      })
    ): Promise<UnpublishPackageResult> {
      const normalized =
        typeof input === 'string'
          ? { pkgName: input, registryUrl: config.registryUrl }
          : { ...input, registryUrl: input.registryUrl ?? config.registryUrl };
      return unpublishPackage(normalized);
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
  changePasswordTests(config);
}

// Re-export for convenience
import {
  homeTests,
  signinTests,
  publishTests,
  searchTests,
  settingsTests,
  layoutTests,
  changePasswordTests,
} from './tests';
