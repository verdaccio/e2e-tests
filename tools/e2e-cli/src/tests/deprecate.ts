import assert from 'assert';
import buildDebug from 'debug';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

import { TestContext, TestDefinition } from '../types';

const debug = buildDebug('verdaccio:e2e-cli:test:deprecate');

async function publishPkg(ctx: TestContext, tempFolder: string, pkgName: string) {
  if (ctx.adapter.type === 'yarn-modern') {
    debug('running yarn install before publish for %s', pkgName);
    await ctx.adapter.exec({ cwd: tempFolder }, 'install');
  }
  debug('publishing %s from %s', pkgName, tempFolder);
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('published %s successfully', pkgName);
}

async function deprecate(
  ctx: TestContext,
  tempFolder: string,
  packageVersion: string,
  message: string
) {
  debug('deprecating %s with message: %s', packageVersion, message || '(empty, un-deprecate)');
  const jsonFlag = ctx.adapter.type === 'yarn-modern' ? [] : ['--json'];
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'deprecate',
    packageVersion,
    message,
    ...jsonFlag,
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('deprecate command completed for %s', packageVersion);
}

async function getInfo(ctx: TestContext, tempFolder: string, pkgName: string) {
  debug('fetching info for %s', pkgName);
  const resp = await ctx.adapter.exec(
    { cwd: tempFolder },
    'info',
    pkgName,
    '--json',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  const parsed = JSON.parse(resp.stdout);
  debug('info for %s: deprecated=%s', pkgName, parsed.deprecated ?? '(not set)');
  return parsed;
}

async function bumpVersion(ctx: TestContext, tempFolder: string) {
  debug('bumping version (minor) in %s', tempFolder);
  if (ctx.adapter.type === 'yarn-modern') {
    // Bump version by editing package.json directly to avoid
    // requiring the version plugin (not bundled in Yarn 3)
    const pkgPath = join(tempFolder, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    const [major, minor, patch] = pkg.version.split('.').map(Number);
    pkg.version = `${major}.${minor + 1}.${patch}`;
    debug('bumped %s to %s', pkgPath, pkg.version);
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  } else {
    await ctx.adapter.exec(
      { cwd: tempFolder },
      'version',
      'minor',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );
  }
}

async function prepareDeprecateProject(
  ctx: TestContext,
  pkgName: string,
  version: string
): Promise<string> {
  debug('preparing project for %s@%s', pkgName, version);
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    version,
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  if (ctx.adapter.importPlugin) {
    debug('importing npm-deprecate plugin into %s', tempFolder);
    await ctx.adapter.importPlugin(tempFolder, 'npm-deprecate');
  }
  return tempFolder;
}

async function testDeprecate(ctx: TestContext): Promise<void> {
  const id = ctx.runId;

  const message = 'some message';

  await ctx.subTest('deprecate single version', async () => {
    const pkgName = `@verdaccio/dep1-${id}`;
    const tf = await prepareDeprecateProject(ctx, pkgName, '1.0.0');
    await publishPkg(ctx, tf, pkgName);
    await deprecate(ctx, tf, `${pkgName}@1.0.0`, message);
    const info = await getInfo(ctx, tf, pkgName);
    assert.strictEqual(info.name, pkgName);
    assert.strictEqual(info.deprecated, message, 'Package should be deprecated');
  });

  await ctx.subTest('un-deprecate', async () => {
    const pkgName = `@verdaccio/dep2-${id}`;
    const tf = await prepareDeprecateProject(ctx, pkgName, '1.0.0');
    await publishPkg(ctx, tf, pkgName);
    await deprecate(ctx, tf, `${pkgName}@1.0.0`, message);
    const info1 = await getInfo(ctx, tf, pkgName);
    assert.strictEqual(info1.deprecated, message);
    await deprecate(ctx, tf, `${pkgName}@1.0.0`, '');
    const info2 = await getInfo(ctx, tf, pkgName);
    assert.strictEqual(info2.deprecated, undefined, 'Package should be un-deprecated');
  });

  await ctx.subTest('deprecate multiple versions', async () => {
    const pkgName = `@verdaccio/dep3-${id}`;
    const tf = await prepareDeprecateProject(ctx, pkgName, '1.0.0');
    await publishPkg(ctx, tf, pkgName);
    for (let i = 0; i < 3; i++) {
      await bumpVersion(ctx, tf);
      await publishPkg(ctx, tf, pkgName);
    }
    await deprecate(ctx, tf, pkgName, message);
    for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0']) {
      const info = await getInfo(ctx, tf, `${pkgName}@${v}`);
      assert.strictEqual(info.deprecated, message, `Version ${v} should be deprecated`);
    }
    await bumpVersion(ctx, tf);
    await publishPkg(ctx, tf, pkgName);
    const info = await getInfo(ctx, tf, `${pkgName}@1.4.0`);
    assert.strictEqual(info.deprecated, undefined, 'New version should not be deprecated');
  });
}

export const deprecateTest: TestDefinition = {
  name: 'deprecate',
  requires: ['deprecate'],
  run: testDeprecate,
};
