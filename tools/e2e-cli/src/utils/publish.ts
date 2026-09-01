import buildDebug from 'debug';
import { gzipSync } from 'zlib';

import { TestContext } from '../types';
import { computeDist } from './http-client';

const debug = buildDebug('verdaccio:e2e-cli:publish');

/** Build a single ustar tar entry (512-byte header + padded content). */
function tarEntry(name: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8); // mode
  header.write('0000000\0', 108, 8); // uid
  header.write('0000000\0', 116, 8); // gid
  header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12); // size
  header.write('00000000000\0', 136, 12); // mtime (epoch, keeps output deterministic)
  header.write('        ', 148, 8); // chksum placeholder (spaces while summing)
  header.write('0', 156, 1); // typeflag: regular file
  header.write('ustar\0', 257, 6); // magic
  header.write('00', 263, 2); // version
  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

/** Build a minimal valid npm package tarball (package/package.json inside). */
export function buildPackageTarball(
  pkgName: string,
  version: string,
  dependencies: Record<string, string> = {}
): Buffer {
  const manifest = {
    name: pkgName,
    version,
    description: 'e2e local package',
    main: 'index.js',
    dependencies,
    license: 'MIT',
  };
  const tar = Buffer.concat([
    tarEntry('package/package.json', Buffer.from(JSON.stringify(manifest, null, 2))),
    tarEntry('package/index.js', Buffer.from('module.exports = {};\n')),
    Buffer.alloc(1024), // tar end-of-archive marker
  ]);
  return gzipSync(tar, { level: 9 });
}

/**
 * Publish straight through the registry HTTP API (same PUT an npm client
 * sends). Used for adapters that cannot publish themselves (eg. deno) so
 * every fixture still comes from the registry under test — never from an
 * external registry.
 */
export async function publishViaHttp(
  ctx: TestContext,
  pkgName: string,
  version = '1.0.0',
  dependencies: Record<string, string> = {}
): Promise<void> {
  const tarball = buildPackageTarball(pkgName, version, dependencies);
  const { shasum, integrity } = computeDist(tarball);
  const filename = `${pkgName.replace(/^@[^/]+\//, '')}-${version}.tgz`;
  const encodedName = pkgName.startsWith('@') ? pkgName.replaceAll('/', '%2f') : pkgName;
  const tarballUrl = `${ctx.registryUrl}/${encodedName}/-/${filename}`;
  const body = {
    _id: pkgName,
    name: pkgName,
    description: 'e2e local package',
    'dist-tags': { latest: version },
    versions: {
      [version]: {
        _id: `${pkgName}@${version}`,
        name: pkgName,
        version,
        description: 'e2e local package',
        main: 'index.js',
        dependencies,
        license: 'MIT',
        dist: { tarball: tarballUrl, shasum, integrity },
      },
    },
    _attachments: {
      [filename]: {
        content_type: 'application/octet-stream',
        data: tarball.toString('base64'),
        length: tarball.length,
      },
    },
  };
  const response = await fetch(`${ctx.registryUrl}/${encodedName}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.token}`,
    },
    body: JSON.stringify(body),
  });
  if (response.status !== 201 && response.status !== 200) {
    const text = await response.text();
    throw new Error(`HTTP publish of ${pkgName}@${version} failed: ${response.status} ${text}`);
  }
  debug('published %s@%s via HTTP', pkgName, version);
}

/**
 * Publish a package to the registry under test so later steps (install, ci,
 * audit, info, search…) can consume it without ever touching an external
 * registry — the whole suite must be runnable offline. Uses the package
 * manager when it can publish, the raw HTTP API otherwise (eg. deno).
 */
export async function publishLocalPackage(
  ctx: TestContext,
  pkgName: string,
  version = '1.0.0',
  dependencies: Record<string, string> = {}
): Promise<void> {
  if (!ctx.adapter.supports.has('publish')) {
    return publishViaHttp(ctx, pkgName, version, dependencies);
  }
  const { tempFolder } = await ctx.adapter.prepareProject(
    pkgName,
    version,
    ctx.registryUrl,
    ctx.port,
    ctx.token,
    dependencies
  );
  // yarn modern requires an install first to generate the lockfile
  if (ctx.adapter.type === 'yarn-modern') {
    await ctx.adapter.exec({ cwd: tempFolder }, 'install');
  }
  await ctx.adapter.exec(
    { cwd: tempFolder },
    'publish',
    ...ctx.adapter.registryArg(ctx.registryUrl)
  );
  debug('published local package %s@%s', pkgName, version);
}
