import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { prepareGenericEmptyProject } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:yarn-classic');

const YARN_CLASSIC_SUPPORTED_COMMANDS = new Set([
  'publish',
  'install',
  'info',
  'audit',
]);

function detectYarnVersion(bin: string): string {
  try {
    return execSync(`${bin} --version`, {
      env: { ...process.env, COREPACK_ENABLE_STRICT: '0' },
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function createYarnClassicAdapter(binPath?: string): PackageManagerAdapter {
  const bin = binPath || 'yarn';
  debug('creating yarn classic adapter with bin: %s', bin);

  const version = detectYarnVersion(bin);
  const major = version.split('.')[0];
  if (major !== '1') {
    throw new Error(
      `yarn-classic requires Yarn 1.x but found ${version}. ` +
        `Your system yarn is Berry (v${version}). ` +
        `Use --pm yarn-modern instead, or install Yarn Classic 1.x.`
    );
  }

  const adapter: PackageManagerAdapter = {
    name: `yarn-classic`,
    type: 'yarn-classic',
    bin,
    supports: YARN_CLASSIC_SUPPORTED_COMMANDS,

    registryArg(url: string): string[] {
      return ['--registry', url];
    },

    prefixArg(folder: string): string[] {
      return ['--cwd', folder];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      const env = { ...process.env, ...options.env, COREPACK_ENABLE_STRICT: '0' };
      return exec({ ...options, env }, bin, args);
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
