import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function publishPkg(ctx: TestContext, tempFolder: string) {
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function bumpVersion(ctx: TestContext, tempFolder: string, bump: string) {
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'version',
    bump,
    '--no--git-tag-version',
    '--loglevel=info',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
}

async function testUnpublish(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  // Test 1: unpublish a full package
  const pkgName = `@verdaccio/unpub1-${id}`;
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tempFolder);
  await bumpVersion(ctx, tempFolder, 'minor');
  await publishPkg(ctx, tempFolder);
  await bumpVersion(ctx, tempFolder, 'minor');
  await publishPkg(ctx, tempFolder);
  await bumpVersion(ctx, tempFolder, 'major');
  await publishPkg(ctx, tempFolder);

  const resp = await ctx.adapter.exec(
    { cwd: tempFolder },
    'unpublish',
    pkgName,
    '--force',
    '--loglevel=info',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  assert.ok(
    resp.stdout.includes(pkgName),
    `Expected unpublish output to contain "${pkgName}" but got "${resp.stdout}"`
  );

  // Test 2: unpublish a specific version
  const pkgName2 = `@verdaccio/unpub2-${id}`;
  const { tempFolder: tf2 } = await ctx.adapter.prepareProject(
    pkgName2,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await publishPkg(ctx, tf2);
  await bumpVersion(ctx, tf2, 'minor');
  await publishPkg(ctx, tf2);

  const resp2 = await ctx.adapter.exec(
    { cwd: tf2 },
    'unpublish',
    `${pkgName2}@1.0.0`,
    '--force',
    '--loglevel=info',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  assert.ok(
    resp2.stdout.includes(pkgName2),
    `Expected unpublish output to contain "${pkgName2}" but got "${resp2.stdout}"`
  );
}

export const unpublishTest: TestDefinition = {
  name: 'unpublish',
  requires: ['unpublish'],
  run: testUnpublish,
};
