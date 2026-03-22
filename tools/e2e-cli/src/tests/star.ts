import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testStar(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  // Test 1: star a package
  const pkgName1 = `@verdaccio/star1-${id}`;
  const { tempFolder: tf1 } = await ctx.adapter.prepareProject(
    pkgName1,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await ctx.adapter.exec(
    { cwd: tf1 },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const resp1 = await ctx.adapter.exec(
    { cwd: tf1 },
    'star',
    pkgName1,
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  assert.ok(
    resp1.stdout.includes(pkgName1),
    `Expected star output to contain "${pkgName1}" but got "${resp1.stdout}"`
  );

  // Test 2: unstar a package
  const pkgName2 = `@verdaccio/star2-${id}`;
  const { tempFolder: tf2 } = await ctx.adapter.prepareProject(
    pkgName2,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await ctx.adapter.exec(
    { cwd: tf2 },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  await ctx.adapter.exec(
    { cwd: tf2 },
    'star',
    pkgName2,
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const resp2 = await ctx.adapter.exec(
    { cwd: tf2 },
    'unstar',
    pkgName2,
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  assert.ok(
    resp2.stdout.includes(pkgName2),
    `Expected unstar output to contain "${pkgName2}" but got "${resp2.stdout}"`
  );
}

export const starTest: TestDefinition = {
  name: 'star',
  requires: ['star'],
  run: testStar,
};
