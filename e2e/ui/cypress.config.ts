import { defineConfig } from 'cypress';
import { addRegistry, prepareGenericEmptyProject } from '@verdaccio/test-cli-commons';
import {npm} from './utils';

export default defineConfig({
  e2e: {
    setupNodeEvents(on) {
      on('task', {
        async publishScoped({ pkgName }) {
          // TODO: this is failing on publish
          const { tempFolder } = await prepareGenericEmptyProject(
            pkgName,
            '1.0.6',
            4873,
            null,
            'http://localhost:4873'
          );
          await npm(
            { cwd: tempFolder },
            'publish',
            '--json',
            ...addRegistry('http://localhost:4873')
          );
          // const scopedPackageMetadata = generatePackageMetadata(pkgName, '1.0.6');
          // const server = new ServerQuery(registry1.getRegistryUrl());
          // server.putPackage(scopedPackageMetadata.name, scopedPackageMetadata, {}).then(() => {});
          // return null;
        },
        registry() {
          return {
            registryUrl: 'http://localhost:4873',
            port: 4873,
          };
        },
      });
    },
  },
});
