import { SpawnOptions } from 'child_process';
import buildDebug from 'debug';
import { join } from 'path';

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

export function createNpmAdapter(binPath?: string): PackageManagerAdapter {
  const bin = binPath || 'npm';
  debug('creating npm adapter with bin: %s', bin);

  const adapter: PackageManagerAdapter = {
    name: `npm`,
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
