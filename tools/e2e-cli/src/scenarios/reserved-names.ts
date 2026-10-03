import assert from 'assert';

import { TestContext, TestDefinition } from '../types';
import { downloadTarball, fetchPackument } from '../utils/http-client';
import { MockUplink } from '../utils/mock-uplink';
import { pendingContractChecksEnabled } from '../utils/pending-checks';
import { buildPackageTarball, publishViaHttp } from '../utils/publish';

/**
 * Scenario: reserved-names
 *
 * Packages named like Windows device names (`nul`, `con`, `aux`, with or without
 * an extension) exist on npmjs. The registry must proxy and install them, and stay
 * healthy when they are requested with the uplink down or published locally. Uses
 * the `nul.*` and `@e2e-uplink/*` patterns of the battery config (see `--print-config`).
 */
function uplinkPort(): number {
  return parseInt(process.env.E2E_UPLINK_PORT || '', 10);
}

async function expectRegistryAlive(ctx: TestContext): Promise<void> {
  const ping = await fetch(`${ctx.registryUrl}/-/ping`);
  assert.strictEqual(ping.status, 200, 'Registry stopped responding');
}

async function testReservedNames(ctx: TestContext): Promise<void> {
  const id = ctx.runId;
  const proxied = [`nul.${id}`, `@e2e-uplink/con.${id}`];
  const mock = new MockUplink(uplinkPort());
  const packages = proxied.map((name) => mock.addPackage(name, buildPackageTarball(name, '1.0.0')));

  await mock.start();
  try {
    await ctx.subTest('reserved device names are proxied from the uplink', async () => {
      for (const pkg of packages) {
        const { status, body } = await fetchPackument(ctx.registryUrl, pkg.name);
        assert.strictEqual(status, 200, `Expected 200 proxying ${pkg.name}, got ${status}`);
        assert.strictEqual(body.name, pkg.name, `Proxied packument name mismatch for ${pkg.name}`);
      }
    });

    if (pendingContractChecksEnabled('reserved-names')) {
      await ctx.subTest('reserved device name tarballs are proxied', async () => {
        for (const pkg of packages) {
          const { body } = await fetchPackument(ctx.registryUrl, pkg.name);
          const download = await downloadTarball(body.versions['1.0.0'].dist.tarball);
          assert.strictEqual(download.status, 200, `Proxied tarball failed for ${pkg.name}`);
          assert.strictEqual(
            download.sha1,
            pkg.shasum,
            `Proxied tarball bytes mismatch for ${pkg.name}`
          );
        }
      });

      await ctx.subTest('reserved device names install with the client', async () => {
        const { tempFolder } = await ctx.adapter.prepareProject(
          `e2e-reserved-consumer-${id}`,
          '1.0.0',
          ctx.registryUrl,
          ctx.port,
          ctx.token,
          Object.fromEntries(proxied.map((name) => [name, '1.0.0']))
        );
        await ctx.adapter.exec(
          { cwd: tempFolder },
          'install',
          ...ctx.adapter.registryArg(ctx.registryUrl)
        );
      });
    }
  } finally {
    await mock.stop();
  }

  await ctx.subTest('uplink down: reserved device names fail cleanly', async () => {
    // Served from the local cache (200) or not cached for these names (404), never a 5xx.
    for (const name of proxied) {
      const { status } = await fetchPackument(ctx.registryUrl, name);
      assert.ok([200, 404].includes(status), `Expected 200 or 404 for ${name}, got ${status}`);
    }
    await expectRegistryAlive(ctx);
  });

  if (pendingContractChecksEnabled('reserved-names')) {
    await ctx.subTest('publishing a reserved device name keeps the registry healthy', async () => {
      const name = `aux.${id}`;
      let published = true;
      try {
        await publishViaHttp(ctx, name);
      } catch (err) {
        // Registries whose storage has no folder for such a name refuse it with a 404.
        published = false;
        assert.match(String(err), / 404 /, `Expected a 404 refusal for ${name}, got ${err}`);
      }
      if (published) {
        const { status, body } = await fetchPackument(ctx.registryUrl, name);
        assert.strictEqual(status, 200, `Expected 200 for published ${name}, got ${status}`);
        assert.strictEqual(body.name, name, `Packument name mismatch for ${name}`);
      }
      await expectRegistryAlive(ctx);
    });
  }
}

export const reservedNamesScenario: TestDefinition = {
  name: 'scenario:reserved-names',
  // Needs the harness-provided uplink config; skipped cleanly otherwise.
  appliesTo: (adapter) => adapter.type === 'npm' && Number.isFinite(uplinkPort()),
  timeout: 60_000,
  run: testReservedNames,
};
