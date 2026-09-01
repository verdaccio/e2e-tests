import assert from 'assert';

import { TestContext, TestDefinition } from '../types';
import { parseInfoJson } from '../utils/info';
import { publishLocalPackage } from '../utils/publish';

async function testInfo(ctx: TestContext): Promise<void> {
  // Publish the package we inspect (with one dependency, also local) — asking
  // for a real npmjs package would need an uplink and the suite must run
  // offline. deno resolves the dependency tree, so the dep must exist too.
  const depName = `e2e-info-dep-${ctx.runId}`;
  const pkgName = `e2e-info-${ctx.runId}`;
  await publishLocalPackage(ctx, depName, '1.0.0');
  await publishLocalPackage(ctx, pkgName, '1.0.0', { [depName]: '1.0.0' });

  // Run from a prepared project: it gives yarn modern a project context, and
  // its .npmrc (fresh token) shields the test from stale credentials in
  // ~/.npmrc.
  const { tempFolder } = await ctx.adapter.prepareProject(
    `info-client-${ctx.runId}`,
    '1.0.0',
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );

  const resp = await ctx.adapter.exec(
    { cwd: tempFolder },
    'info',
    pkgName,
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );

  if (ctx.adapter.type === 'deno') {
    // deno info npm:<pkg> outputs a text dependency tree
    const output = resp.stdout + resp.stderr;
    assert.ok(output.includes(pkgName), `Expected deno info output to reference ${pkgName}`);
  } else {
    const parsedBody = parseInfoJson(resp.stdout);
    assert.strictEqual(parsedBody.name, pkgName, `Expected package name "${pkgName}"`);
    assert.ok(parsedBody.dependencies !== undefined, 'Expected "dependencies" to be defined');
  }
}

export const infoTest: TestDefinition = {
  name: 'info',
  requires: ['info'],
  run: testInfo,
};
