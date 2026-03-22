import { SpawnOptions } from 'child_process';
import buildDebug from 'debug';
import { writeFile } from 'fs/promises';
import YAML from 'js-yaml';
import { join } from 'path';
import { URL } from 'url';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { createTempFolder, getPackageJSON, getREADME } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:yarn-modern');

const YARN_MODERN_SUPPORTED_COMMANDS = new Set(['publish', 'install', 'info']);

function createYamlConfig(registry: string, token?: string) {
  const defaultYaml: any = {
    npmRegistryServer: registry,
    enableImmutableInstalls: false,
    unsafeHttpWhitelist: ['localhost'],
  };

  if (typeof token === 'string') {
    const url = new URL(registry);
    defaultYaml.npmRegistries = {
      [`//${url.hostname}:${url.port}`]: {
        npmAlwaysAuth: true,
        npmAuthToken: token,
      },
    };
  }

  return YAML.dump(defaultYaml);
}

export function createYarnModernAdapter(binPath: string): PackageManagerAdapter {
  debug('creating yarn modern adapter with bin: %s', binPath);

  const adapter: PackageManagerAdapter = {
    name: `yarn-modern`,
    type: 'yarn-modern',
    bin: binPath,
    supports: YARN_MODERN_SUPPORTED_COMMANDS,

    registryArg(_url: string): string[] {
      return [];
    },

    prefixArg(_folder: string): string[] {
      return [];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      // Disable corepack strict mode so it doesn't enforce the root packageManager field
      const env = { ...process.env, ...options.env, COREPACK_ENABLE_STRICT: '0' };

      const cmd = args[0];
      let yarnArgs: string[];
      if (cmd === 'publish') {
        const filtered = args.slice(1).filter(
          (a) => a !== '--json' && !a.startsWith('--registry')
        );
        yarnArgs = ['npm', 'publish', ...filtered];
      } else if (cmd === 'info') {
        const filtered = args.slice(1).filter((a) => !a.startsWith('--registry'));
        yarnArgs = ['npm', 'info', ...filtered];
      } else {
        yarnArgs = args.filter((a) => !a.startsWith('--registry'));
      }

      return exec({ ...options, env }, binPath, yarnArgs);
    },

    async prepareProject(
      packageName: string,
      version: string,
      registryUrl: string,
      _port: number,
      token: string,
      dependencies: Record<string, string> = {},
      devDependencies: Record<string, string> = {}
    ): Promise<{ tempFolder: string }> {
      const tempFolder = await createTempFolder(packageName);
      const yamlContent = createYamlConfig(registryUrl, token);
      await writeFile(join(tempFolder, '.yarnrc.yml'), yamlContent);
      await writeFile(
        join(tempFolder, 'package.json'),
        getPackageJSON(packageName, version, dependencies, devDependencies)
      );
      await writeFile(join(tempFolder, 'README.md'), getREADME(packageName));
      return { tempFolder };
    },
  };

  return adapter;
}
