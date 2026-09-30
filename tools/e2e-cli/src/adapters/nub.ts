import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { prepareGenericEmptyProject } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:nub');

// nub (https://nubjs.com, package @nubjs/nub) is an all-in-one Node.js toolkit
// whose package-manager side only covers the install path (install, ci, add,
// remove, update, dedupe) — it has no publish/info/audit/etc. So the suite
// exercises just install and ci.
const NUB_SUPPORTED_COMMANDS = new Set(['install', 'ci']);

function detectVersion(bin: string): string {
  try {
    return execSync(`${bin} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function installNub(version: string): string {
  const pkg = `@nubjs/nub@${version}`;
  debug('installing %s into temp dir', pkg);
  const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  execSync(`npm install --prefix "${tmpDir}" ${pkg} --loglevel=error`, {
    encoding: 'utf8',
    timeout: 30000,
  });
  const bin = `${tmpDir}/node_modules/.bin/nub`;
  const installed = detectVersion(bin);
  debug('installed nub %s at %s', installed, bin);
  console.log(`  Auto-installed nub ${installed}`);
  return bin;
}

function resolveNubBin(binPath?: string, version?: string): string {
  if (binPath) return binPath;
  if (version) return installNub(version);
  return 'nub';
}

export function createNubAdapter(binPath?: string, version?: string): PackageManagerAdapter {
  const bin = resolveNubBin(binPath, version);
  const resolved = detectVersion(bin);
  debug('creating nub adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `nub@${resolved}`,
    type: 'nub',
    bin,
    supports: NUB_SUPPORTED_COMMANDS,

    registryArg(_url: string): string[] {
      // nub reads registry and _authToken from the .npmrc cascade written by
      // prepareProject, so no CLI flag is needed.
      return [];
    },

    prefixArg(folder: string): string[] {
      return ['--dir', folder];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      // nub enforces a strict 24h `minimumReleaseAge` by default and reads it
      // under the pnpm-style key, not npm's `min-release-age` that the harness
      // .npmrc sets. Disable it explicitly on install/ci so the just-published
      // fixtures (age ~0) resolve.
      const cmd = args[0];
      if (cmd === 'install' || cmd === 'ci') {
        args = [...args, '--minimum-release-age=0'];
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
      return prepareGenericEmptyProject(
        packageName,
        version,
        port,
        token,
        registryUrl,
        dependencies,
        devDependencies
      );
    },
  };

  return adapter;
}
