import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testPing(ctx: TestContext): Promise<void> {
  const type = ctx.adapter.type;
  const needsProject = type === 'yarn-modern';
  let cwd: string | undefined;

  if (needsProject) {
    const { tempFolder } = await ctx.adapter.prepareProject(
      `verdaccio-ping-${ctx.runId}`,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token
    );
    cwd = tempFolder;
    if (ctx.adapter.importPlugin) {
      await ctx.adapter.importPlugin(tempFolder, 'npm-ping');
    }
  }

  const jsonFlag = type === 'yarn-modern' ? [] : ['--json'];
  const resp = await ctx.adapter.exec(
    { cwd },
    'ping',
    ...jsonFlag,
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );

  if (type === 'yarn-modern') {
    // yarn npm ping succeeding (exit code 0) is sufficient proof the registry is reachable
    assert.ok(true, 'ping succeeded');
  } else {
    const parsedBody = JSON.parse(resp.stdout);
    assert.strictEqual(
      parsedBody.registry,
      ctx.registryUrl + '/',
      `Expected registry "${ctx.registryUrl}/" but got "${parsedBody.registry}"`
    );
  }
}

export const pingTest: TestDefinition = {
  name: 'ping',
  requires: ['ping'],
  run: testPing,
};
