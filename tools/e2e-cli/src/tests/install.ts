import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testInstall(ctx: TestContext): Promise<void> {
  const { tempFolder } = await ctx.adapter.prepareProject(
    'something',
    '1.0.0-patch',
    ctx.registryUrl,
    ctx.port,
    ctx.token,
    { react: '18.2.0' }
  );

  const resp = await ctx.adapter.exec(
    { cwd: tempFolder },
    'install',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );

  const parsedBody = JSON.parse(resp.stdout);
  assert.ok(parsedBody.added !== undefined, 'Expected "added" field in install response');
  assert.ok(parsedBody.audit !== undefined, 'Expected "audit" field in install response');
}

export const installTest: TestDefinition = {
  name: 'install',
  requires: ['install'],
  run: testInstall,
};
