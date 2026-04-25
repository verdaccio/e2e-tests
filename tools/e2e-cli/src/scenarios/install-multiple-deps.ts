import assert from 'assert';
import buildDebug from 'debug';

import { TestContext, TestDefinition } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:scenario:install-multiple-deps');

/**
 * Scenario: install-multiple-deps
 *
 * Publishes several packages to the registry (some scoped, some unscoped,
 * some with inter-dependencies), then creates a consumer project that
 * depends on all of them and runs `install`.
 *
 * This exercises the registry under realistic load:
 *   - many parallel tarball downloads
 *   - metadata resolution for multiple packages
 *   - scoped-package authentication
 *   - transitive dependency resolution
 */

const SEED_PACKAGES_COUNT = 5;

async function publishSeedPackage(
  ctx: TestContext,
  pkgName: string,
  version: string,
  dependencies: Record<string, string> = {}
): Promise<void> {
  debug('publishing seed package %s@%s', pkgName, version);
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    version,
    ctx.registryUrl,
    ctx.port,
    ctx.token,
    dependencies
  );

  if (ctx.adapter.type === 'yarn-modern') {
    await ctx.adapter.exec({ cwd: tempFolder }, 'install');
  }

  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('published %s@%s', pkgName, version);
}

async function testInstallMultipleDeps(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  // Shared project folder used as cwd for info commands across subtests.
  // Yarn modern requires a project context (package.json + .yarnrc.yml) for `yarn npm info`.
  let projectCwd = '';

  // --- Phase 1: Publish a tree of seed packages ---
  await ctx.subTest('publish seed packages', async () => {
    // Leaf packages (no dependencies of their own)
    for (let i = 1; i <= SEED_PACKAGES_COUNT; i++) {
      const name = `@verdaccio/seed-${id}-${i}`;
      await publishSeedPackage(ctx, name, '1.0.0');
    }

    // A "shared" package that multiple consumers will pull in
    const sharedPkg = `@verdaccio/seed-shared-${id}`;
    await publishSeedPackage(ctx, sharedPkg, '1.0.0');

    // An intermediate package that depends on some leaf packages + shared
    const intermediatePkg = `@verdaccio/seed-mid-${id}`;
    await publishSeedPackage(ctx, intermediatePkg, '1.0.0', {
      [`@verdaccio/seed-${id}-1`]: '1.0.0',
      [`@verdaccio/seed-${id}-2`]: '1.0.0',
      [sharedPkg]: '1.0.0',
    });

    debug('all seed packages published');
  });

  // --- Phase 2: Create a consumer project that depends on everything ---
  await ctx.subTest('install all dependencies in consumer project', async () => {
    const consumerDeps: Record<string, string> = {};

    // Direct deps on all leaf packages
    for (let i = 1; i <= SEED_PACKAGES_COUNT; i++) {
      consumerDeps[`@verdaccio/seed-${id}-${i}`] = '1.0.0';
    }

    // Also depend on the intermediate (pulls in transitive deps)
    consumerDeps[`@verdaccio/seed-mid-${id}`] = '1.0.0';

    // And the shared package directly (already a transitive dep of mid)
    consumerDeps[`@verdaccio/seed-shared-${id}`] = '1.0.0';

    const consumerName = `@verdaccio/consumer-${id}`;
    const { tempFolder } = await ctx.adapter.prepareProject(
      consumerName,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token,
      consumerDeps
    );

    projectCwd = tempFolder;

    debug('installing %d dependencies in consumer project', Object.keys(consumerDeps).length);

    const args = ['install', ...ctx.adapter.registryArg(ctx.registryUrl)];
    await ctx.adapter.exec({ cwd: tempFolder }, ...args);

    debug('install completed for consumer project');
  });

  // --- Phase 3: Verify all packages resolved correctly ---
  await ctx.subTest('verify installed packages', async () => {
    // Check that each seed package is retrievable via `info`
    for (let i = 1; i <= SEED_PACKAGES_COUNT; i++) {
      const name = `@verdaccio/seed-${id}-${i}`;
      const resp = await ctx.adapter.exec(
        { cwd: projectCwd },
        'info',
        name,
        '--json',
        ...ctx.adapter.registryArg(ctx.registryUrl)
      );
      const info = JSON.parse(resp.stdout);
      assert.strictEqual(info.name, name, `Expected package name "${name}"`);
      assert.strictEqual(info.version, '1.0.0', `Expected version 1.0.0 for ${name}`);
    }

    // Verify intermediate package has correct dependencies in registry metadata
    const midName = `@verdaccio/seed-mid-${id}`;
    const resp = await ctx.adapter.exec(
      { cwd: projectCwd },
      'info',
      midName,
      '--json',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );
    const midInfo = JSON.parse(resp.stdout);
    assert.strictEqual(midInfo.name, midName);

    const deps = midInfo.dependencies || {};
    assert.strictEqual(
      deps[`@verdaccio/seed-${id}-1`],
      '1.0.0',
      'Intermediate should depend on seed-1'
    );
    assert.strictEqual(
      deps[`@verdaccio/seed-${id}-2`],
      '1.0.0',
      'Intermediate should depend on seed-2'
    );
    assert.strictEqual(
      deps[`@verdaccio/seed-shared-${id}`],
      '1.0.0',
      'Intermediate should depend on shared'
    );

    debug('all packages verified');
  });

  // --- Phase 4: Publish updated versions and re-install ---
  await ctx.subTest('update and re-install', async () => {
    // Publish v2 of a leaf and the shared package
    const leafName = `@verdaccio/seed-${id}-1`;
    await publishSeedPackage(ctx, leafName, '2.0.0');

    const sharedName = `@verdaccio/seed-shared-${id}`;
    await publishSeedPackage(ctx, sharedName, '2.0.0');

    // Create a new consumer that uses ^ ranges — should pick up 2.0.0
    const consumerDeps: Record<string, string> = {
      [leafName]: '^1.0.0',
      [sharedName]: '^1.0.0',
    };

    const consumerName = `@verdaccio/consumer-update-${id}`;
    const { tempFolder } = await ctx.adapter.prepareProject(
      consumerName,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token,
      consumerDeps
    );

    await ctx.adapter.exec({ cwd: tempFolder }, 'install', ...ctx.adapter.registryArg(ctx.registryUrl));

    // Verify that the registry now serves both versions
    const leafResp = await ctx.adapter.exec(
      { cwd: tempFolder },
      'info',
      leafName,
      '--json',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );
    const leafInfo = JSON.parse(leafResp.stdout);

    // dist-tags.latest should be 2.0.0
    assert.strictEqual(
      leafInfo['dist-tags']?.latest ?? leafInfo.version,
      '2.0.0',
      `Expected latest version of ${leafName} to be 2.0.0`
    );

    debug('update and re-install verified');
  });
}

export const installMultipleDepsScenario: TestDefinition = {
  name: 'scenario:install-multiple-deps',
  requires: ['publish', 'install', 'info'],
  run: testInstallMultipleDeps,
};
