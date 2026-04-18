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

async function login(
  ctx: TestContext,
  cwd: string,
  user: string,
  password: string,
  email: string
) {
  debug('logging in as %s', user);
  return ctx.adapter.exec(
    { cwd },
    'login',
    '--auth-type=legacy',
    `--user=${user}`,
    `--password=${password}`,
    `--email=${email}`
  );
}

async function whoami(ctx: TestContext, cwd: string): Promise<string> {
  const resp = await ctx.adapter.exec({ cwd }, 'whoami');
  debug('whoami output: %s', resp.stdout);
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

  // Test 1: create a new user via login, verify with whoami
  debug('--- test 1: create new user via login + whoami ---');
  const tf1 = await prepareLoginProject(ctx, `verdaccio-login1-${id}`);

  const loginResp = await login(ctx, tf1, user1, password1, email1);
  debug('login output: %s', loginResp.stdout);
  assert.ok(
    loginResp.stdout.includes('Logged in') || loginResp.stdout.includes('token saved'),
    `Expected login success message but got "${loginResp.stdout}"`
  );

  const who1 = await whoami(ctx, tf1);
  assert.ok(
    who1.includes(user1),
    `Expected whoami to return "${user1}" but got "${who1}"`
  );

  // Test 2: login again with the same user (authenticate existing user)
  debug('--- test 2: login with existing user ---');
  const tf2 = await prepareLoginProject(ctx, `verdaccio-login2-${id}`);

  const loginResp2 = await login(ctx, tf2, user1, password1, email1);
  assert.ok(
    loginResp2.stdout.includes('Logged in') || loginResp2.stdout.includes('token saved'),
    `Expected login success for existing user but got "${loginResp2.stdout}"`
  );

  const who2 = await whoami(ctx, tf2);
  assert.ok(
    who2.includes(user1),
    `Expected whoami to return "${user1}" but got "${who2}"`
  );

  // Test 3: wrong password — should fail
  debug('--- test 3: wrong password ---');
  const tf3 = await prepareLoginProject(ctx, `verdaccio-login3-${id}`);

  let loginFailed = false;
  try {
    await login(ctx, tf3, user1, 'wrong-password', email1);
  } catch (err) {
    loginFailed = true;
    debug('login correctly failed: %s', (err as Error).message);
  }
  assert.ok(loginFailed, 'Login with wrong password should have failed');

  // Test 4: login then publish — prove the token works end-to-end
  debug('--- test 4: login then publish ---');
  const pkgName = `@verdaccio/login-pub-${id}`;
  const tf4 = await createTempFolder(`login-pub-${id}`);
  const yamlContent = YAML.dump({
    npmRegistryServer: ctx.registryUrl,
    enableImmutableInstalls: false,
    unsafeHttpWhitelist: ['localhost'],
  });
  await writeFile(join(tf4, '.yarnrc.yml'), yamlContent);
  await writeFile(join(tf4, 'package.json'), getPackageJSON(pkgName, '1.0.0'));
  await writeFile(join(tf4, 'README.md'), getREADME(pkgName));
  if (ctx.adapter.importPlugin) {
    await ctx.adapter.importPlugin(tf4, 'npm-login');
  }

  // Login as user1 (already exists from test 1)
  await login(ctx, tf4, user1, password1, email1);

  // Publish using the token obtained from login
  debug('publishing %s after login', pkgName);
  await ctx.adapter.exec({ cwd: tf4 }, 'install');
  const pubResp = await ctx.adapter.exec({ cwd: tf4 }, 'publish');
  debug('publish output: %s', pubResp.stdout);
  assert.ok(
    pubResp.stdout.includes('Package archive published'),
    `Expected publish success but got "${pubResp.stdout}"`
  );

  // Test 5: switch users — login as A, then B, whoami returns B
  debug('--- test 5: switch users ---');
  const user2 = `login-b-${id}`;
  const password2 = 'other-password-456';
  const email2 = `${user2}@test.example.com`;
  const tf5 = await prepareLoginProject(ctx, `verdaccio-login5-${id}`);

  // Login as user1 first
  await login(ctx, tf5, user1, password1, email1);
  const who5a = await whoami(ctx, tf5);
  assert.ok(who5a.includes(user1), `Expected "${user1}" but got "${who5a}"`);

  // Switch to user2
  await login(ctx, tf5, user2, password2, email2);
  const who5b = await whoami(ctx, tf5);
  assert.ok(who5b.includes(user2), `Expected "${user2}" after switch but got "${who5b}"`);
}

export const loginTest: TestDefinition = {
  name: 'login',
  requires: ['login'],
  run: testLogin,
};
