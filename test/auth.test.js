import assert from 'node:assert/strict';
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  test,
} from 'node:test';
import jwt from 'jsonwebtoken';
import { defineUser } from '../src/users/user.model.js';
import { connectTestDatabase } from './database.js';
import { startApp, TEST_SECRET, tokens } from './helpers.js';

let sequelize;
let User;
let app;

before(async () => {
  sequelize = await connectTestDatabase();
  User = defineUser(sequelize);
});

after(() => sequelize.close());

beforeEach(async () => {
  await sequelize.query('TRUNCATE users RESTART IDENTITY');
  app = await startApp(User);
});

afterEach(() => app.stop());

const OLENA = {
  name: 'Олена Коваленко',
  email: 'olena@example.com',
  age: 23,
  password: 'olena-password-2026',
};

async function register(body = OLENA) {
  const response = await app.request('POST', '/api/auth/register', body, {
    token: null,
  });
  assert.equal(response.status, 201);
  return response.json();
}

function login(email = OLENA.email, password = OLENA.password) {
  const body = { email, password };
  return app.request('POST', '/api/auth/login', body, { token: null });
}

async function tokenFor(body = OLENA) {
  const user = await register(body);
  const { accessToken } = await (await login(body.email, body.password)).json();
  return { user, token: accessToken };
}

describe('POST /api/auth/register', () => {
  test('creates a user with the user role and stores only a hash', async () => {
    const response = await app.request('POST', '/api/auth/register', OLENA, {
      token: null,
    });
    assert.equal(response.status, 201);
    const user = await response.json();
    assert.equal(response.headers.get('location'), `/api/users/${user.id}`);
    assert.equal(user.role, 'user');
    assert.equal('password' in user || 'passwordHash' in user, false);
    const [row] = await User.findAll({ raw: true });
    assert.match(row.passwordHash, /^scrypt\$131072\$8\$1\$/);
    assert.equal(row.passwordHash.includes(OLENA.password), false);
  });

  test('rejects a short password and a role chosen by the user', async () => {
    const body = { ...OLENA, password: 'short', role: 'admin' };
    const response = await app.request('POST', '/api/auth/register', body, {
      token: null,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(
      (await response.json()).details.map((d) => d.field),
      ['password', 'role'],
    );
  });

  test('rejects an email that is already registered', async () => {
    await register();
    const body = { ...OLENA, email: 'OLENA@example.com' };
    const response = await app.request('POST', '/api/auth/register', body, {
      token: null,
    });
    assert.equal(response.status, 409);
  });
});

describe('POST /api/auth/login', () => {
  test('returns a bearer token signed for the user', async () => {
    const user = await register();
    const response = await login('OLENA@example.com');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.tokenType, 'Bearer');
    assert.equal(body.expiresIn, 3600);
    assert.deepEqual(tokens.verify(body.accessToken), {
      id: user.id,
      role: 'user',
    });
  });

  test('answers a wrong password and an unknown email alike', async () => {
    await register();
    const wrongPassword = await login(OLENA.email, 'wrong-password');
    const unknownEmail = await login('nobody@example.com', OLENA.password);
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
  });

  test('rejects a body without a password', async () => {
    const response = await app.request(
      'POST',
      '/api/auth/login',
      { email: OLENA.email },
      { token: null },
    );
    assert.equal(response.status, 400);
  });
});

describe('GET /api/auth/me', () => {
  test('returns the user the token belongs to', async () => {
    const { user, token } = await tokenFor();
    const response = await app.request('GET', '/api/auth/me', undefined, {
      token,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), user);
  });

  test('answers 401 with a Bearer challenge when there is no token', async () => {
    const response = await app.request('GET', '/api/auth/me', undefined, {
      token: null,
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  });

  test('rejects expired, forged and unsigned tokens', async () => {
    const user = await register();
    const claims = { sub: String(user.id), role: 'admin' };
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'),
      Buffer.from(JSON.stringify(claims)).toString('base64url'),
      '',
    ].join('.');
    const cases = {
      expired: jwt.sign({ ...claims, exp: now - 10 }, TEST_SECRET),
      forged: jwt.sign(claims, 'another-secret-that-is-long-enough-too'),
      unsigned,
    };
    for (const [name, token] of Object.entries(cases)) {
      const response = await app.request('GET', '/api/auth/me', undefined, {
        token,
      });
      assert.equal(response.status, 401, name);
      assert.equal(
        response.headers.get('www-authenticate'),
        'Bearer error="invalid_token"',
        name,
      );
    }
  });
});

describe('access rules for /api/users', () => {
  test('a request without a token gets 401', async () => {
    const response = await app.request('GET', '/api/users', undefined, {
      token: null,
    });
    assert.equal(response.status, 401);
  });

  test('a user may read users but not create or delete them', async () => {
    const { token } = await tokenFor();
    const read = await app.request('GET', '/api/users', undefined, { token });
    const create = await app.request(
      'POST',
      '/api/users',
      { name: 'Іван Петренко', email: 'ivan@example.com' },
      { token },
    );
    const remove = await app.request('DELETE', '/api/users/1', undefined, {
      token,
    });
    assert.deepEqual(
      [read.status, create.status, remove.status],
      [200, 403, 403],
    );
  });

  test('a user may change only their own data', async () => {
    const { user, token } = await tokenFor();
    const other = await register({
      name: 'Іван Петренко',
      email: 'ivan@example.com',
      password: 'ivan-password-2026',
    });
    const own = await app.request(
      'PATCH',
      `/api/users/${user.id}`,
      { age: 24 },
      { token },
    );
    const foreign = await app.request(
      'PATCH',
      `/api/users/${other.id}`,
      { age: 40 },
      { token },
    );
    assert.deepEqual([own.status, foreign.status], [200, 403]);
  });

  test('an administrator creates a user who can then log in', async () => {
    const response = await app.request('POST', '/api/users', {
      name: 'Марія Бондар',
      email: 'maria@example.com',
      password: 'maria-password-2026',
      role: 'admin',
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).role, 'admin');
    const logged = await login('maria@example.com', 'maria-password-2026');
    assert.equal(logged.status, 200);
  });
});
