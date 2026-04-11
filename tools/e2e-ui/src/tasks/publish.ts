import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export interface PublishPackageInput {
  pkgName: string;
  version?: string;
  registryUrl: string;
  credentials: { user: string; password: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  /**
   * When true, append a timestamp suffix to the version so reruns against
   * a persistent registry don't collide on 403. The suffix is a valid
   * semver prerelease, e.g. `1.0.0-t1712345678`. Defaults to false.
   */
  unique?: boolean;
}

export interface PublishPackageResult {
  pkgName: string;
  version: string;
  tempFolder: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '-');
}

/**
 * Obtain a registry-API-compatible (legacy) auth token for publish.
 *
 * Strategy: create a throwaway user per call. `PUT /-/user/org.couchdb.user:<name>`
 * only returns a token on CREATE (and 409s on existing users), so we
 * guarantee success by generating a unique username each time.
 *
 * We need a legacy token specifically because:
 *   - Verdaccio's default API middleware accepts legacy tokens but NOT
 *     JWTs from `/-/verdaccio/sec/login`
 *   - Modern npm (>= 10.x) refuses to run `npm publish` at all without
 *     an `_authToken` entry in `.npmrc`, even against a registry that
 *     allows `$anonymous` publish — it errors out client-side
 *
 * The throwaway user stays in the test registry's htpasswd store after
 * the run, which is fine for ephemeral CI environments and local temp
 * setups (both wipe storage between runs).
 */
async function obtainLegacyToken(
  registryUrl: string
): Promise<{ user: string; token: string }> {
  const user = `e2e-bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'e2e-bot-password';
  const base = registryUrl.replace(/\/$/, '');
  const url = `${base}/-/user/org.couchdb.user:${encodeURIComponent(user)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: user,
      password,
      _id: `org.couchdb.user:${user}`,
      type: 'user',
      roles: [],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `[publishPackage] failed to create throwaway user "${user}" ` +
        `(HTTP ${res.status}): ${body}`
    );
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token) {
    throw new Error(
      `[publishPackage] user creation response did not contain a token: ${JSON.stringify(
        json
      )}`
    );
  }
  return { user, token: json.token };
}

async function createTempProject(
  pkgName: string,
  version: string,
  registryUrl: string,
  token: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>
): Promise<string> {
  const tempFolder = await mkdtemp(
    join(tmpdir(), `verdaccio-e2e-ui-${sanitizeFolderName(pkgName)}-`)
  );
  const manifest = {
    name: pkgName,
    version,
    description: `e2e test fixture ${pkgName}`,
    main: 'index.js',
    dependencies,
    devDependencies,
    keywords: ['verdaccio', 'e2e', 'test'],
    author: 'Verdaccio E2E <verdaccio@example.org>',
    license: 'MIT',
    // Scoped packages default to `restricted` access which modern npm
    // refuses to publish anonymously. Pin it to `public` so the CLI
    // skips that check for fixtures like `@verdaccio/pkg-scoped`.
    publishConfig: {
      access: 'public',
      registry: registryUrl,
    },
  };
  await writeFile(join(tempFolder, 'package.json'), JSON.stringify(manifest, null, 2));
  await writeFile(
    join(tempFolder, 'README.md'),
    `# ${pkgName}\n\nPublished by @verdaccio/e2e-ui for e2e testing.\n`
  );
  await writeFile(
    join(tempFolder, 'index.js'),
    `module.exports = ${JSON.stringify(pkgName)};\n`
  );

  // `.npmrc` — include an `_authToken` scoped to the registry host so
  // modern npm (>= 10.x) is willing to run `npm publish`. Without this
  // the CLI errors client-side with "This command requires you to be
  // logged in." even against a registry configured for `$anonymous`
  // publish. The token is a legacy Verdaccio auth token obtained by
  // creating a throwaway user via `PUT /-/user/...`.
  const registryHost = registryUrl.replace(/^https?:/, '');
  const npmrc = [
    `registry=${registryUrl}`,
    `${registryHost}/:_authToken=${token}`,
    // Force public access for scoped packages.
    'access=public',
    '',
  ].join('\n');
  await writeFile(join(tempFolder, '.npmrc'), npmrc);

  return tempFolder;
}

function spawnNpmPublish(
  cwd: string,
  registryUrl: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise, rejectPromise) => {
    // `--tag latest` is required so npm accepts prerelease versions
    // (e.g. `1.0.0-t<ts>` when `unique: true`). Without it npm bails
    // with "You must specify a tag using --tag when publishing a
    // prerelease version." For non-prerelease versions it's a no-op.
    const proc = spawn(
      'npm',
      [
        'publish',
        '--registry',
        registryUrl,
        '--tag',
        'latest',
        '--loglevel=error',
      ],
      {
        cwd,
        env: { ...process.env },
      }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', rejectPromise);
    proc.on('close', (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

/**
 * Publish a throwaway npm package to the target Verdaccio registry.
 *
 * Flow:
 *   1. Create a throwaway user via `PUT /-/user/...` and capture its
 *      legacy auth token. See `obtainLegacyToken` for why.
 *   2. Scaffold a temp project with `package.json`, `README.md`,
 *      `index.js`, and an `.npmrc` that includes the token.
 *   3. Spawn `npm publish` from that temp dir.
 *
 * `input.credentials` is kept on the signature for forward-compat but
 * is currently unused — each call mints its own throwaway user.
 *
 * Throws on non-zero npm exit. Returns the temp folder path on success
 * so callers can inspect or clean up.
 */
export async function publishPackage(
  input: PublishPackageInput
): Promise<PublishPackageResult> {
  const baseVersion = input.version ?? '1.0.0';
  const version = input.unique ? `${baseVersion}-t${Date.now()}` : baseVersion;

  const { token } = await obtainLegacyToken(input.registryUrl);

  const tempFolder = await createTempProject(
    input.pkgName,
    version,
    input.registryUrl,
    token,
    input.dependencies ?? {},
    input.devDependencies ?? {}
  );
  const { stdout, stderr, exitCode } = await spawnNpmPublish(
    tempFolder,
    input.registryUrl
  );
  if (exitCode !== 0) {
    throw new Error(
      `[publishPackage] npm publish failed for ${input.pkgName}@${version} ` +
        `(exit ${exitCode}):\n${stderr || stdout}`
    );
  }
  return { pkgName: input.pkgName, version, tempFolder, stdout, stderr, exitCode };
}

/**
 * Remove a temp project folder previously created by publishPackage.
 * Safe to call with a missing path or a path outside the OS tmp dir —
 * in the latter case it refuses rather than rm-rf'ing arbitrary paths.
 */
export async function cleanupPublished(tempFolder: string): Promise<void> {
  if (!tempFolder) return;
  const tmpRoot = tmpdir();
  if (!tempFolder.startsWith(tmpRoot)) {
    throw new Error(
      `[cleanupPublished] refusing to remove "${tempFolder}" — not under ${tmpRoot}`
    );
  }
  await rm(tempFolder, { recursive: true, force: true });
}
