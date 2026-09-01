import assert from 'assert';

import { TestContext, TestDefinition } from '../types';
import { publishLocalPackage } from '../utils/publish';

async function testSearch(ctx: TestContext): Promise<void> {
  // Publish the package we search for — searching an npmjs package would need
  // an uplink and the suite must run offline.
  const pkgName = `verdaccio-search-${ctx.runId}`;
  await publishLocalPackage(ctx, pkgName, '1.0.0');

  // Run from a prepared project so its .npmrc (fresh token) shields the test
  // from stale credentials in the developer's global ~/.npmrc.
  const { tempFolder } = await ctx.adapter.prepareProject(
    `search-client-${ctx.runId}`,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );

  const resp = await ctx.adapter.exec(
    { cwd: tempFolder },
    'search',
    pkgName,
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const parsedBody = JSON.parse(resp.stdout);
  const pkgFind = parsedBody.find((item: any) => item.name === pkgName);
  assert.ok(pkgFind, `Expected to find ${pkgName} in search results`);
  assert.strictEqual(pkgFind.name, pkgName);
}

export const searchTest: TestDefinition = {
  name: 'search',
  requires: ['search', 'publish'],
  run: testSearch,
};
