import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { prepareGenericEmptyProject } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:npm');

const NPM_SUPPORTED_COMMANDS = new Set([
  'publish',
  'unpublish',
  'install',
  'info',
  'audit',
  'deprecate',
  'dist-tag',
  'ping',
  'search',
  'star',
  'stars',
  'unstar',
]);

function detectVersion(bin: string): string {
  try {
    return execSync(`${bin} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function installNpm(version: string): string {
  const pkg = `npm@${version}`;
  debug('installing %s into temp dir', pkg);
  const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  execSync(`npm install --prefix "${tmpDir}" ${pkg} --loglevel=error`, {
    encoding: 'utf8',
    timeout: 30000,
  });
  const bin = `${tmpDir}/node_modules/.bin/npm`;
  const installed = detectVersion(bin);
  debug('installed npm %s at %s', installed, bin);
  console.log(`  Auto-installed npm ${installed}`);
  return bin;
}

function resolveNpmBin(binPath?: string, version?: string): string {
  if (binPath) return binPath;
  if (version) return installNpm(version);
  return 'npm';
}

export function createNpmAdapter(binPath?: string, version?: string): PackageManagerAdapter {
  const bin = resolveNpmBin(binPath, version);
  const resolved = detectVersion(bin);
  debug('creating npm adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `npm@${resolved}`,
    type: 'npm',
    bin,
    supports: NPM_SUPPORTED_COMMANDS,

    registryArg(url: string): string[] {
      return ['--registry', url];
    },

    prefixArg(folder: string): string[] {
      return ['--prefix', folder];
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
