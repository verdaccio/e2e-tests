import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function publishPkg(ctx: TestContext, tempFolder: string, extraArgs: string[] = []) {
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...extraArgs,
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function bumpVersion(ctx: TestContext, tempFolder: string) {
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'version',
    'minor',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function testDistTags(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  // Test 1: list dist-tags
  const pkgName1 = `@foo/dt1-${id}`;
  const { tempFolder: tf1 } = await ctx.adapter.prepareProject(
    pkgName1,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tf1);
  await bumpVersion(ctx, tf1);
  await publishPkg(ctx, tf1, ['--tag', 'beta']);
  const resp1 = await ctx.adapter.exec(
    { cwd: tf1 },
    'dist-tag',
    'ls',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  assert.strictEqual(resp1.stdout, 'beta: 1.1.0latest: 1.0.0');

  // Test 2: remove tag
  const pkgName2 = `@verdaccio/dt2-${id}`;
  const { tempFolder: tf2 } = await ctx.adapter.prepareProject(
    pkgName2,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tf2);
  await bumpVersion(ctx, tf2);
  await publishPkg(ctx, tf2, ['--tag', 'beta']);
  const resp2 = await ctx.adapter.exec(
    { cwd: tf2 },
    'dist-tag',
    'rm',
    `${pkgName2}@1.1.0`,
    'beta',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  assert.strictEqual(resp2.stdout, `-beta: ${pkgName2}@1.1.0`);

  // Test 3: add tag
  const pkgName3 = `@verdaccio/dt3-${id}`;
  const { tempFolder: tf3 } = await ctx.adapter.prepareProject(
    pkgName3,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tf3);
  await bumpVersion(ctx, tf3);
  await publishPkg(ctx, tf3);
  const resp3 = await ctx.adapter.exec(
    { cwd: tf3 },
    'dist-tag',
    'add',
    `${pkgName3}@1.1.0`,
    'alfa',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  assert.strictEqual(resp3.stdout, `+alfa: ${pkgName3}@1.1.0`);
}

export const distTagsTest: TestDefinition = {
  name: 'dist-tags',
  requires: ['dist-tag'],
  run: testDistTags,
};
