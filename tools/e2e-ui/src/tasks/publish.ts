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

async function createTempProject(
  pkgName: string,
  version: string,
  registryUrl: string,
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

  // `.npmrc` — point npm at the test registry. We rely on the registry
  // allowing `$anonymous` publish (see docker/docker-e2e-ui/docker.yaml),
  // so no `_authToken` entry is required. Modern npm won't try to
  // authenticate if there's no token configured for the host and the
  // server doesn't challenge.
  const npmrc = [`registry=${registryUrl}`, ''].join('\n');
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
 *   1. Scaffold a temp project with `package.json`, `README.md`,
 *      `index.js`, and a minimal `.npmrc` pointing at the test registry.
 *   2. Spawn `npm publish` from that temp dir.
 *
 * This task assumes the target Verdaccio instance allows anonymous
 * publish (`publish: $anonymous` in the package config). That avoids
 * the mess of fetching a registry-API-compatible token: the web UI
 * `sec/login` endpoint returns a JWT that is NOT accepted by the
 * default registry API middleware, and the `PUT /-/user` endpoint only
 * returns a legacy token on first-time user creation (409 on reuse).
 * For an e2e test fixture, anonymous publish is the pragmatic choice.
 *
 * `input.credentials` is kept on the signature for forward-compat but
 * is currently unused. If a future test needs authenticated publish we
 * can wire it back in per-package.
 *
 * Throws on non-zero npm exit. Returns the temp folder path on success
 * so callers can inspect or clean up.
 */
export async function publishPackage(
  input: PublishPackageInput
): Promise<PublishPackageResult> {
  const baseVersion = input.version ?? '1.0.0';
  const version = input.unique ? `${baseVersion}-t${Date.now()}` : baseVersion;
  const tempFolder = await createTempProject(
    input.pkgName,
    version,
    input.registryUrl,
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
