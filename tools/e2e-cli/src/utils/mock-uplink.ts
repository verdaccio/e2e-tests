import { randomBytes } from 'crypto';
import buildDebug from 'debug';
import { Server, createServer } from 'http';

import { computeDist } from './http-client';

const debug = buildDebug('verdaccio:e2e-cli:mock-uplink');

export type UplinkMode =
  /** Serve packuments and tarballs normally */
  | 'ok'
  /** Send tarball headers + half the body, then destroy the socket */
  | 'drop-mid-stream'
  /** Delay every response long enough to trip the registry's uplink timeout */
  | 'slow'
  /** Respond 500 to everything */
  | 'error-500';

type MockPackage = {
  name: string;
  version: string;
  tarball: Buffer;
  shasum: string;
  integrity: string;
};

/**
 * Minimal controllable npm uplink used by scenario:uplink-failure.
 *
 * The registry under test is configured (see --print-config) to proxy the
 * `e2e-uplink-*` package pattern to this server, so the scenario can flip the
 * uplink between healthy, dropping connections mid-tarball, slow, and down.
 */
export class MockUplink {
  public mode: UplinkMode = 'ok';
  public requests: string[] = [];
  private server?: Server;
  private packages = new Map<string, MockPackage>();
  private searchResults: { name: string; version: string }[] = [];

  constructor(public readonly port: number) {}

  /** Register a package served by this uplink; tarball is random (incompressible) bytes. */
  addPackage(name: string, tarballBytes = 64 * 1024): MockPackage {
    const tarball = randomBytes(tarballBytes);
    const { shasum, integrity } = computeDist(tarball);
    const pkg: MockPackage = { name, version: '1.0.0', tarball, shasum, integrity };
    this.packages.set(name, pkg);
    return pkg;
  }

  /** Register a result served by the /-/v1/search endpoint. */
  addSearchResult(name: string, version = '1.0.0'): void {
    this.searchResults.push({ name, version });
  }

  /**
   * npmjs-faithful /-/v1/search: filters by `text` substring, applies
   * `from`/`size` itself (like registry.npmjs.org does) and reports the real
   * `total` of matches. Mimicking the upstream offsetting is what exposes
   * double pagination in the registry under test.
   */
  private searchResponse(url: URL): string {
    const text = url.searchParams.get('text') ?? '';
    const from = Math.max(0, parseInt(url.searchParams.get('from') ?? '0', 10) || 0);
    const size = Math.max(0, parseInt(url.searchParams.get('size') ?? '20', 10) || 20);
    const matches = this.searchResults.filter((r) => r.name.includes(text));
    const page = matches.slice(from, from + size);
    return JSON.stringify({
      objects: page.map((r) => ({
        package: {
          name: r.name,
          version: r.version,
          description: 'mock uplink search result',
          date: '2020-01-01T00:00:00.000Z',
          maintainers: [{ username: 'mock-uplink', email: 'mock@example.org' }],
          links: { npm: `http://localhost:${this.port}/${r.name}` },
        },
        score: { final: 1, detail: { quality: 1, popularity: 1, maintenance: 1 } },
        searchScore: 1,
        flags: {},
      })),
      total: matches.length,
      time: new Date('2020-01-01T00:00:00.000Z').toISOString(),
    });
  }

  private packument(pkg: MockPackage): string {
    const tarballUrl = `http://localhost:${this.port}/${pkg.name}/-/${pkg.name}-${pkg.version}.tgz`;
    return JSON.stringify({
      name: pkg.name,
      'dist-tags': { latest: pkg.version },
      versions: {
        [pkg.version]: {
          name: pkg.name,
          version: pkg.version,
          description: 'mock uplink package',
          dist: { tarball: tarballUrl, shasum: pkg.shasum, integrity: pkg.integrity },
        },
      },
      time: {
        created: '2020-01-01T00:00:00.000Z',
        modified: '2020-01-01T00:00:00.000Z',
        [pkg.version]: '2020-01-01T00:00:00.000Z',
      },
    });
  }

  start(): Promise<void> {
    this.server = createServer((req, res) => {
      const url = req.url || '';
      this.requests.push(url);
      debug('mock uplink %s %s (mode: %s)', req.method, url, this.mode);

      const respond = () => {
        if (this.mode === 'error-500') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'mock uplink internal error' }));
          return;
        }

        // Search route: /-/v1/search?text=...&from=...&size=...
        if (url.startsWith('/-/v1/search')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(this.searchResponse(new URL(url, `http://localhost:${this.port}`)));
          return;
        }

        // Tarball route: /<name>/-/<file>.tgz
        const tarballMatch = url.match(/^\/(.+?)\/-\/.+\.tgz$/);
        if (tarballMatch) {
          const pkg = this.packages.get(decodeURIComponent(tarballMatch[1]));
          if (!pkg) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
          }
          if (this.mode === 'drop-mid-stream') {
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(pkg.tarball.length),
            });
            res.write(pkg.tarball.subarray(0, Math.floor(pkg.tarball.length / 2)));
            // Kill the connection before the body completes.
            setTimeout(() => res.socket?.destroy(), 50);
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(pkg.tarball.length),
          });
          res.end(pkg.tarball);
          return;
        }

        // Packument route: /<name>
        const pkg = this.packages.get(decodeURIComponent(url.slice(1)));
        if (!pkg) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(this.packument(pkg));
      };

      // The registry (or a stopped server) may have torn the socket down by the
      // time a delayed response fires — never let that crash the mock.
      const safeRespond = () => {
        try {
          respond();
        } catch (err) {
          debug('mock uplink response failed (socket gone?): %s', err);
        }
      };

      if (this.mode === 'slow') {
        // Longer than the uplink timeout configured for the e2e registry (3s).
        const timer = setTimeout(safeRespond, 10_000);
        res.socket?.once('close', () => clearTimeout(timer));
      } else {
        safeRespond();
      }
    });

    return new Promise((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, () => {
        debug('mock uplink listening on %d', this.port);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      // closeAllConnections drops keep-alive sockets so close() completes.
      this.server.closeAllConnections?.();
      this.server.close(() => {
        debug('mock uplink stopped');
        this.server = undefined;
        resolve();
      });
    });
  }
}
