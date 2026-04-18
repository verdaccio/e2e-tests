import { SpawnOptions, execSync } from 'child_process';
import buildDebug from 'debug';
import { writeFile } from 'fs/promises';
import YAML from 'js-yaml';
import { join } from 'path';
import { URL } from 'url';

import { ExecOutput, PackageManagerAdapter } from '../types';
import { exec } from '../utils/process';
import { createTempFolder, getPackageJSON, getREADME } from '../utils/project';

const debug = buildDebug('verdaccio:e2e-cli:yarn-modern');

const YARN_MODERN_SUPPORTED_COMMANDS = new Set(['publish', 'install', 'info', 'ping', 'deprecate', 'login']);

const YARN_ENV = {
  COREPACK_ENABLE_STRICT: '0',
  YARN_IGNORE_PATH: '1',
};

function detectVersion(bin: string): string {
  try {
    return execSync(`${bin} --version`, {
      env: { ...process.env, ...YARN_ENV },
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

function installYarnModern(version = '4'): string {
  const pkg = `@yarnpkg/cli-dist@${version}`;
  debug('installing %s into temp dir', pkg);
  const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  execSync(`npm install --prefix "${tmpDir}" ${pkg} --loglevel=error`, {
    encoding: 'utf8',
    timeout: 30000,
  });
  const bin = `${tmpDir}/node_modules/@yarnpkg/cli-dist/bin/yarn.js`;
  const installed = detectVersion(bin);
  debug('installed yarn modern %s at %s', installed, bin);
  console.log(`  Auto-installed yarn modern ${installed}`);
  return bin;
}

function resolveYarnBin(binPath?: string, version?: string): string {
  if (binPath) return binPath;

  if (version) {
    return installYarnModern(version);
  }

  try {
    const systemYarn = execSync('which yarn', { encoding: 'utf8', timeout: 5000 }).trim();
    const sysVersion = detectVersion(systemYarn);
    const major = parseInt(sysVersion.split('.')[0], 10);
    if (major >= 2) {
      debug('using system yarn Berry %s', sysVersion);
      return systemYarn;
    }
    debug('system yarn is Classic %s, auto-installing Berry', sysVersion);
  } catch {
    debug('no system yarn found, auto-installing Berry');
  }

  return installYarnModern();
}

function createYamlConfig(registry: string, token?: string) {
  const defaultYaml: any = {
    npmRegistryServer: registry,
    enableImmutableInstalls: false,
    unsafeHttpWhitelist: ['localhost'],
  };

  if (typeof token === 'string') {
    const url = new URL(registry);
    defaultYaml.npmRegistries = {
      [registry]: {
        npmAlwaysAuth: true,
        npmAuthToken: token,
      },
    };
  }

  return YAML.dump(defaultYaml);
}

export function createYarnModernAdapter(binPath?: string, version?: string): PackageManagerAdapter {
  const bin = resolveYarnBin(binPath, version);
  const resolved = detectVersion(bin);
  debug('creating yarn modern adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `yarn-modern@${resolved}`,
    type: 'yarn-modern',
    bin,
    supports: YARN_MODERN_SUPPORTED_COMMANDS,

    registryArg(_url: string): string[] {
      return [];
    },

    prefixArg(_folder: string): string[] {
      return [];
    },

    exec(options: SpawnOptions, ...args: string[]): Promise<ExecOutput> {
      const env = { ...process.env, ...options.env, ...YARN_ENV };

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
      } else if (cmd === 'ping') {
        const filtered = args.slice(1).filter(
          (a) => !a.startsWith('--registry')
        );
        yarnArgs = ['npm', 'ping', ...filtered];
      } else if (cmd === 'deprecate') {
        const filtered = args.slice(1).filter(
          (a) => !a.startsWith('--registry')
        );
        yarnArgs = ['npm', 'deprecate', ...filtered];
      } else if (cmd === 'login') {
        const filtered = args.slice(1).filter(
          (a) => !a.startsWith('--registry')
        );
        yarnArgs = ['npm', 'login', ...filtered];
      } else if (cmd === 'whoami') {
        const filtered = args.slice(1).filter(
          (a) => !a.startsWith('--registry')
        );
        yarnArgs = ['npm', 'whoami', ...filtered];
      } else {
        yarnArgs = args.filter((a) => !a.startsWith('--registry'));
      }

      return exec({ ...options, env }, bin, yarnArgs);
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

    async importPlugin(cwd: string, pluginName: string): Promise<void> {
      debug('downloading %s plugin bundle', pluginName);
      const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
      const pkg = `@verdaccio/yarn-plugin-${pluginName}`;
      execSync(`npm pack ${pkg} --pack-destination "${tmpDir}"`, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: 'pipe',
      });
      execSync(`tar xzf "${tmpDir}"/*.tgz -C "${tmpDir}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const bundlePath = join(tmpDir, `package/bundles/@yarnpkg/plugin-${pluginName}.js`);
      debug('importing plugin from %s into %s', bundlePath, cwd);
      await exec({ cwd, env: { ...process.env, ...YARN_ENV } }, bin, [
        'plugin',
        'import',
        bundlePath,
      ]);
    },
  };

  return adapter;
}
