import Transport from 'winston-transport';
import { createApp } from '../src/app.js';
import { createTokens } from '../src/auth/tokens.js';
import { createLogger } from '../src/logging/logger.js';
import { UsersService } from '../src/users/users.service.js';

export const TEST_SECRET = 'a-test-secret-that-is-long-enough-for-hs256';

export const tokens = createTokens({ secret: TEST_SECRET, expiresIn: 3600 });

// An administrator who is not in the users table: the token alone carries
// the rights, so tests that only need them do not have to create one.
export const adminToken = tokens.sign({ id: 1_000_000, role: 'admin' });

class MemoryTransport extends Transport {
  entries = [];

  log(info, callback) {
    this.entries.push(info);
    callback();
  }
}

export function createTestLogger() {
  const memory = new MemoryTransport();
  const logger = createLogger({
    level: 'debug',
    lokiUrl: null,
    transports: [memory],
  });
  return { logger, entries: memory.entries };
}

export async function startApp(User, { logger } = {}) {
  const app = createApp({
    users: new UsersService(User),
    tokens,
    logger: logger ?? createTestLogger().logger,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    request(method, path, body, { token = adminToken } = {}) {
      const options = { method, headers: {} };
      if (token) options.headers.authorization = `Bearer ${token}`;
      if (body !== undefined) {
        options.headers['content-type'] = 'application/json';
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      return fetch(`${baseUrl}${path}`, options);
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
