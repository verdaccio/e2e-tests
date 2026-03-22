import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testPing(ctx: TestContext): Promise<void> {
  const resp = await ctx.adapter.exec(
    {},
    'ping',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const parsedBody = JSON.parse(resp.stdout);
  assert.strictEqual(
    parsedBody.registry,
    ctx.registryUrl + '/',
    `Expected registry "${ctx.registryUrl}/" but got "${parsedBody.registry}"`
  );
}

export const pingTest: TestDefinition = {
  name: 'ping',
  requires: ['ping'],
  run: testPing,
};
