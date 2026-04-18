import assert from 'assert';
import buildDebug from 'debug';

import { TestContext, TestDefinition } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:test:deprecate');

async function publishPkg(ctx: TestContext, tempFolder: string, pkgName: string) {
  if (ctx.adapter.type === 'yarn-modern') {
    debug('running yarn install before publish for %s', pkgName);
    await ctx.adapter.exec({ cwd: tempFolder }, 'install');
  }
  debug('publishing %s from %s', pkgName, tempFolder);
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('published %s successfully', pkgName);
}

async function deprecate(
  ctx: TestContext,
  tempFolder: string,
  packageVersion: string,
  message: string
) {
  debug('deprecating %s with message: %s', packageVersion, message || '(empty, un-deprecate)');
  const jsonFlag = ctx.adapter.type === 'yarn-modern' ? [] : ['--json'];
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'deprecate',
    packageVersion,
    message,
    ...jsonFlag,
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('deprecate command completed for %s', packageVersion);
}

async function getInfo(ctx: TestContext, tempFolder: string, pkgName: string) {
  debug('fetching info for %s', pkgName);
  const resp = await ctx.adapter.exec(
    { cwd: tempFolder },
    'info',
    pkgName,
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const parsed = JSON.parse(resp.stdout);
  debug('info for %s: deprecated=%s', pkgName, parsed.deprecated ?? '(not set)');
  return parsed;
}

async function bumpVersion(ctx: TestContext, tempFolder: string) {
  debug('bumping version (minor) in %s', tempFolder);
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'version',
    'minor',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function prepareDeprecateProject(
  ctx: TestContext,
  pkgName: string,
  version: string
): Promise<string> {
  debug('preparing project for %s@%s', pkgName, version);
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    version,
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  if (ctx.adapter.importPlugin) {
    debug('importing npm-deprecate plugin into %s', tempFolder);
    await ctx.adapter.importPlugin(tempFolder, 'npm-deprecate');
  }
  return tempFolder;
}

async function testDeprecate(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  // Test 1: deprecate a single version
  debug('--- test 1: deprecate a single version ---');
  const pkgName1 = `@verdaccio/dep1-${id}`;
  const message = 'some message';
  const tf1 = await prepareDeprecateProject(ctx, pkgName1, '1.0.0');
  await publishPkg(ctx, tf1, pkgName1);
  await deprecate(ctx, tf1, `${pkgName1}@1.0.0`, message);
  const info1 = await getInfo(ctx, tf1, pkgName1);
  assert.strictEqual(info1.name, pkgName1);
  assert.strictEqual(info1.deprecated, message, 'Package should be deprecated');

  // Test 2: un-deprecate
  debug('--- test 2: un-deprecate ---');
  const pkgName2 = `@verdaccio/dep2-${id}`;
  const tf2 = await prepareDeprecateProject(ctx, pkgName2, '1.0.0');
  await publishPkg(ctx, tf2, pkgName2);
  await deprecate(ctx, tf2, `${pkgName2}@1.0.0`, message);
  const info2a = await getInfo(ctx, tf2, pkgName2);
  assert.strictEqual(info2a.deprecated, message);
  // empty string = undeprecate
  await deprecate(ctx, tf2, `${pkgName2}@1.0.0`, '');
  const info2b = await getInfo(ctx, tf2, pkgName2);
  assert.strictEqual(info2b.deprecated, undefined, 'Package should be un-deprecated');

  // Test 3: deprecate multiple versions
  debug('--- test 3: deprecate multiple versions ---');
  const pkgName3 = `@verdaccio/dep3-${id}`;
  const tf3 = await prepareDeprecateProject(ctx, pkgName3, '1.0.0');
  await publishPkg(ctx, tf3, pkgName3);
  for (let i = 0; i < 3; i++) {
    await bumpVersion(ctx, tf3);
    await publishPkg(ctx, tf3, pkgName3);
  }
  const deprecateAll = ctx.adapter.type === 'yarn-modern' ? `${pkgName3}@*` : pkgName3;
  await deprecate(ctx, tf3, deprecateAll, message);
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0']) {
    const info = await getInfo(ctx, tf3, `${pkgName3}@${v}`);
    assert.strictEqual(info.deprecated, message, `Version ${v} should be deprecated`);
  }
  // publish a new version after deprecation — should NOT be deprecated
  await bumpVersion(ctx, tf3);
  await publishPkg(ctx, tf3, pkgName3);
  const info3 = await getInfo(ctx, tf3, `${pkgName3}@1.4.0`);
  assert.strictEqual(info3.deprecated, undefined, 'New version should not be deprecated');
}

export const deprecateTest: TestDefinition = {
  name: 'deprecate',
  requires: ['deprecate'],
  run: testDeprecate,
};
