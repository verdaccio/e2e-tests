import assert from 'assert';

import { TestContext, TestDefinition } from '../types';

async function testSearch(ctx: TestContext): Promise<void> {
  const resp = await ctx.adapter.exec(
    {},
    'search',
    '@verdaccio/cli',
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const parsedBody = JSON.parse(resp.stdout);
  const pkgFind = parsedBody.find((item: any) => item.name === '@verdaccio/cli');
  assert.ok(pkgFind, 'Expected to find @verdaccio/cli in search results');
  assert.strictEqual(pkgFind.name, '@verdaccio/cli');
}

export const searchTest: TestDefinition = {
  name: 'search',
  requires: ['search'],
  run: testSearch,
};
