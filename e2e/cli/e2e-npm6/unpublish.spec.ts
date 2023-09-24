import fs from 'fs';
import path from 'path';

import { addRegistry, initialSetup, prepareGenericEmptyProject } from '@verdaccio/test-cli-commons';

import { npm } from './utils';

describe('unpublish a package', () => {
  jest.setTimeout(20000);
  let registry;
  let registryStorageFolder;

  beforeAll(async () => {
    const setup = await initialSetup();
    registry = setup.registry;
    await registry.init();
    registryStorageFolder = setup.tempFolder;
  });

  test.each(['foo-memory', '@scope/foo-memory'])(
    'should unpublish a package %s',
    async (pkgName) => {
      const { tempFolder } = await prepareGenericEmptyProject(
        pkgName,
        '1.0.0-patch',
        registry.port,
        registry.getToken(),
        registry.getRegistryUrl()
      );

      const resp = await npm(
        { cwd: tempFolder },
        'publish',
        '--json',
        ...addRegistry(registry.getRegistryUrl())
      );
      const parsedBody = JSON.parse(resp.stdout as string);
      expect(parsedBody.name).toEqual(pkgName);
      expect(parsedBody.files).toBeDefined();
      expect(parsedBody.files).toBeDefined();

      await npm(
        { cwd: tempFolder },
        'unpublish',
        '--json',
        '--force',
        ...addRegistry(registry.getRegistryUrl())
      );
      const pkgFolder = fs.existsSync(path.join(registryStorageFolder, 'storage', pkgName));
      expect(pkgFolder).toBeFalsy();
    }
  );

  afterAll(async () => {
    registry.stop();
  });
});
