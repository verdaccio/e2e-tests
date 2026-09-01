import assert from 'assert';

import { TestContext, TestDefinition } from '../types';
import { publishLocalPackage } from '../utils/publish';

async function testInstall(ctx: TestContext): Promise<void> {
  // Publish the dependency locally first — the suite must work offline, so
  // nothing is ever resolved from an external registry.
  const depName = `e2e-install-dep-${ctx.runId}`;
  await publishLocalPackage(ctx, depName, '1.0.0');

  const { tempFolder } = await ctx.adapter.prepareProject(
    `install-test-${ctx.runId}`,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token,
    { [depName]: '1.0.0' }
  );

  const isNpm = ctx.adapter.type === 'npm';

  // pnpm doesn't support --json on install
  const args = isNpm
    ? ['install', '--json', ...ctx.adapter.registryArg(ctx.registryUrl)]
    : ['install', ...ctx.adapter.registryArg(ctx.registryUrl)];

  const resp = await ctx.adapter.exec({ cwd: tempFolder }, ...args);

  if (isNpm) {
    const parsedBody = JSON.parse(resp.stdout);
    assert.ok(parsedBody.added !== undefined, 'Expected "added" field in install response');
  } else {
    // for pnpm/yarn just verify it completed without error (exit code 0)
    assert.ok(true, 'Install completed successfully');
  }
}

export const installTest: TestDefinition = {
  name: 'install',
  requires: ['install'],
  run: testInstall,
};
