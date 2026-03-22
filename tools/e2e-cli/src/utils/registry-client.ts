import buildDebug from 'debug';
import got from 'got';

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
  const response = await got.put(url, {
    json: {
      name: user,
      password,
      _id: `org.couchdb.user:${user}`,
      type: 'user',
      roles: [],
      date: new Date().toISOString(),
    },
    responseType: 'json',
    throwHttpErrors: false,
    retry: { limit: 0 },
  });

  const body = response.body as any;

  // 409 = user already exists, the PUT still returns a token (login)
  if (response.statusCode === 201 || response.statusCode === 200 || response.statusCode === 409) {
    const token = body.token;
    if (token) {
      debug('user %s authenticated, token obtained', user);
      return { token, user };
    }
  }

  throw new Error(
    `Failed to create/login user "${user}" on ${registryUrl}: ${response.statusCode} ${JSON.stringify(body)}`
  );
}

/**
 * Ping the registry to check it's alive.
 */
export async function pingRegistry(registryUrl: string): Promise<boolean> {
  debug('pinging %s', registryUrl);
  try {
    const response = await got.get(`${registryUrl}/-/ping`, {
      throwHttpErrors: false,
      retry: { limit: 2 },
      timeout: { request: 5000 },
    });
    return response.statusCode === 200;
  } catch {
    return false;
  }
}
