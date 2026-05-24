import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { prepareGenericEmptyProject } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:bun');

const BUN_SUPPORTED_COMMANDS = new Set(['publish', 'install', 'info', 'audit']);

function detectVersion(bin: string): string {
  try {
    return execSync(`${bin} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveBunBin(binPath?: string): string {
  if (binPath) return binPath;
  return 'bun';
}

export function createBunAdapter(binPath?: string, _version?: string): PackageManagerAdapter {
  const bin = resolveBunBin(binPath);
  const resolved = detectVersion(bin);
  debug('creating bun adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `bun@${resolved}`,
    type: 'bun',
    bin,
    supports: BUN_SUPPORTED_COMMANDS,

    registryArg(url: string): string[] {
      return ['--registry', url];
    },

    prefixArg(folder: string): string[] {
      return ['--cwd', folder];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      const cmd = args[0];

      if (cmd === 'info') {
        // bun info <pkg> reads registry from .npmrc, strip --registry <url>
        const pkgName = args[1];
        const filteredArgs = args.slice(2).filter((a) => a !== '--registry');
        // also remove the URL that follows --registry
        const cleaned = filteredArgs.filter((a) => !a.startsWith('http'));
        return exec(options, bin, ['info', pkgName, ...cleaned]);
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
