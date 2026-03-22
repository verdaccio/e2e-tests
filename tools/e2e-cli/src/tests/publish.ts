import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testPublish(ctx: TestContext): Promise<void> {
  const packages = [
    `verdaccio-memory-${ctx.runId}`,
    `verdaccio-${ctx.runId}`,
    `@verdaccio/foo-${ctx.runId}`,
    `@verdaccio/some-foo-${ctx.runId}`,
  ];

  for (const pkgName of packages) {
    const { tempFolder } = await ctx.adapter.prepareProject(
      pkgName,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token
    );

    const resp = await ctx.adapter.exec(
      { cwd: tempFolder },
      'publish',
      '--json',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );

    const parsedBody = JSON.parse(resp.stdout);
    assert.strictEqual(parsedBody.name, pkgName, `Expected package name "${pkgName}" but got "${parsedBody.name}"`);
    assert.ok(parsedBody.files, `Expected files to be defined for ${pkgName}`);
  }
}

export const publishTest: TestDefinition = {
  name: 'publish',
  requires: ['publish'],
  run: testPublish,
};
