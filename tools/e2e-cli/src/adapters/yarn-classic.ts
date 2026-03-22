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
      env: { ...process.env, COREPACK_ENABLE_STRICT: '0', YARN_IGNORE_PATH: '1' },
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

function installYarnClassic(version = '1'): string {
  const pkg = version.startsWith('1') ? `yarn@${version}` : `yarn@1`;
  debug('installing %s into temp dir', pkg);
  const tmpDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  execSync(`npm install --prefix "${tmpDir}" ${pkg} --loglevel=error`, {
    encoding: 'utf8',
    timeout: 30000,
  });
  const bin = `${tmpDir}/node_modules/.bin/yarn`;
  const installed = detectYarnVersion(bin);
  debug('installed yarn %s at %s', installed, bin);
  console.log(`  Auto-installed yarn classic ${installed}`);
  return bin;
}

function resolveYarnClassicBin(binPath?: string, version?: string): string {
  if (binPath) return binPath;

  // Always install the requested version to ensure reproducibility
  if (version) {
    return installYarnClassic(version);
  }

  // Check if system yarn is 1.x
  try {
    const systemYarn = execSync('which yarn', { encoding: 'utf8', timeout: 5000 }).trim();
    const sysVersion = detectYarnVersion(systemYarn);
    const major = sysVersion.split('.')[0];
    if (major === '1') {
      debug('using system yarn classic %s', sysVersion);
      return systemYarn;
    }
    debug('system yarn is Berry %s, auto-installing classic', sysVersion);
  } catch {
    debug('no system yarn found, auto-installing classic');
  }

  return installYarnClassic();
}

export function createYarnClassicAdapter(binPath?: string, version?: string): PackageManagerAdapter {
  const bin = resolveYarnClassicBin(binPath, version);
  const resolved = detectYarnVersion(bin);
  debug('creating yarn classic adapter with bin: %s (%s)', bin, resolved);

  const adapter: PackageManagerAdapter = {
    name: `yarn-classic@${resolved}`,
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
      const env = {
        ...process.env,
        ...options.env,
        COREPACK_ENABLE_STRICT: '0',
        YARN_IGNORE_PATH: '1',
      };
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
