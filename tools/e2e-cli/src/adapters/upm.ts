import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { prepareGenericEmptyProject } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:upm');

// upm (https://upm.sh) proxies most commands straight to npm (publish, info,
// deprecate, dist-tag, ping, search, unpublish…). Only its resolver/installer
// is upm's own code, so the suite exercises just those native commands.
const UPM_SUPPORTED_COMMANDS = new Set(['install', 'ci']);

function detectVersion(bin: string): string {
  try {
    return execSync(`${bin} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function installUpm(version: string): string {
  const pkg = `upm@${version}`;
  debug('installing %s into temp dir', pkg);
  const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  execSync(`npm install --prefix "${tmpDir}" ${pkg} --loglevel=error`, {
    encoding: 'utf8',
    timeout: 30000,
  });
  const bin = `${tmpDir}/node_modules/.bin/upm`;
  const installed = detectVersion(bin);
  debug('installed upm %s at %s', installed, bin);
  console.log(`  Auto-installed upm ${installed}`);
  return bin;
}

function resolveUpmBin(binPath?: string, version?: string): string {
  if (binPath) return binPath;
  if (version) return installUpm(version);
  return 'upm';
}

export function createUpmAdapter(binPath?: string, version?: string): PackageManagerAdapter {
  const bin = resolveUpmBin(binPath, version);
  const resolved = detectVersion(bin);
  debug('creating upm adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `upm@${resolved}`,
    type: 'upm',
    bin,
    supports: UPM_SUPPORTED_COMMANDS,

    registryArg(_url: string): string[] {
      // upm reads registry, _authToken and min-release-age from .npmrc (written
      // by prepareProject). min-release-age=0 is essential: upm holds back
      // versions younger than a day by default, which would reject the
      // just-published fixtures the suite installs.
      return [];
    },

    prefixArg(folder: string): string[] {
      return ['--dir', folder];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
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
