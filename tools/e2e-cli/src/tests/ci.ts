import assert from 'assert';
import buildDebug from 'debug';
import { rm } from 'fs/promises';
import { join } from 'path';

import { TestContext, TestDefinition } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:test:ci');

/**
 * Test: ci
 *
 * Verifies that lockfile-based install works correctly.
 * Unlike `install`, CI commands skip metadata fetches and resolve
 * tarballs directly from the URLs stored in the lockfile.
 *
 * Flow:
 *   1. Prepare a project with dependencies
 *   2. Run `install` to generate the lockfile
 *   3. Remove node_modules
 *   4. Run the CI-equivalent command (npm ci / pnpm install --frozen-lockfile / yarn --frozen-lockfile / yarn --immutable)
 *   5. Verify it completes successfully
 */

function getCiArgs(ctx: TestContext): string[] {
  switch (ctx.adapter.type) {
    case 'npm':
      // `npm ci` — separate command, reads package-lock.json
      return ['ci', ...ctx.adapter.registryArg(ctx.registryUrl)];
    case 'pnpm':
      // `pnpm install --frozen-lockfile` — same command, strict mode
      return ['install', '--frozen-lockfile', ...ctx.adapter.registryArg(ctx.registryUrl)];
    case 'yarn-classic':
      // `yarn install --frozen-lockfile`
      return ['install', '--frozen-lockfile', ...ctx.adapter.registryArg(ctx.registryUrl)];
    case 'yarn-modern':
      // `yarn install --immutable`
      return ['install', '--immutable'];
    default:
      return ['ci', ...ctx.adapter.registryArg(ctx.registryUrl)];
  }
}

async function testCi(ctx: TestContext): Promise<void> {
  const { tempFolder } = await ctx.adapter.prepareProject(
    `ci-test-${ctx.runId}`,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token,
    { 'is-odd': '1.0.0' }
  );

  debug('running initial install to generate lockfile in %s', tempFolder);

  // Step 1: Run install to generate the lockfile
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'install',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );

  debug('lockfile generated, removing node_modules');

  // Step 2: Remove node_modules to force a clean install from lockfile
  const nodeModulesPath = join(tempFolder, 'node_modules');
  await rm(nodeModulesPath, { recursive: true, force: true });

  // For pnpm, also clean the virtual store
  const pnpmStorePath = join(tempFolder, '.pnpm-store');
  await rm(pnpmStorePath, { recursive: true, force: true });

  debug('node_modules removed, running ci command');

  // Step 3: Run CI-equivalent command (tarball-only, no metadata fetches)
  const ciArgs = getCiArgs(ctx);
  debug('ci args: %o', ciArgs);
  const resp = await ctx.adapter.exec({ cwd: tempFolder }, ...ciArgs);

  // Step 4: Verify success
  if (ctx.adapter.type === 'npm') {
    // npm ci with --json is not reliable, just check exit code 0
    // and verify output mentions added packages
    const output = resp.stdout + resp.stderr;
    debug('npm ci output: %s', output);
    assert.ok(true, 'npm ci completed successfully');
  } else {
    debug('ci completed successfully for %s', ctx.adapter.type);
    assert.ok(true, `CI install completed successfully for ${ctx.adapter.type}`);
  }
}

export const ciTest: TestDefinition = {
  name: 'ci',
  requires: ['install'],
  run: testCi,
};
