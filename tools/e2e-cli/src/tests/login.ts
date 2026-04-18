import assert from 'assert';
import buildDebug from 'debug';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import YAML from 'js-yaml';

import { TestContext, TestDefinition } from '../types';
import { createTempFolder, getPackageJSON, getREADME } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:test:login');

/**
 * Creates a project with registry config but WITHOUT auth token,
 * so whoami will use the token saved by login to ~/.yarnrc.yml.
 */
async function prepareLoginProject(
  ctx: TestContext,
  name: string
): Promise<string> {
  debug('preparing project for %s (no auth token)', name);
  const tempFolder = await createTempFolder(name);
  const yamlContent = YAML.dump({
    npmRegistryServer: ctx.registryUrl,
    enableImmutableInstalls: false,
    unsafeHttpWhitelist: ['localhost'],
  });
  await writeFile(join(tempFolder, '.yarnrc.yml'), yamlContent);
  await writeFile(join(tempFolder, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  if (ctx.adapter.importPlugin) {
    debug('importing npm-login plugin into %s', tempFolder);
    await ctx.adapter.importPlugin(tempFolder, 'npm-login');
  }
  return tempFolder;
}

async function yarnLogin(
  ctx: TestContext,
  cwd: string,
  user: string,
  password: string,
  email: string
) {
  debug('yarn npm login as %s', user);
  return ctx.adapter.exec(
    { cwd },
    'login',
    '--auth-type=legacy',
    `--user=${user}`,
    `--password=${password}`,
    `--email=${email}`
  );
}

async function yarnWhoami(ctx: TestContext, cwd: string): Promise<string> {
  const resp = await ctx.adapter.exec({ cwd }, 'whoami');
  debug('yarn npm whoami: %s', resp.stdout);
  return resp.stdout;
}

async function testLogin(ctx: TestContext): Promise<void> {
  const type = ctx.adapter.type;
  const id = ctx.runId;

  if (type !== 'yarn-modern') {
    debug('login test only supported for yarn-modern, skipping %s', type);
    return;
  }

  const user1 = `login-a-${id}`;
  const password1 = 'test-password-123';
  const email1 = `${user1}@test.example.com`;

  await ctx.subTest('create new user + whoami', async () => {
    const tf = await prepareLoginProject(ctx, `verdaccio-login1-${id}`);
    const loginResp = await yarnLogin(ctx, tf, user1, password1, email1);
    assert.ok(
      loginResp.stdout.includes('Logged in') || loginResp.stdout.includes('token saved'),
      `Expected login success message but got "${loginResp.stdout}"`
    );
    const who = await yarnWhoami(ctx, tf);
    assert.ok(who.includes(user1), `Expected whoami "${user1}" but got "${who}"`);
  });

  await ctx.subTest('login existing user', async () => {
    const tf = await prepareLoginProject(ctx, `verdaccio-login2-${id}`);
    const loginResp = await yarnLogin(ctx, tf, user1, password1, email1);
    assert.ok(
      loginResp.stdout.includes('Logged in') || loginResp.stdout.includes('token saved'),
      `Expected login success for existing user but got "${loginResp.stdout}"`
    );
    const who = await yarnWhoami(ctx, tf);
    assert.ok(who.includes(user1), `Expected "${user1}" but got "${who}"`);
  });

  await ctx.subTest('wrong password fails', async () => {
    const tf = await prepareLoginProject(ctx, `verdaccio-login3-${id}`);
    let loginFailed = false;
    try {
      await yarnLogin(ctx, tf, user1, 'wrong-password', email1);
    } catch {
      loginFailed = true;
    }
    assert.ok(loginFailed, 'Login with wrong password should have failed');
  });

  await ctx.subTest('login then publish', async () => {
    const pkgName = `@verdaccio/login-pub-${id}`;
    const tf = await createTempFolder(`login-pub-${id}`);
    const yamlContent = YAML.dump({
      npmRegistryServer: ctx.registryUrl,
      enableImmutableInstalls: false,
      unsafeHttpWhitelist: ['localhost'],
    });
    await writeFile(join(tf, '.yarnrc.yml'), yamlContent);
    await writeFile(join(tf, 'package.json'), getPackageJSON(pkgName, '1.0.0'));
    await writeFile(join(tf, 'README.md'), getREADME(pkgName));
    if (ctx.adapter.importPlugin) {
      await ctx.adapter.importPlugin(tf, 'npm-login');
    }
    await yarnLogin(ctx, tf, user1, password1, email1);
    await ctx.adapter.exec({ cwd: tf }, 'install');
    const pubResp = await ctx.adapter.exec({ cwd: tf }, 'publish');
    assert.ok(
      pubResp.stdout.includes('Package archive published'),
      `Expected publish success but got "${pubResp.stdout}"`
    );
  });

  await ctx.subTest('switch users', async () => {
    const user2 = `login-b-${id}`;
    const password2 = 'other-password-456';
    const email2 = `${user2}@test.example.com`;
    const tf = await prepareLoginProject(ctx, `verdaccio-login5-${id}`);

    await yarnLogin(ctx, tf, user1, password1, email1);
    const who1 = await yarnWhoami(ctx, tf);
    assert.ok(who1.includes(user1), `Expected "${user1}" but got "${who1}"`);

    await yarnLogin(ctx, tf, user2, password2, email2);
    const who2 = await yarnWhoami(ctx, tf);
    assert.ok(who2.includes(user2), `Expected "${user2}" after switch but got "${who2}"`);
  });
}

export const loginTest: TestDefinition = {
  name: 'login',
  requires: ['login'],
  run: testLogin,
};
