import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createApp } from '../src/app.js';

let server;
let baseUrl;

beforeEach(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

function request(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, options);
}

async function createUser(
  body = { name: 'Олена Коваленко', email: 'olena@example.com', age: 23 },
) {
  const response = await request('POST', '/api/users', body);
  assert.equal(response.status, 201);
  return response.json();
}

describe('POST /api/users', () => {
  test('creates a user and returns 201 with Location', async () => {
    const response = await request('POST', '/api/users', {
      name: '  Олена Коваленко ',
      email: 'olena@example.com',
      age: 23,
    });
    assert.equal(response.status, 201);
    const user = await response.json();
    assert.equal(response.headers.get('location'), `/api/users/${user.id}`);
    assert.deepEqual(
      { id: user.id, name: user.name, email: user.email, age: user.age },
      { id: 1, name: 'Олена Коваленко', email: 'olena@example.com', age: 23 },
    );
    assert.equal(user.createdAt, user.updatedAt);
  });

  test('sets age to null when it is omitted', async () => {
    const user = await createUser({
      name: 'Іван Петренко',
      email: 'ivan@example.com',
    });
    assert.equal(user.age, null);
  });

  test('rejects invalid data with 400 and lists every problem', async () => {
    const response = await request('POST', '/api/users', {
      name: 'О',
      email: 'not-an-email',
      age: 0,
      role: 'admin',
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'ValidationError');
    assert.deepEqual(
      body.details.map((d) => d.field),
      ['name', 'email', 'age', 'role'],
    );
  });

  test('rejects missing required fields', async () => {
    const response = await request('POST', '/api/users', {});
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.deepEqual(
      body.details.map((d) => d.field),
      ['name', 'email'],
    );
  });

  test('rejects a duplicate email regardless of case with 409', async () => {
    await createUser();
    const response = await request('POST', '/api/users', {
      name: 'Інша Олена',
      email: 'OLENA@example.com',
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'Conflict');
  });

  test('rejects malformed JSON with 400', async () => {
    const response = await request('POST', '/api/users', '{"name": ');
    assert.equal(response.status, 400);
    assert.equal(
      (await response.json()).message,
      'Тіло запиту не є коректним JSON',
    );
  });

  test('rejects a body that is not a JSON object', async () => {
    const response = await request('POST', '/api/users', [1, 2]);
    assert.equal(response.status, 400);
  });
});

describe('GET /api/users', () => {
  test('returns an empty list at first', async () => {
    const response = await request('GET', '/api/users');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });

  test('returns every created user', async () => {
    await createUser();
    await createUser({ name: 'Іван Петренко', email: 'ivan@example.com' });
    const users = await (await request('GET', '/api/users')).json();
    assert.deepEqual(
      users.map((u) => u.email),
      ['olena@example.com', 'ivan@example.com'],
    );
  });
});

describe('GET /api/users/:id', () => {
  test('returns the user', async () => {
    const created = await createUser();
    const response = await request('GET', `/api/users/${created.id}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), created);
  });

  test('returns 404 for an unknown id', async () => {
    const response = await request('GET', '/api/users/42');
    assert.equal(response.status, 404);
    assert.equal(
      (await response.json()).message,
      'Користувача з id 42 не знайдено',
    );
  });

  test('returns 400 for an id that is not a positive integer', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) {
      const response = await request('GET', `/api/users/${id}`);
      assert.equal(response.status, 400, id);
    }
  });
});

describe('PUT /api/users/:id', () => {
  test('replaces every field and resets an omitted age to null', async () => {
    const created = await createUser();
    const response = await request('PUT', `/api/users/${created.id}`, {
      name: 'Олена Шевчук',
      email: 'shevchuk@example.com',
    });
    assert.equal(response.status, 200);
    const user = await response.json();
    assert.deepEqual(
      { name: user.name, email: user.email, age: user.age },
      { name: 'Олена Шевчук', email: 'shevchuk@example.com', age: null },
    );
    assert.equal(user.createdAt, created.createdAt);
  });

  test('requires the full representation', async () => {
    const created = await createUser();
    const response = await request('PUT', `/api/users/${created.id}`, {
      age: 30,
    });
    assert.equal(response.status, 400);
  });

  test('returns 404 for an unknown id', async () => {
    const response = await request('PUT', '/api/users/42', {
      name: 'Олена',
      email: 'olena@example.com',
    });
    assert.equal(response.status, 404);
  });

  test("keeps the own email but rejects another user's email", async () => {
    const olena = await createUser();
    await createUser({ name: 'Іван Петренко', email: 'ivan@example.com' });
    const own = await request('PUT', `/api/users/${olena.id}`, {
      name: 'Олена',
      email: 'olena@example.com',
    });
    assert.equal(own.status, 200);
    const taken = await request('PUT', `/api/users/${olena.id}`, {
      name: 'Олена',
      email: 'ivan@example.com',
    });
    assert.equal(taken.status, 409);
  });
});

describe('PATCH /api/users/:id', () => {
  test('changes only the fields sent', async () => {
    const created = await createUser();
    const response = await request('PATCH', `/api/users/${created.id}`, {
      age: 24,
    });
    assert.equal(response.status, 200);
    const user = await response.json();
    assert.deepEqual(
      { name: user.name, email: user.email, age: user.age },
      { name: created.name, email: created.email, age: 24 },
    );
  });

  test('rejects an empty change', async () => {
    const created = await createUser();
    const response = await request('PATCH', `/api/users/${created.id}`, {});
    assert.equal(response.status, 400);
  });

  test('returns 404 for an unknown id', async () => {
    const response = await request('PATCH', '/api/users/42', { age: 24 });
    assert.equal(response.status, 404);
  });
});

describe('DELETE /api/users/:id', () => {
  test('deletes the user and returns 204 with no body', async () => {
    const created = await createUser();
    const response = await request('DELETE', `/api/users/${created.id}`);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(
      (await request('GET', `/api/users/${created.id}`)).status,
      404,
    );
  });

  test('returns 404 for an unknown id', async () => {
    const response = await request('DELETE', '/api/users/42');
    assert.equal(response.status, 404);
  });
});

describe('service routes', () => {
  test('GET / describes the API', async () => {
    const body = await (await request('GET', '/')).json();
    assert.equal(body.resources.users, '/api/users');
  });

  test('serves the OpenAPI document', async () => {
    const spec = await (await request('GET', '/openapi.json')).json();
    assert.deepEqual(Object.keys(spec.paths), [
      '/api/users',
      '/api/users/{id}',
    ]);
  });

  test('returns JSON 404 for an unknown route', async () => {
    const response = await request('GET', '/api/unknown');
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'NotFound');
  });
});
