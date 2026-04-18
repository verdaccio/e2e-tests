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
