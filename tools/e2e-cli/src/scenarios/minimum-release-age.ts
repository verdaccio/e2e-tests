import assert from 'assert';
import buildDebug from 'debug';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { PackageManagerAdapter, TestContext, TestDefinition } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:scenario:minimum-release-age');

/**
 * Scenario: minimum-release-age (pnpm 11 only)
 *
 * Exercises pnpm's `minimumReleaseAge` cooldown together with
 * `minimumReleaseAgeExclude`. With a 7-day (10080 minute) cooldown, freshly
 * published versions are normally not installable until they age past the
 * threshold — but packages matching the exclude globs bypass the check.
 *
 *   minimumReleaseAge: 10080
 *   minimumReleaseAgeExclude:
 *     - '@verdaccio/*'
 *     - 'verdaccio-*'
 *
 * The scenario publishes brand-new (age ~0) packages and asserts:
 *   - an excluded scoped package   (@verdaccio/*) installs despite the cooldown
 *   - an excluded unscoped package (verdaccio-*)  installs despite the cooldown
 *   - a non-excluded package is blocked by the cooldown (proving it is active)
 *
 * pnpm >= 11 reads these settings from `pnpm-workspace.yaml`, mirroring the
 * configuration used by the repo root.
 */

const MINIMUM_RELEASE_AGE = 10080; // 7 days, in minutes
const MINIMUM_RELEASE_AGE_EXCLUDE = ['@verdaccio/*', 'verdaccio-*'];

const PNPM_WORKSPACE_YAML = [
  `minimumReleaseAge: ${MINIMUM_RELEASE_AGE}`,
  'minimumReleaseAgeExclude:',
  ...MINIMUM_RELEASE_AGE_EXCLUDE.map((glob) => `  - '${glob}'`),
  '',
].join('\n');

/** True only for pnpm 11 and newer, where minimumReleaseAge is supported. */
export function isPnpm11Plus(adapter: PackageManagerAdapter): boolean {
  if (adapter.type !== 'pnpm') {
    return false;
  }
  const match = adapter.name.match(/pnpm@(\d+)/);
  return match ? parseInt(match[1], 10) >= 11 : false;
}

async function publishPackage(
  ctx: TestContext,
  pkgName: string,
  version: string
): Promise<void> {
  debug('publishing %s@%s', pkgName, version);
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    version,
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('published %s@%s', pkgName, version);
}

/**
 * Build a consumer project with the minimumReleaseAge cooldown configured in
 * pnpm-workspace.yaml, depending on the given packages.
 */
async function prepareCooldownConsumer(
  ctx: TestContext,
  consumerName: string,
  dependencies: Record<string, string>
): Promise<string> {
  const { tempFolder } = await ctx.adapter.prepareProject(
    consumerName,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token,
    dependencies
  );
  await writeFile(join(tempFolder, 'pnpm-workspace.yaml'), PNPM_WORKSPACE_YAML);
  debug('prepared cooldown consumer %s at %s', consumerName, tempFolder);
  return tempFolder;
}

async function testMinimumReleaseAge(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  const excludedScoped = `@verdaccio/release-age-${id}`;
  const excludedUnscoped = `verdaccio-release-age-${id}`;
  const blocked = `e2e-release-age-blocked-${id}`;

  // --- Phase 1: Publish brand-new (age ~0) packages ---
  await ctx.subTest('publish fresh packages', async () => {
    await publishPackage(ctx, excludedScoped, '1.0.0');
    await publishPackage(ctx, excludedUnscoped, '1.0.0');
    await publishPackage(ctx, blocked, '1.0.0');
  });

  // --- Phase 2: Excluded packages install despite the cooldown ---
  await ctx.subTest('excluded packages bypass the cooldown', async () => {
    const tempFolder = await prepareCooldownConsumer(ctx, `@verdaccio/consumer-excluded-${id}`, {
      [excludedScoped]: '1.0.0',
      [excludedUnscoped]: '1.0.0',
    });

    // Should succeed: both deps match the exclude globs.
    await ctx.adapter.exec(
      { cwd: tempFolder },
      'install',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );

    debug('excluded packages installed successfully under cooldown');
  });

  // --- Phase 3: Non-excluded fresh package is blocked by the cooldown ---
  await ctx.subTest('non-excluded fresh package is blocked', async () => {
    const tempFolder = await prepareCooldownConsumer(ctx, `e2e-consumer-blocked-${id}`, {
      [blocked]: '1.0.0',
    });

    let errorMessage = '';
    try {
      await ctx.adapter.exec(
        { cwd: tempFolder },
        'install',
        '--frozen-lockfile=false',
        ...ctx.adapter.registryArg(ctx.registryUrl)
      );
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      debug('install correctly rejected by cooldown: %s', errorMessage);
    }

    assert.ok(
      errorMessage,
      `Expected install of fresh non-excluded package "${blocked}" to be blocked by ` +
        `minimumReleaseAge (${MINIMUM_RELEASE_AGE} min), but it succeeded`
    );
    // pnpm reports ERR_PNPM_NO_MATURE_MATCHING_VERSION / "minimumReleaseAge" when a
    // version is too new. Assert the failure is the cooldown, not an unrelated error.
    assert.ok(
      /minimumReleaseAge|NO_MATURE_MATCHING_VERSION/i.test(errorMessage),
      `Install of "${blocked}" failed for an unexpected reason (expected a minimumReleaseAge ` +
        `cooldown error):\n${errorMessage}`
    );
  });
}

export const minimumReleaseAgeScenario: TestDefinition = {
  name: 'scenario:minimum-release-age',
  requires: ['publish', 'install'],
  appliesTo: isPnpm11Plus,
  run: testMinimumReleaseAge,
};
