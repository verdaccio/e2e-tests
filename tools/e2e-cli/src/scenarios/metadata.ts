import assert from 'assert';
import buildDebug from 'debug';

import { TestContext, TestDefinition } from '../types';
import { downloadTarball, fetchPackument } from '../utils/http-client';

const debug = buildDebug('verdaccio:e2e-cli:scenario:metadata');

/**
 * Scenario: metadata
 *
 * HTTP-level battery for the packument (package metadata) endpoints:
 *
 *   - full packument shape: versions, dist-tags, readme, time
 *   - abbreviated metadata (Accept: application/vnd.npm.install-v1+json)
 *   - ETag + If-None-Match revalidation → 304 (required by Yarn Berry)
 *   - dist.tarball URLs rewritten to the registry host and downloadable
 *   - scoped packages via the `%2f`-encoded URL form
 *   - 404 body shape for unknown packages
 *   - coherence after mutations (new version published, version unpublished)
 *
 * Protocol-level and package-manager-agnostic, so it is gated to the npm
 * adapter to run once per suite.
 */

async function publishVersion(ctx: TestContext, pkgName: string, version: string): Promise<string> {
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    version,
    ctx.registryUrl,
    ctx.port,
    ctx.token
  );
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('published %s@%s', pkgName, version);
  return tempFolder;
}

async function testMetadata(ctx: TestContext): Promise<void> {
  const id = ctx.runId;
  const pkg = `e2e-metadata-${id}`;
  let projectFolder = '';

  await ctx.subTest('publish two versions', async () => {
    await publishVersion(ctx, pkg, '1.0.0');
    projectFolder = await publishVersion(ctx, pkg, '1.1.0');
  });

  await ctx.subTest('full packument has versions, dist-tags, readme and time', async () => {
    const { status, body } = await fetchPackument(ctx.registryUrl, pkg);
    assert.strictEqual(status, 200, 'Expected 200 for full packument');
    assert.strictEqual(body.name, pkg, 'Packument name mismatch');
    assert.ok(body.versions['1.0.0'], 'Expected version 1.0.0 in packument');
    assert.ok(body.versions['1.1.0'], 'Expected version 1.1.0 in packument');
    assert.strictEqual(body['dist-tags'].latest, '1.1.0', 'Expected latest dist-tag → 1.1.0');
    assert.ok(body.readme, 'Expected readme in full packument');
    assert.ok(body.time?.['1.0.0'], 'Expected time entry for 1.0.0');
    assert.ok(body.time?.['1.1.0'], 'Expected time entry for 1.1.0');
  });

  await ctx.subTest('abbreviated metadata (install-v1) is served', async () => {
    const { status, body } = await fetchPackument(ctx.registryUrl, pkg, { abbreviated: true });
    assert.strictEqual(status, 200, 'Expected 200 for abbreviated packument');
    assert.ok(body.versions['1.1.0'], 'Expected versions in abbreviated metadata');
    assert.ok(body['dist-tags'], 'Expected dist-tags in abbreviated metadata');
    // The install-v1 format exists to keep install metadata small: the readme
    // and the internal CouchDB fields must not leak (npm registry contract).
    assert.strictEqual(body.readme, undefined, 'Abbreviated metadata must not include the readme');
    assert.strictEqual(body._id, undefined, 'Abbreviated metadata must not include _id');
    assert.strictEqual(body._rev, undefined, 'Abbreviated metadata must not include _rev');
    assert.strictEqual(
      body.readmeFilename,
      undefined,
      'Abbreviated metadata must not include readmeFilename'
    );
    // "modified" is part of the install-v1 contract
    assert.ok(body.modified, 'Expected "modified" field in abbreviated metadata');
  });

  await ctx.subTest('ETag + If-None-Match revalidation returns 304', async () => {
    const first = await fetchPackument(ctx.registryUrl, pkg);
    const etag = first.headers.get('etag');
    assert.ok(etag, 'Expected an ETag header on the packument response');
    const revalidated = await fetchPackument(ctx.registryUrl, pkg, { etag });
    assert.strictEqual(
      revalidated.status,
      304,
      `Expected 304 with If-None-Match: ${etag}, got ${revalidated.status}`
    );
  });

  await ctx.subTest('ETag changes after a new version is published', async () => {
    const before = await fetchPackument(ctx.registryUrl, pkg);
    const staleEtag = before.headers.get('etag');
    assert.ok(staleEtag, 'Expected an ETag before publishing');

    await publishVersion(ctx, pkg, '1.2.0');

    // A "stuck" ETag would keep serving 304 forever — the stale value must
    // now miss and return the fresh packument with a different ETag.
    const after = await fetchPackument(ctx.registryUrl, pkg, { etag: staleEtag as string });
    assert.strictEqual(
      after.status,
      200,
      `Expected 200 with the stale ETag after publishing 1.2.0, got ${after.status}`
    );
    assert.ok(after.body?.versions?.['1.2.0'], 'Expected 1.2.0 in the revalidated packument');
    const freshEtag = after.headers.get('etag');
    assert.ok(freshEtag, 'Expected an ETag on the fresh packument');
    assert.notStrictEqual(freshEtag, staleEtag, 'ETag did not change after a publish');
  });

  await ctx.subTest('dist.tarball points at this registry and is downloadable', async () => {
    const { body } = await fetchPackument(ctx.registryUrl, pkg);
    const tarball: string = body.versions['1.1.0'].dist.tarball;
    assert.ok(
      tarball.startsWith(ctx.registryUrl),
      `Expected dist.tarball to be rewritten to ${ctx.registryUrl}, got ${tarball}`
    );
    const download = await downloadTarball(tarball);
    assert.strictEqual(download.status, 200, `Expected 200 downloading ${tarball}`);
    assert.strictEqual(
      download.sha1,
      body.versions['1.1.0'].dist.shasum,
      'Downloaded tarball does not match advertised shasum'
    );
  });

  await ctx.subTest('scoped packument via %2f-encoded URL', async () => {
    const scopedPkg = `@verdaccio/e2e-metadata-${id}`;
    await publishVersion(ctx, scopedPkg, '1.0.0');
    const { status, body } = await fetchPackument(ctx.registryUrl, scopedPkg);
    assert.strictEqual(status, 200, `Expected 200 for ${scopedPkg}`);
    assert.strictEqual(body.name, scopedPkg, 'Scoped packument name mismatch');
  });

  await ctx.subTest('unknown package returns a 404 error body', async () => {
    const { status, body } = await fetchPackument(ctx.registryUrl, `does-not-exist-${id}`);
    assert.strictEqual(status, 404, `Expected 404, got ${status}`);
    assert.ok(body?.error, 'Expected an "error" field in the 404 body');
  });

  await ctx.subTest('unpublished version disappears from the packument', async () => {
    // Run from the project folder so its .npmrc (auth token) applies.
    await ctx.adapter.exec(
      { cwd: projectFolder },
      'unpublish',
      `${pkg}@1.0.0`,
      '--force',
      ...ctx.adapter.registryArg(ctx.registryUrl)
    );
    const { status, body } = await fetchPackument(ctx.registryUrl, pkg);
    assert.strictEqual(status, 200, 'Expected 200 after unpublishing one version');
    assert.strictEqual(body.versions['1.0.0'], undefined, 'Expected 1.0.0 to be gone');
    assert.ok(body.versions['1.1.0'], 'Expected 1.1.0 to survive the unpublish');
  });
}

export const metadataScenario: TestDefinition = {
  name: 'scenario:metadata',
  requires: ['publish', 'unpublish'],
  // Protocol-level battery — run once per suite via the npm adapter.
  appliesTo: (adapter) => adapter.type === 'npm',
  run: testMetadata,
};
