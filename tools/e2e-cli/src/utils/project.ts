import buildDebug from 'debug';
import { mkdirSync } from 'fs';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const debug = buildDebug('verdaccio:e2e-cli:project');

export async function createTempFolder(prefix: string): Promise<string> {
  const sanitized = prefix.replace(/[^a-zA-Z0-9-_]/g, '-');
  debug('creating temp folder %o', sanitized);
  return mkdtemp(join(tmpdir(), `verdaccio-e2e-${sanitized}-`));
}

export function getPackageJSON(
  packageName: string,
  version = '1.0.0',
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {}
): string {
  debug('creating package.json %o', packageName);
  const json = {
    name: packageName,
    version,
    description: 'some cool project',
    main: 'index.js',
    scripts: {
      test: 'echo exit 1',
    },
    dependencies,
    devDependencies,
    keywords: ['foo', 'bar'],
    author: 'Verdaccio E2E <verdaccio@example.org>',
    license: 'MIT',
  };
  return JSON.stringify(json);
}

export function getREADME(packageName: string): string {
  return `
   # My README ${packageName}

   some text

   ## subtitle

   more text
  `;
}

export async function prepareGenericEmptyProject(
  packageName: string,
  version: string,
  port: number,
  token: string,
  registryDomain: string,
  dependencies: Record<string, string> = {},
  devDependencies: Record<string, string> = {}
): Promise<{ tempFolder: string }> {
  debug('preparing generic project %o', packageName);
  const getNPMrc = (port: number, token: string, registry: string) =>
    `//localhost:${port}/:_authToken=${token}\nregistry=${registry}`;
  const tempFolder = await createTempFolder('temp-folder');
  await writeFile(
    join(tempFolder, 'package.json'),
    getPackageJSON(packageName, version, dependencies, devDependencies)
  );
  await writeFile(join(tempFolder, 'README.md'), getREADME(packageName));
  await writeFile(join(tempFolder, '.npmrc'), getNPMrc(port, token, registryDomain));
  return { tempFolder };
}
