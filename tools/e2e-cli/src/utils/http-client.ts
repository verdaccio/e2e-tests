import { createHash } from 'crypto';
import buildDebug from 'debug';
import { get } from 'http';

const debug = buildDebug('verdaccio:e2e-cli:http-client');

export type PackumentResponse = {
  status: number;
  headers: Headers;
  /** Parsed JSON body, or undefined when the response is not JSON (e.g. 304) */
  body?: any;
};

export type TarballDownload = {
  status: number;
  headers: Headers;
  /** Total bytes received */
  bytes: number;
  /** hex-encoded sha1 of the received bytes (matches dist.shasum) */
  sha1: string;
  /** `sha512-<base64>` of the received bytes (matches dist.integrity) */
  integrity: string;
};

export type FetchPackumentOptions = {
  /** Request the abbreviated (install) metadata format */
  abbreviated?: boolean;
  /** Send If-None-Match with this value */
  etag?: string;
  /** Bearer token */
  token?: string;
};

export const ABBREVIATED_ACCEPT = 'application/vnd.npm.install-v1+json';

/**
 * Registry URL for a package name. Scoped names are encoded with the same
 * `%2f` form npm clients use: `@scope%2fname`.
 */
export function packumentUrl(registryUrl: string, pkgName: string): string {
  const encoded = pkgName.startsWith('@') ? pkgName.replace('/', '%2f') : pkgName;
  return `${registryUrl.replace(/\/$/, '')}/${encoded}`;
}

export async function fetchPackument(
  registryUrl: string,
  pkgName: string,
  options: FetchPackumentOptions = {}
): Promise<PackumentResponse> {
  const url = packumentUrl(registryUrl, pkgName);
  const headers: Record<string, string> = {};
  if (options.abbreviated) {
    headers['Accept'] = ABBREVIATED_ACCEPT;
  }
  if (options.etag) {
    headers['If-None-Match'] = options.etag;
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  debug('GET %s %o', url, headers);

  // Conditional requests must bypass fetch(): undici appends
  // `cache-control: no-cache` whenever If-None-Match is present, which
  // (correctly, per HTTP semantics) disables the server's 304 revalidation.
  if (options.etag) {
    return new Promise((resolve, reject) => {
      get(url, { headers }, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          let body: any;
          try {
            body = JSON.parse(text);
          } catch {
            body = undefined;
          }
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined) {
              responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
            }
          }
          resolve({ status: response.statusCode || 0, headers: responseHeaders, body });
        });
      }).on('error', reject);
    });
  }

  const response = await fetch(url, { headers });
  let body: any;
  if (response.status !== 304) {
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }
  return { status: response.status, headers: response.headers, body };
}

export type DownloadTarballOptions = {
  signal?: AbortSignal;
  token?: string;
  /** Called after the first chunk of the body arrives (useful to abort mid-stream) */
  onFirstChunk?: () => void;
  /** Called after every chunk with the total bytes received so far (useful to abort at a threshold) */
  onChunk?: (bytesReceived: number) => void;
};

/**
 * Download a tarball fully, computing sha1/sha512 integrity on the fly.
 * Rejects with the underlying error when aborted or the connection drops.
 */
export async function downloadTarball(
  url: string,
  options: DownloadTarballOptions = {}
): Promise<TarballDownload> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  debug('GET (tarball) %s', url);
  const response = await fetch(url, { headers, signal: options.signal });

  const sha1 = createHash('sha1');
  const sha512 = createHash('sha512');
  let bytes = 0;
  let first = true;

  if (response.body) {
    for await (const chunk of response.body as any) {
      const buf = Buffer.from(chunk);
      bytes += buf.length;
      sha1.update(buf);
      sha512.update(buf);
      if (first) {
        first = false;
        options.onFirstChunk?.();
      }
      options.onChunk?.(bytes);
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    bytes,
    sha1: sha1.digest('hex'),
    integrity: `sha512-${sha512.digest('base64')}`,
  };
}

/** Compute npm-style dist values (shasum/integrity) for a buffer. */
export function computeDist(buffer: Buffer): { shasum: string; integrity: string } {
  return {
    shasum: createHash('sha1').update(buffer).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(buffer).digest('base64')}`,
  };
}
