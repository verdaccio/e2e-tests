import assert from 'assert';
import buildDebug from 'debug';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import YAML from 'js-yaml';

import { TestContext, TestDefinition } from '../types';
import { createTempFolder } from '../utils/project';

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

async function testLogin(ctx: TestContext): Promise<void> {
  const type = ctx.adapter.type;
  const id = ctx.runId;

  if (type !== 'yarn-modern') {
    debug('login test only supported for yarn-modern, skipping %s', type);
    return;
  }

  // Test 1: create a new user via login, verify with whoami
  debug('--- test 1: create new user via login + whoami ---');
  const user1 = `login-new-${id}`;
  const password1 = 'test-password-123';
  const email1 = `${user1}@test.example.com`;
  const tf1 = await prepareLoginProject(ctx, `verdaccio-login1-${id}`);

  debug('creating user %s via yarn npm login', user1);
  const loginResp = await ctx.adapter.exec(
    { cwd: tf1 },
    'login',
    '--auth-type=legacy',
    `--user=${user1}`,
    `--password=${password1}`,
    `--email=${email1}`
  );
  debug('login output: %s', loginResp.stdout);
  assert.ok(
    loginResp.stdout.includes('Logged in') || loginResp.stdout.includes('token saved'),
    `Expected login success message but got "${loginResp.stdout}"`
  );

  // Verify identity with whoami
  debug('verifying identity with whoami');
  const whoamiResp = await ctx.adapter.exec({ cwd: tf1 }, 'whoami');
  debug('whoami output: %s', whoamiResp.stdout);
  assert.ok(
    whoamiResp.stdout.includes(user1),
    `Expected whoami to return "${user1}" but got "${whoamiResp.stdout}"`
  );

  // Test 2: login again with the same user (authenticate existing user)
  debug('--- test 2: login with existing user ---');
  const tf2 = await prepareLoginProject(ctx, `verdaccio-login2-${id}`);

  debug('logging in as existing user %s', user1);
  const loginResp2 = await ctx.adapter.exec(
    { cwd: tf2 },
    'login',
    '--auth-type=legacy',
    `--user=${user1}`,
    `--password=${password1}`,
    `--email=${email1}`
  );
  debug('login output: %s', loginResp2.stdout);
  assert.ok(
    loginResp2.stdout.includes('Logged in') || loginResp2.stdout.includes('token saved'),
    `Expected login success for existing user but got "${loginResp2.stdout}"`
  );

  // Verify same identity
  debug('verifying identity with whoami');
  const whoamiResp2 = await ctx.adapter.exec({ cwd: tf2 }, 'whoami');
  assert.ok(
    whoamiResp2.stdout.includes(user1),
    `Expected whoami to return "${user1}" but got "${whoamiResp2.stdout}"`
  );
}

export const loginTest: TestDefinition = {
  name: 'login',
  requires: ['login'],
  run: testLogin,
};
