import assert from 'assert';

import { TestContext, TestDefinition } from '../types';
import { downloadTarball, fetchPackument } from '../utils/http-client';
import { MockUplink } from '../utils/mock-uplink';
import { pendingContractChecksEnabled } from '../utils/pending-checks';
import { trace } from '../utils/process';
import { buildPackageTarball } from '../utils/publish';

/**
 * Scenario: tarball-disconnect
 *
 * A client that hangs up in the middle of a tarball download must not leave the
 * registry holding the uplink request: an interrupted `npm install` would
 * otherwise keep a connection (and a partial cache file) alive per download.
 *
 * Black-box: the scenario owns both ends of the registry. The mock uplink sends
 * half a tarball and then waits, the client drops its connection, and the mock
 * observes whether the registry closes the uplink request it had open.
 *
 *   - the registry cancels the uplink request right after the client leaves
 *   - the same holds for several clients leaving at once
 *   - the interrupted tarball is not cached truncated: the next download and a
 *     real install get the complete package, fetched again from the uplink
 *
 * A registry without the fix only lets go when its own uplink timeout fires
 * (3s in the `--print-config` config), so the cancellation is asserted well
 * under that (E2E_DISCONNECT_BUDGET_MS, default 1500).
 *
 * On demand: not every registry line carries the fix, so it only runs with
 * E2E_PENDING_CONTRACT_CHECKS=tarball-disconnect (or `true`). It needs the same
 * harness config as scenario:uplink-failure (`e2emock` uplink on E2E_UPLINK_PORT
 * proxying `e2e-uplink-*`), and is gated to the npm adapter to run once per suite.
 */

const CANCEL_BUDGET_MS = parseInt(process.env.E2E_DISCONNECT_BUDGET_MS || '1500', 10);
const PARALLEL_CLIENTS = 5;

function uplinkPort(): number {
  return parseInt(process.env.E2E_UPLINK_PORT || '', 10);
}

async function proxiedTarballUrl(ctx: TestContext, pkgName: string): Promise<string> {
  const { status, body } = await fetchPackument(ctx.registryUrl, pkgName);
  assert.strictEqual(status, 200, `Expected 200 proxying ${pkgName}, got ${status}`);
  return body.versions['1.0.0'].dist.tarball;
}

/** Download until the first body bytes arrive, then drop the connection. Returns when it was dropped. */
async function downloadAndDisconnect(tarballUrl: string): Promise<number> {
  const controller = new AbortController();
  let disconnectedAt = 0;
  try {
    await downloadTarball(tarballUrl, {
      signal: controller.signal,
      onFirstChunk: () => {
        disconnectedAt = Date.now();
        controller.abort();
      },
    });
  } catch (err) {
    trace('client disconnected: %s', err instanceof Error ? err.message : err);
  }
  assert.ok(disconnectedAt > 0, `The registry sent no tarball bytes for ${tarballUrl}`);
  return disconnectedAt;
}

/** Milliseconds between the client leaving and the registry closing its uplink request. */
async function uplinkCancelDelay(
  mock: MockUplink,
  pkgName: string,
  disconnectedAt: number
): Promise<number> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const closed = mock.stalledClosed.find((entry) => entry.url.includes(pkgName));
    if (closed) {
      return closed.closedAt - disconnectedAt;
    }
    assert.ok(
      Date.now() < deadline,
      `The registry kept the uplink request for ${pkgName} open 10s after the client left`
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function assertCancelledPromptly(pkgName: string, delay: number): void {
  assert.ok(
    delay < CANCEL_BUDGET_MS,
    `The registry held the uplink request for ${pkgName} ${delay}ms after the client left ` +
      `(budget ${CANCEL_BUDGET_MS}ms): it waited for its uplink timeout instead of cancelling`
  );
}

async function testTarballDisconnect(ctx: TestContext): Promise<void> {
  const id = ctx.runId;
  const mock = new MockUplink(uplinkPort());
  const interruptedPkg = `e2e-uplink-disconnect-${id}`;
  // a real (installable) tarball: the last sub-test installs it with the package manager
  const interrupted = mock.addPackage(interruptedPkg, buildPackageTarball(interruptedPkg, '1.0.0'));
  const tarballRequests = (): number =>
    mock.requests.filter((url) => url.includes(interruptedPkg) && url.endsWith('.tgz')).length;

  await mock.start();
  try {
    await ctx.subTest('healthy uplink: a proxied download completes', async () => {
      const pkgName = `e2e-uplink-disconnect-ok-${id}`;
      const pkg = mock.addPackage(pkgName, 512 * 1024);
      const download = await downloadTarball(await proxiedTarballUrl(ctx, pkgName));
      assert.strictEqual(download.status, 200, 'Proxied tarball download failed');
      assert.strictEqual(download.sha1, pkg.shasum, 'Proxied tarball bytes mismatch');
    });

    const tarballUrl = await proxiedTarballUrl(ctx, interruptedPkg);

    await ctx.subTest(
      'client disconnects mid-download: the uplink request is cancelled',
      async () => {
        mock.mode = 'stall-mid-stream';
        const disconnectedAt = await downloadAndDisconnect(tarballUrl);
        const delay = await uplinkCancelDelay(mock, interruptedPkg, disconnectedAt);
        trace('uplink request for %s closed %dms after the client left', interruptedPkg, delay);
        assertCancelledPromptly(interruptedPkg, delay);
        assert.strictEqual(tarballRequests(), 1, 'Expected a single uplink request so far');
      }
    );

    await ctx.subTest(
      `${PARALLEL_CLIENTS} clients disconnecting: every uplink request is cancelled`,
      async () => {
        const names = Array.from(
          { length: PARALLEL_CLIENTS },
          (_, index) => `e2e-uplink-disconnect-${index}-${id}`
        );
        mock.mode = 'ok';
        names.forEach((name) => mock.addPackage(name, 1024 * 1024));
        const urls = await Promise.all(names.map((name) => proxiedTarballUrl(ctx, name)));
        mock.mode = 'stall-mid-stream';
        const delays = await Promise.all(
          names.map(async (name, index) =>
            uplinkCancelDelay(mock, name, await downloadAndDisconnect(urls[index]))
          )
        );
        trace('uplink requests closed after %j ms', delays);
        names.forEach((name, index) => assertCancelledPromptly(name, delays[index]));
      }
    );

    await ctx.subTest('the interrupted tarball is complete on the next download', async () => {
      mock.mode = 'ok';
      const download = await downloadTarball(tarballUrl);
      trace('download after the interruption → %d bytes=%d', download.status, download.bytes);
      assert.strictEqual(download.status, 200, 'Download after an interrupted one failed');
      assert.strictEqual(
        download.sha1,
        interrupted.shasum,
        'Registry served a truncated tarball after an interrupted download (poisoned cache?)'
      );
      assert.strictEqual(
        tarballRequests(),
        2,
        'Expected the tarball to be fetched again from the uplink after the interruption'
      );
    });

    await ctx.subTest('the interrupted package installs with the package manager', async () => {
      const { tempFolder } = await ctx.adapter.prepareProject(
        `e2e-tarball-disconnect-consumer-${id}`,
        '1.0.0',
        ctx.registryUrl,
        ctx.port,
        ctx.token,
        { [interruptedPkg]: '1.0.0' }
      );
      await ctx.adapter.exec(
        { cwd: tempFolder },
        'install',
        ...ctx.adapter.registryArg(ctx.registryUrl)
      );
      const ping = await fetch(`${ctx.registryUrl}/-/ping`);
      assert.strictEqual(ping.status, 200, 'Registry stopped responding after the disconnects');
    });
  } finally {
    await mock.stop();
  }
}

export const tarballDisconnectScenario: TestDefinition = {
  name: 'scenario:tarball-disconnect',
  // On demand (not every registry line has the fix) and needs the harness uplink config.
  appliesTo: (adapter) =>
    adapter.type === 'npm' &&
    Number.isFinite(uplinkPort()) &&
    pendingContractChecksEnabled('tarball-disconnect'),
  timeout: 120_000,
  run: testTarballDisconnect,
};
