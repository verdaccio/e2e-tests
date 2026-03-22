import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testInfo(ctx: TestContext): Promise<void> {
  const resp = await ctx.adapter.exec(
    {},
    'info',
    'verdaccio',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );

  const parsedBody = JSON.parse(resp.stdout);
  assert.strictEqual(parsedBody.name, 'verdaccio', 'Expected package name "verdaccio"');
  assert.ok(parsedBody.dependencies !== undefined, 'Expected "dependencies" to be defined');
}

export const infoTest: TestDefinition = {
  name: 'info',
  requires: ['info'],
  run: testInfo,
};
