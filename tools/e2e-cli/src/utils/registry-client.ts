import buildDebug from 'debug';

import { ping } from '@verdaccio/registry-cli';

const debug = buildDebug('verdaccio:e2e-cli:registry-client');

export type RegistryAuth = {
  token: string;
  user: string;
};

/**
 * Creates a user on the registry and returns the auth token.
 * Uses a unique username per run to avoid 409 conflicts.
 * Works against any running Verdaccio instance with htpasswd auth.
 */
export async function createUser(
  registryUrl: string,
  user = `e2e-user-${Date.now()}`,
  password = 'e2e-test-password'
): Promise<RegistryAuth> {
  debug('creating user %s on %s', user, registryUrl);
  const url = `${registryUrl}/-/user/org.couchdb.user:${encodeURIComponent(user)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: user,
      password,
      _id: `org.couchdb.user:${user}`,
      type: 'user',
      roles: [],
      date: new Date().toISOString(),
    }),
  });

  const body = (await response.json()) as any;

  if (response.status === 201 || response.status === 200 || response.status === 409) {
    const token = body.token;
    if (token) {
      debug('user %s authenticated, token obtained', user);
      return { token, user };
    }
  }

  throw new Error(
    `Failed to create/login user "${user}" on ${registryUrl}: ${response.status} ${JSON.stringify(body)}`
  );
}

/**
 * Ping the registry to check it's alive.
 * Uses @verdaccio/registry-cli ping.
 */
export async function pingRegistry(registryUrl: string): Promise<boolean> {
  debug('pinging %s', registryUrl);
  try {
    const result = await ping(registryUrl);
    return result.ok;
  } catch {
    return false;
  }
}

export class LegacyLoginError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * Replays the legacy login the way each client sends it. npm and Yarn retry a
 * 409 with Basic (Yarn on the GET too); pnpm sends Basic on a single PUT. A
 * registry that authenticates the first PUT is accepted too.
 */
export async function legacyLogin(
  registryUrl: string,
  user: string,
  password: string,
  client: 'npm' | 'yarn' | 'pnpm'
): Promise<string> {
  const userUrl = `${registryUrl}/-/user/org.couchdb.user:${encodeURIComponent(user)}`;
  const basic = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  const jsonHeaders = { 'Content-Type': 'application/json' };
  const body: Record<string, unknown> = {
    _id: `org.couchdb.user:${user}`,
    name: user,
    password,
    type: 'user',
    roles: [],
    date: new Date().toISOString(),
  };

  const put = (url: string, headers: Record<string, string>) =>
    fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });

  const first = await put(
    userUrl,
    client === 'pnpm'
      ? { ...jsonHeaders, Authorization: basic, 'npm-auth-type': 'web' }
      : jsonHeaders
  );
  const firstBody = (await first.json()) as any;
  if (first.ok && firstBody.token) {
    debug('%s: first PUT authenticated %s', client, user);
    return firstBody.token;
  }
  if (first.status !== 409) {
    throw new LegacyLoginError(`first PUT answered ${first.status}`, first.status);
  }

  const current = await fetch(`${userUrl}?write=true`, {
    headers: client === 'yarn' ? { Authorization: basic } : {},
  });
  if (!current.ok) {
    throw new LegacyLoginError(`GET answered ${current.status}`, current.status);
  }
  const currentBody = (await current.json()) as Record<string, unknown>;
  for (const [key, value] of Object.entries(currentBody)) {
    if (!body[key] || key === 'roles') {
      body[key] = value;
    }
  }

  const second = await put(`${userUrl}/-rev/${body._rev}`, {
    ...jsonHeaders,
    Authorization: basic,
  });
  const secondBody = (await second.json()) as any;
  if (!second.ok || !secondBody.token) {
    throw new LegacyLoginError(`PUT with revision answered ${second.status}`, second.status);
  }
  return secondBody.token;
}

export async function whoami(registryUrl: string, token: string): Promise<string | undefined> {
  const response = await fetch(`${registryUrl}/-/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok ? ((await response.json()) as any).username : undefined;
}
