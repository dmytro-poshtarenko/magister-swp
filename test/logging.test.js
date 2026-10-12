import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  test,
} from 'node:test';
import { createLogger } from '../src/logging/logger.js';
import { LokiTransport } from '../src/logging/loki-transport.js';
import { defineUser } from '../src/users/user.model.js';
import { connectTestDatabase } from './database.js';
import { createTestLogger, startApp } from './helpers.js';

let sequelize;
let User;
let app;
let entries;

before(async () => {
  sequelize = await connectTestDatabase();
  User = defineUser(sequelize);
});

after(() => sequelize.close());

beforeEach(async () => {
  await sequelize.query('TRUNCATE users RESTART IDENTITY');
  const testLogger = createTestLogger();
  entries = testLogger.entries;
  app = await startApp(User, { logger: testLogger.logger });
});

afterEach(() => app.stop());

const requests = () => entries.filter((e) => e.event === 'http_request');

describe('request logging', () => {
  test('writes one entry per request with its outcome', async () => {
    const response = await app.request('GET', '/api/users');
    const [entry, ...rest] = requests();
    assert.equal(rest.length, 0);
    assert.equal(entry.level, 'info');
    assert.equal(entry.message, 'GET /api/users 200');
    assert.equal(entry.method, 'GET');
    assert.equal(entry.path, '/api/users');
    assert.equal(entry.status, 200);
    assert.equal(entry.userId, 1_000_000);
    assert.equal(typeof entry.durationMs, 'number');
    assert.equal(entry.requestId, response.headers.get('x-request-id'));
  });

  test('uses warn for client errors and debug for the documentation', async () => {
    await app.request('GET', '/api/unknown');
    await app.request('GET', '/api/users', undefined, { token: null });
    await app.request('GET', '/docs/', undefined, { token: null });
    assert.deepEqual(
      requests().map((e) => [e.status, e.level, e.authError]),
      [
        [404, 'warn', undefined],
        [401, 'warn', 'TokenMissing'],
        [200, 'debug', undefined],
      ],
    );
  });

  test('never writes passwords or tokens', async () => {
    const password = 'olena-password-2026';
    const credentials = { email: 'olena@example.com', password };
    await app.request(
      'POST',
      '/api/auth/register',
      { name: 'Олена Коваленко', ...credentials },
      { token: null },
    );
    const login = await app.request('POST', '/api/auth/login', credentials, {
      token: null,
    });
    const { accessToken } = await login.json();
    await app.request('GET', '/api/auth/me', undefined, {
      token: accessToken,
    });
    const written = JSON.stringify(entries);
    assert.equal(written.includes(password), false);
    assert.equal(written.includes(accessToken), false);
    assert.deepEqual(
      entries.filter((e) => e.event !== 'http_request').map((e) => e.event),
      ['user_registered', 'login_succeeded'],
    );
  });
});

describe('LokiTransport', () => {
  test('pushes batches with service and level labels', async () => {
    const received = [];
    const loki = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      received.push({ path: req.url, body: JSON.parse(body) });
      res.writeHead(204).end();
    });
    loki.listen(0);
    await once(loki, 'listening');
    const transport = new LokiTransport({
      url: `http://127.0.0.1:${loki.address().port}`,
      labels: { service: 'magister-swp' },
      interval: 60_000,
    });
    const logger = createLogger({ lokiUrl: null, transports: [transport] });
    try {
      logger.info('перший запис', { event: 'first' });
      logger.warn('другий запис', { event: 'second' });
      await new Promise((resolve) => setImmediate(resolve));
      await transport.close();

      assert.equal(received.length, 1);
      assert.equal(received[0].path, '/loki/api/v1/push');
      const { streams } = received[0].body;
      assert.deepEqual(
        streams.map((s) => s.stream),
        [
          { service: 'magister-swp', level: 'info' },
          { service: 'magister-swp', level: 'warn' },
        ],
      );
      const [time, line] = streams[1].values[0];
      assert.match(time, /^\d{19}$/);
      assert.equal(JSON.parse(line).message, 'другий запис');
    } finally {
      loki.close();
    }
  });

  test('keeps working when Loki is down and reports it once', async (t) => {
    const write = t.mock.method(process.stderr, 'write', () => true);
    const transport = new LokiTransport({
      url: 'http://127.0.0.1:1',
      labels: { service: 'magister-swp' },
      interval: 60_000,
    });
    const logger = createLogger({ lokiUrl: null, transports: [transport] });
    for (const message of ['перший', 'другий']) {
      logger.info(message);
      await new Promise((resolve) => setImmediate(resolve));
      await transport.flush();
    }
    await transport.close();
    assert.equal(write.mock.callCount(), 1);
    assert.match(write.mock.calls[0].arguments[0], /^Loki недоступний/);
  });
});
