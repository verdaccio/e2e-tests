import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function publishPkg(ctx: TestContext, tempFolder: string, pkgName: string) {
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function deprecate(
  ctx: TestContext,
  tempFolder: string,
  packageVersion: string,
  message: string
) {
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'deprecate',
    packageVersion,
    message,
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function getInfo(ctx: TestContext, pkgName: string) {
  const resp = await ctx.adapter.exec(
    {},
    'info',
    pkgName,
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  return JSON.parse(resp.stdout);
}

async function bumpVersion(ctx: TestContext, tempFolder: string) {
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'version',
    'minor',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function testDeprecate(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  // Test 1: deprecate a single version
  const pkgName1 = `@verdaccio/dep1-${id}`;
  const message = 'some message';
  const { tempFolder: tf1 } = await ctx.adapter.prepareProject(
    pkgName1,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tf1, pkgName1);
  await deprecate(ctx, tf1, `${pkgName1}@1.0.0`, message);
  const info1 = await getInfo(ctx, pkgName1);
  assert.strictEqual(info1.name, pkgName1);
  assert.strictEqual(info1.deprecated, message, 'Package should be deprecated');

  // Test 2: un-deprecate
  const pkgName2 = `@verdaccio/dep2-${id}`;
  const { tempFolder: tf2 } = await ctx.adapter.prepareProject(
    pkgName2,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tf2, pkgName2);
  await deprecate(ctx, tf2, `${pkgName2}@1.0.0`, message);
  const info2a = await getInfo(ctx, pkgName2);
  assert.strictEqual(info2a.deprecated, message);
  // empty string = undeprecate
  await deprecate(ctx, tf2, `${pkgName2}@1.0.0`, '');
  const info2b = await getInfo(ctx, pkgName2);
  assert.strictEqual(info2b.deprecated, undefined, 'Package should be un-deprecated');

  // Test 3: deprecate multiple versions
  const pkgName3 = `@verdaccio/dep3-${id}`;
  const { tempFolder: tf3 } = await ctx.adapter.prepareProject(
    pkgName3,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tf3, pkgName3);
  for (let i = 0; i < 3; i++) {
    await bumpVersion(ctx, tf3);
    await publishPkg(ctx, tf3, pkgName3);
  }
  await deprecate(ctx, tf3, pkgName3, message);
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0']) {
    const info = await getInfo(ctx, `${pkgName3}@${v}`);
    assert.strictEqual(info.deprecated, message, `Version ${v} should be deprecated`);
  }
  // publish a new version after deprecation — should NOT be deprecated
  await bumpVersion(ctx, tf3);
  await publishPkg(ctx, tf3, pkgName3);
  const info3 = await getInfo(ctx, `${pkgName3}@1.4.0`);
  assert.strictEqual(info3.deprecated, undefined, 'New version should not be deprecated');
}

export const deprecateTest: TestDefinition = {
  name: 'deprecate',
  requires: ['deprecate'],
  run: testDeprecate,
};
