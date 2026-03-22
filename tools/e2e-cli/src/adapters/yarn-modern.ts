import { SpawnOptions } from 'child_process';
import buildDebug from 'debug';
import { cp, writeFile } from 'fs/promises';
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
    yarnPath: '.yarn/releases/yarn.js',
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
      // yarn modern uses .yarnrc.yml, not CLI flags
      return [];
    },

    prefixArg(_folder: string): string[] {
      // yarn modern uses cwd from SpawnOptions
      return [];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      // yarn modern: the binary is inside the project folder
      const projectFolder = options.cwd as string;
      const yarnBin = join(projectFolder, '.yarn/releases/yarn.js');
      return exec(options, yarnBin, args);
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
      await cp(binPath, join(tempFolder, '.yarn/releases/yarn.js'), {
        dereference: true,
        recursive: true,
      });
      return { tempFolder };
    },
  };

  return adapter;
}
