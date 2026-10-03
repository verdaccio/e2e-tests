import assert from 'assert';

import { TestContext, TestDefinition } from '../types';
import { downloadTarball, fetchPackument } from '../utils/http-client';
import { pendingContractChecksEnabled } from '../utils/pending-checks';
import { publishViaHttp } from '../utils/publish';

async function testPackageNames(ctx: TestContext): Promise<void> {
  const id = ctx.runId;
  // Valid for existing packages, though some clients refuse to publish them (capitals).
  const installable = [`JSONStream-${id}`, `@e2e-names/_x-${id}`, `@con/x-${id}`];

  await ctx.subTest('unusual valid names are published and served', async () => {
    // A leading hyphen is valid for existing packages but npm clients no longer parse it.
    for (const name of [...installable, `-x-${id}`]) {
      await publishViaHttp(ctx, name);
      const { status, body } = await fetchPackument(ctx.registryUrl, name);
      assert.strictEqual(status, 200, `Expected 200 for ${name}, got ${status}`);
      assert.strictEqual(body.name, name, `Packument name mismatch for ${name}`);
      const download = await downloadTarball(body.versions['1.0.0'].dist.tarball);
      assert.strictEqual(download.status, 200, `Tarball download failed for ${name}`);
    }
  });

  if (ctx.adapter.supports.has('install')) {
    await ctx.subTest('unusual valid names install with the client', async () => {
      const { tempFolder } = await ctx.adapter.prepareProject(
        `e2e-names-consumer-${id}`,
        '1.0.0',
        ctx.registryUrl,
        ctx.port,
        ctx.token,
        Object.fromEntries(installable.map((name) => [name, '1.0.0']))
      );
      await ctx.adapter.exec(
        { cwd: tempFolder },
        'install',
        ...ctx.adapter.registryArg(ctx.registryUrl)
      );
    });
  }

  if (pendingContractChecksEnabled('package-names')) {
    await ctx.subTest('names npm does not accept are rejected', async () => {
      for (const name of [`_x-${id}`, `@x-${id}`, `x-${id}@y`]) {
        const response = await fetch(`${ctx.registryUrl}/${encodeURIComponent(name)}`);
        assert.strictEqual(
          response.status,
          400,
          `Expected 400 for ${name}, got ${response.status}`
        );
      }
    });
  }
}

export const packageNamesTest: TestDefinition = {
  name: 'package-names',
  run: testPackageNames,
};
