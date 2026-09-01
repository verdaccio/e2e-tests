import assert from 'assert';
import buildDebug from 'debug';

import { TestContext, TestDefinition } from '../types';
import { downloadTarball, fetchPackument } from '../utils/http-client';
import { MockUplink } from '../utils/mock-uplink';

const debug = buildDebug('verdaccio:e2e-cli:scenario:uplink-failure');

/**
 * Scenario: uplink-failure
 *
 * Verifies how the registry behaves when its uplink misbehaves. Requires the
 * registry to be configured with an uplink pointing at the mock uplink port
 * and a package pattern proxied to it (see `--print-config`):
 *
 *   uplinks:
 *     e2emock:
 *       url: http://localhost:<E2E_UPLINK_PORT>/
 *       timeout: 3s
 *       max_fails: 100
 *   packages:
 *     'e2e-uplink-*':
 *       access: $all
 *       proxy: e2emock
 *
 * The scenario starts its own HTTP server on that port and flips it between
 * modes:
 *   - healthy: packument + tarball proxied through, tarball URL rewritten
 *   - drop-mid-stream: uplink kills the socket halfway through a tarball —
 *     the client must not receive a "successful" corrupt download, and the
 *     tarball must be intact on retry (no poisoned cache)
 *   - down: previously fetched packages still served from cache; unknown
 *     packages fail cleanly; the registry stays alive
 *   - slow: uplink slower than the configured timeout — the registry gives up
 *     instead of hanging
 *
 * Gated on E2E_UPLINK_PORT being set (the harness exports it) so runs against
 * arbitrary registries skip it cleanly, and to the npm adapter so it runs once
 * per suite.
 */

function uplinkPort(): number {
  return parseInt(process.env.E2E_UPLINK_PORT || '', 10);
}

async function testUplinkFailure(ctx: TestContext): Promise<void> {
  const id = ctx.runId;
  const mock = new MockUplink(uplinkPort());
  const cachedPkg = `e2e-uplink-cached-${id}`;
  const cached = mock.addPackage(cachedPkg, 512 * 1024);

  await mock.start();
  try {
    await ctx.subTest('healthy uplink: packument and tarball proxied through', async () => {
      const { status, body } = await fetchPackument(ctx.registryUrl, cachedPkg);
      assert.strictEqual(status, 200, `Expected 200 proxying ${cachedPkg}, got ${status}`);
      assert.strictEqual(body.name, cachedPkg, 'Proxied packument name mismatch');
      const tarball: string = body.versions['1.0.0'].dist.tarball;
      assert.ok(
        tarball.startsWith(ctx.registryUrl),
        `Expected proxied dist.tarball rewritten to ${ctx.registryUrl}, got ${tarball}`
      );
      const download = await downloadTarball(tarball);
      assert.strictEqual(download.status, 200, 'Proxied tarball download failed');
      assert.strictEqual(download.sha1, cached.shasum, 'Proxied tarball bytes mismatch');
      assert.ok(mock.requests.length > 0, 'Expected the registry to hit the mock uplink');
    });

    await ctx.subTest('uplink drops connection mid-tarball', async () => {
      const droppedPkg = `e2e-uplink-dropped-${id}`;
      const dropped = mock.addPackage(droppedPkg, 512 * 1024);

      // Packument fetch is unaffected by drop-mid-stream (tarball route only).
      const { status, body } = await fetchPackument(ctx.registryUrl, droppedPkg);
      assert.strictEqual(status, 200, `Expected 200 for ${droppedPkg} packument`);
      const tarball: string = body.versions['1.0.0'].dist.tarball;

      mock.mode = 'drop-mid-stream';
      let sawCleanFailure = false;
      try {
        // The registry must terminate the client response promptly when its
        // uplink dies — a client left hanging is a bug, so cap the wait.
        const download = await downloadTarball(tarball, { signal: AbortSignal.timeout(15_000) });
        // A non-200, or a truncated/corrupt body, are both acceptable failures —
        // what must NOT happen is a "successful" download with wrong bytes
        // going undetected, so we check integrity ourselves.
        sawCleanFailure = download.status !== 200 || download.sha1 !== dropped.shasum;
        debug('drop-mid-stream download: status=%d bytes=%d', download.status, download.bytes);
      } catch (err) {
        assert.ok(
          (err as Error).name !== 'TimeoutError',
          'Registry left the client hanging after the uplink dropped mid-tarball ' +
            '(response never terminated within 15s)'
        );
        sawCleanFailure = true;
        debug('drop-mid-stream download rejected as expected: %s', err);
      }
      assert.ok(
        sawCleanFailure,
        'Expected the client download to fail while the uplink drops mid-stream'
      );

      // Back to healthy: the tarball must be intact (no partial tarball cached).
      mock.mode = 'ok';
      const retry = await downloadTarball(tarball);
      assert.strictEqual(retry.status, 200, 'Tarball download after uplink recovery failed');
      assert.strictEqual(
        retry.sha1,
        dropped.shasum,
        'Registry served a corrupt tarball after a mid-stream uplink failure (poisoned cache?)'
      );
    });

    await ctx.subTest('slow uplink hits the timeout instead of hanging', async () => {
      const slowPkg = `e2e-uplink-slow-${id}`;
      mock.addPackage(slowPkg);
      mock.mode = 'slow';
      const start = Date.now();
      const { status } = await fetchPackument(ctx.registryUrl, slowPkg);
      const elapsed = Date.now() - start;
      mock.mode = 'ok';
      assert.ok(status >= 400, `Expected an error status for a timed-out uplink, got ${status}`);
      // Configured uplink timeout is 3s with retry: 0 — anything close to the
      // mock's 10s answer means retries or timeouts are multiplying again
      // (the max_fails-as-retry-limit bug family).
      assert.ok(
        elapsed < 6_000,
        `Expected the registry to time out (~3s), but the request took ${elapsed}ms`
      );
    });

    await ctx.subTest('uplink responding 500: cache served, unknown fails cleanly', async () => {
      mock.mode = 'error-500';
      // The already-proxied package must keep working from cache.
      const cachedResp = await fetchPackument(ctx.registryUrl, cachedPkg);
      assert.strictEqual(
        cachedResp.status,
        200,
        `Expected cached packument for ${cachedPkg} while the uplink returns 500, got ${cachedResp.status}`
      );
      // An unknown package must fail cleanly, not crash or hang.
      const unknown = await fetchPackument(ctx.registryUrl, `e2e-uplink-500-missing-${id}`);
      assert.ok(
        unknown.status >= 400,
        `Expected a clean 4xx/5xx for an unknown package while the uplink returns 500, got ${unknown.status}`
      );
      const ping = await fetch(`${ctx.registryUrl}/-/ping`);
      assert.strictEqual(ping.status, 200, 'Registry stopped responding after uplink 500s');
      mock.mode = 'ok';
    });
  } finally {
    await mock.stop();
  }

  await ctx.subTest('uplink down: cached package still served', async () => {
    const { status, body } = await fetchPackument(ctx.registryUrl, cachedPkg);
    assert.strictEqual(
      status,
      200,
      `Expected cached packument for ${cachedPkg} while the uplink is down, got ${status}`
    );
    const tarball: string = body.versions['1.0.0'].dist.tarball;
    const download = await downloadTarball(tarball);
    assert.strictEqual(download.status, 200, 'Cached tarball not served while uplink is down');
    assert.strictEqual(download.sha1, cached.shasum, 'Cached tarball bytes mismatch');
  });

  await ctx.subTest('uplink down: unknown package fails cleanly', async () => {
    const { status } = await fetchPackument(ctx.registryUrl, `e2e-uplink-missing-${id}`);
    assert.ok(
      status >= 400,
      `Expected a clean 4xx/5xx for an unknown package with the uplink down, got ${status}`
    );
    const ping = await fetch(`${ctx.registryUrl}/-/ping`);
    assert.strictEqual(ping.status, 200, 'Registry stopped responding after uplink failures');
  });
}

export const uplinkFailureScenario: TestDefinition = {
  name: 'scenario:uplink-failure',
  // Needs the harness-provided uplink config; skipped cleanly otherwise.
  appliesTo: (adapter) => adapter.type === 'npm' && Number.isFinite(uplinkPort()),
  timeout: 120_000,
  run: testUplinkFailure,
};
