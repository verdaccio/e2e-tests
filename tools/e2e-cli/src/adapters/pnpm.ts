import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { prepareGenericEmptyProject } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:pnpm');

// pnpm removed ping and search; the dist-tag output changed (no --json) and needs adapted assertions
const PNPM_COMMANDS = new Set(['publish', 'unpublish', 'install', 'info', 'audit', 'deprecate']);

// pnpm 8, 9 and 10 are no longer supported by the suite.
const PNPM_MIN_SUPPORTED_MAJOR = 11;

function detectVersion(bin: string): string {
  try {
    return execSync(`${bin} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function assertSupportedVersion(resolved: string): void {
  const major = parseInt(resolved.split('.')[0], 10);
  if (!Number.isNaN(major) && major < PNPM_MIN_SUPPORTED_MAJOR) {
    throw new Error(
      `pnpm@${resolved} is not supported. Minimum supported major: ${PNPM_MIN_SUPPORTED_MAJOR}`
    );
  }
}

function installPnpm(version: string): string {
  const pkg = `pnpm@${version}`;
  debug('installing %s into temp dir', pkg);
  const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  execSync(`npm install --prefix "${tmpDir}" ${pkg} --loglevel=error`, {
    encoding: 'utf8',
    timeout: 30000,
  });
  const bin = `${tmpDir}/node_modules/.bin/pnpm`;
  const installed = detectVersion(bin);
  debug('installed pnpm %s at %s', installed, bin);
  console.log(`  Auto-installed pnpm ${installed}`);
  return bin;
}

function resolvePnpmBin(binPath?: string, version?: string): string {
  if (binPath) return binPath;
  if (version) return installPnpm(version);
  return 'pnpm';
}

export function createPnpmAdapter(binPath?: string, version?: string): PackageManagerAdapter {
  const bin = resolvePnpmBin(binPath, version);
  const resolved = detectVersion(bin);
  assertSupportedVersion(resolved);
  debug('creating pnpm adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `pnpm@${resolved}`,
    type: 'pnpm',
    bin,
    supports: PNPM_COMMANDS,

    registryArg(url: string): string[] {
      return ['--registry', url];
    },

    prefixArg(folder: string): string[] {
      return ['--prefix', folder];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      const major = parseInt(resolved.split('.')[0], 10);
      if (major >= 11) {
        // pnpm v11: native deprecate/unpublish don't support --json
        const cmd = args[0];
        if (cmd === 'deprecate' || cmd === 'unpublish' || cmd === 'publish' || cmd === 'dist-tag') {
          args = args.filter((a) => a !== '--json' && !a.startsWith('--loglevel'));
        }
        // pnpm v11: un-deprecate uses `undeprecate` command instead of `deprecate pkg ""`
        if (cmd === 'deprecate') {
          // Check if message arg is empty string (un-deprecate)
          // args: ['deprecate', 'pkg@version', '', ...flags]
          const msgIdx = 2; // message is the third arg
          if (args.length > msgIdx && args[msgIdx] === '') {
            args = ['undeprecate', args[1], ...args.slice(3)];
          }
        }
        // pnpm v11: native version command doesn't accept --registry, --loglevel, or --no--git-tag-version
        if (cmd === 'version') {
          args = args.filter(
            (a) =>
              !a.startsWith('--registry') &&
              !a.startsWith('--loglevel') &&
              !a.startsWith('--no--git-tag-version')
          );
        }
      }
      return exec(options, bin, args);
    },

    async prepareProject(
      packageName: string,
      version: string,
      registryUrl: string,
      port: number,
      token: string,
      dependencies: Record<string, string> = {},
      devDependencies: Record<string, string> = {}
    ): Promise<{ tempFolder: string }> {
      const project = await prepareGenericEmptyProject(
        packageName,
        version,
        port,
        token,
        registryUrl,
        dependencies,
        devDependencies
      );
      // pnpm 11.24+ enforces a minimumReleaseAge cooldown by default, which
      // rejects the just-published packages these tests install
      // (ERR_PNPM_NO_MATURE_MATCHING_VERSION). Disable it per project via
      // pnpm-workspace.yaml — the file also marks the temp folder as its own
      // workspace root, isolating it from any parent workspace. Tests that
      // exercise the cooldown itself overwrite this file with their own config.
      await writeFile(join(project.tempFolder, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 0\n');
      return project;
    },
  };

  return adapter;
}
