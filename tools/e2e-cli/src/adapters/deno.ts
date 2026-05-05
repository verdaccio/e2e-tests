import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { prepareGenericEmptyProject } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:deno');

const DENO_SUPPORTED_COMMANDS = new Set(['install', 'info']);

function detectVersion(bin: string): string {
  try {
    const output = execSync(`${bin} --version`, { encoding: 'utf8', timeout: 5000 });
    const match = output.match(/deno (\S+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolveDenoBin(binPath?: string): string {
  if (binPath) return binPath;
  return 'deno';
}

export function createDenoAdapter(binPath?: string, _version?: string): PackageManagerAdapter {
  const bin = resolveDenoBin(binPath);
  const resolved = detectVersion(bin);
  debug('creating deno adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `deno@${resolved}`,
    type: 'deno',
    bin,
    supports: DENO_SUPPORTED_COMMANDS,

    registryArg(_url: string): string[] {
      // deno reads the registry from .npmrc (written by prepareProject), no CLI flag needed
      return [];
    },

    prefixArg(folder: string): string[] {
      return ['--root', folder];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      const cmd = args[0];

      if (cmd === 'info') {
        // deno info npm:<pkg> --node-modules-dir=auto
        const pkgName = args[1];
        const filteredArgs = ['info', `npm:${pkgName}`, '--node-modules-dir=auto'].concat(
          args.slice(2).filter((a) => a !== '--json')
        );
        return exec(options, bin, filteredArgs);
      }

      if (cmd === 'install') {
        // deno install — reads registry from .npmrc, no extra flags needed
        return exec(options, bin, ['install']);
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
