import buildDebug from 'debug';
import got from 'got';

const debug = buildDebug('verdaccio:e2e-cli:registry-client');

export type RegistryAuth = {
  token: string;
  user: string;
};

/**
 * Creates a user on the registry and returns the auth token.
 * Works against any running Verdaccio instance with htpasswd auth.
 */
export async function createUser(
  registryUrl: string,
  user = 'e2e-test-user',
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

  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(
      `Failed to create user "${user}" on ${registryUrl}: ${response.statusCode} ${JSON.stringify(response.body)}`
    );
  }

  const body = response.body as any;
  const token = body.token;
  if (!token) {
    throw new Error(`No token returned when creating user "${user}" on ${registryUrl}`);
  }

  debug('user %s created, token obtained', user);
  return { token, user };
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
