import assert from 'assert';
import { randomBytes } from 'crypto';
import buildDebug from 'debug';
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { TestContext, TestDefinition } from '../types';
import { downloadTarball, fetchPackument, packumentUrl } from '../utils/http-client';

const debug = buildDebug('verdaccio:e2e-cli:scenario:tarballs');

/**
 * Scenario: tarballs
 *
 * HTTP-level battery for the tarball endpoints. Publishes a large (~30 MB by
 * default, incompressible) package through the real package manager, then
 * exercises the raw registry protocol with fetch():
 *
 *   - full download with Content-Length + shasum/integrity verification
 *   - client aborts mid-download (repeatedly) without breaking the registry
 *   - concurrent downloads of the same large tarball
 *   - 404 behavior for missing packages / versions / mismatched filenames
 *   - scoped packages via the npm `%2f`-encoded URL form
 *   - end-to-end install of the large package through the package manager
 *
 * The registry must accept large publishes — Verdaccio's default
 * `max_body_size` is 10mb, so the harness config needs e.g. `max_body_size: 100mb`
 * (see `--print-config`). The payload size can be tuned with
 * E2E_LARGE_TARBALL_MB (default 30).
 *
 * Protocol-level and package-manager-agnostic, so it is gated to the npm
 * adapter to run once per suite.
 */

const LARGE_MB = parseInt(process.env.E2E_LARGE_TARBALL_MB || '30', 10);
const CONCURRENT_DOWNLOADS = 8;

/**
 * TODO: flip to true once Verdaccio serves tarballs the way npmjs does.
 * Verified against current registries: local tarballs are always streamed
 * chunked with no Content-Length (even with Accept-Encoding: identity), and
 * the express compression() middleware re-gzips the already-compressed .tgz
 * whenever the client accepts gzip (npm and undici do by default) — wasted
 * CPU per download and the reason Content-Length disappears. These checks pin
 * the correct behavior but are red today.
 */
const PENDING_CONTRACT_CHECKS_ENABLED = false;

async function publishWithPayload(
  ctx: TestContext,
  pkgName: string,
  version: string,
  payloadBytes?: number
): Promise<void> {
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    version,
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  if (payloadBytes) {
    // Random bytes are incompressible, so the gzipped tarball keeps ~this size.
    await writeFile(join(tempFolder, 'payload.bin'), randomBytes(payloadBytes));
  }
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('published %s@%s (payload: %d bytes)', pkgName, version, payloadBytes ?? 0);
}

async function getDist(
  ctx: TestContext,
  pkgName: string,
  version: string
): Promise<{ tarball: string; shasum?: string; integrity?: string }> {
  const { status, body } = await fetchPackument(ctx.registryUrl, pkgName);
  assert.strictEqual(status, 200, `Expected 200 fetching packument for ${pkgName}`);
  const dist = body?.versions?.[version]?.dist;
  assert.ok(dist?.tarball, `Expected dist.tarball for ${pkgName}@${version}`);
  return dist;
}

async function testTarballs(ctx: TestContext): Promise<void> {
  const id = ctx.runId;
  const largePkg = `e2e-tarball-large-${id}`;
  const largeBytes = LARGE_MB * 1024 * 1024;
  let largeTarballUrl = '';
  let largeSha1 = '';

  await ctx.subTest(`publish large package (~${LARGE_MB} MB)`, async () => {
    await publishWithPayload(ctx, largePkg, '1.0.0', largeBytes);
  });

  await ctx.subTest('download large tarball and verify integrity', async () => {
    const dist = await getDist(ctx, largePkg, '1.0.0');
    largeTarballUrl = dist.tarball;

    const download = await downloadTarball(dist.tarball);
    assert.strictEqual(download.status, 200, `Expected 200 downloading ${dist.tarball}`);
    assert.ok(
      download.bytes >= largeBytes,
      `Expected tarball >= ${largeBytes} bytes (incompressible payload), got ${download.bytes}`
    );
    // When Content-Length is present it must match; its *presence* is pinned
    // by the gated contract check below (Verdaccio streams chunked today).
    const contentLength = download.headers.get('content-length');
    if (contentLength) {
      assert.strictEqual(
        parseInt(contentLength, 10),
        download.bytes,
        `Content-Length (${contentLength}) does not match received bytes (${download.bytes})`
      );
    }
    // A locally published version must always advertise its integrity — the
    // absence of these fields IS a bug, so no conditional soft-skips.
    assert.ok(dist.shasum, 'Expected dist.shasum on the published version');
    assert.strictEqual(download.sha1, dist.shasum, 'shasum mismatch on downloaded tarball');
    assert.ok(dist.integrity, 'Expected dist.integrity on the published version');
    assert.strictEqual(
      download.integrity,
      dist.integrity,
      'integrity mismatch on downloaded tarball'
    );
    largeSha1 = download.sha1;
  });

  if (PENDING_CONTRACT_CHECKS_ENABLED) {
    await ctx.subTest('tarball response advertises Content-Length', async () => {
      const response = await fetch(largeTarballUrl, {
        headers: { 'accept-encoding': 'identity' },
      });
      await response.body?.cancel();
      const contentLength = response.headers.get('content-length');
      assert.ok(contentLength, 'Expected Content-Length on an identity-encoded tarball response');
      assert.ok(
        parseInt(contentLength as string, 10) >= largeBytes,
        `Content-Length (${contentLength}) smaller than the payload (${largeBytes})`
      );
    });

    await ctx.subTest('tarball is not re-compressed for gzip-accepting clients', async () => {
      const response = await fetch(largeTarballUrl, { headers: { 'accept-encoding': 'gzip' } });
      await response.body?.cancel();
      assert.strictEqual(
        response.headers.get('content-encoding'),
        null,
        'Registry re-compresses the already-gzipped .tgz (wasted CPU on every download)'
      );
    });
  }

  await ctx.subTest('abort mid-download is handled gracefully', async () => {
    // Abort at different depths into the stream: the first chunk exercises the
    // early-teardown path, the deeper thresholds exercise aborts while the
    // registry is mid-flight with backpressure on a large body.
    const abortThresholds = [1, Math.floor(largeBytes * 0.25), Math.floor(largeBytes * 0.5)];
    for (const threshold of abortThresholds) {
      const controller = new AbortController();
      let aborted = false;
      try {
        await downloadTarball(largeTarballUrl, {
          signal: controller.signal,
          onChunk: (bytes) => {
            if (bytes >= threshold) {
              controller.abort();
            }
          },
        });
      } catch (err) {
        aborted = true;
        debug('download aborted at >=%d bytes as expected: %s', threshold, err);
      }
      assert.ok(aborted, `Expected download to abort mid-stream (threshold ${threshold} bytes)`);
    }

    // The registry must survive the aborts: ping + a full download still work.
    const ping = await fetch(`${ctx.registryUrl}/-/ping`);
    assert.strictEqual(ping.status, 200, 'Registry did not respond to ping after aborts');
    const download = await downloadTarball(largeTarballUrl);
    assert.strictEqual(download.status, 200, 'Full download after aborts failed');
    assert.strictEqual(download.sha1, largeSha1, 'Tarball corrupted after aborted downloads');
  });

  await ctx.subTest(`${CONCURRENT_DOWNLOADS} concurrent downloads stay consistent`, async () => {
    const downloads = await Promise.all(
      Array.from({ length: CONCURRENT_DOWNLOADS }, () => downloadTarball(largeTarballUrl))
    );
    for (const download of downloads) {
      assert.strictEqual(download.status, 200, 'Concurrent download failed');
      assert.strictEqual(download.sha1, largeSha1, 'Concurrent download corrupted');
    }
  });

  await ctx.subTest('missing tarballs return 404', async () => {
    const cases = [
      // existing package, nonexistent version
      `${packumentUrl(ctx.registryUrl, largePkg)}/-/${largePkg}-9.9.9.tgz`,
      // nonexistent package
      `${packumentUrl(ctx.registryUrl, `does-not-exist-${id}`)}/-/does-not-exist-${id}-1.0.0.tgz`,
      // existing package, filename that doesn't belong to it
      `${packumentUrl(ctx.registryUrl, largePkg)}/-/some-other-file-1.0.0.tgz`,
    ];
    for (const url of cases) {
      const response = await fetch(url);
      // drain the body so sockets are released
      await response.arrayBuffer();
      assert.strictEqual(response.status, 404, `Expected 404 for ${url}, got ${response.status}`);
    }
  });

  await ctx.subTest('scoped package tarball via %2f-encoded URL', async () => {
    const scopedPkg = `@verdaccio/e2e-tarball-${id}`;
    await publishWithPayload(ctx, scopedPkg, '1.0.0');
    const dist = await getDist(ctx, scopedPkg, '1.0.0');
    const download = await downloadTarball(dist.tarball);
    assert.strictEqual(download.status, 200, `Expected 200 downloading ${dist.tarball}`);
    assert.ok(download.bytes > 0, 'Scoped tarball is empty');
    assert.ok(dist.shasum, 'Expected dist.shasum on the scoped version');
    assert.strictEqual(download.sha1, dist.shasum, 'Scoped tarball shasum mismatch');
  });

  await ctx.subTest('package manager installs the large package', async () => {
    const { tempFolder } = await ctx.adapter.prepareProject(
      `e2e-tarball-consumer-${id}`,
      '1.0.0',
      ctx.registryUrl,
      ctx.port,
      ctx.token,
      { [largePkg]: '1.0.0' }
    );
    await ctx.adapter.exec(
      { cwd: tempFolder },
      'install',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );
  });
}

export const tarballsScenario: TestDefinition = {
  name: 'scenario:tarballs',
  requires: ['publish', 'install'],
  // Protocol-level battery — run once per suite via the npm adapter.
  appliesTo: (adapter) => adapter.type === 'npm',
  timeout: 180_000,
  run: testTarballs,
};
