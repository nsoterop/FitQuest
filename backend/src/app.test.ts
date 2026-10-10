import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import { buildApp } from './app.js';
import type { ProfileStore, SavedProfile } from './profileStore.js';
const accounts = {
  alice: {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  },
  bob: {
    userId: '22222222-2222-4222-8222-222222222222',
    sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  },
};
const headers = { authorization: 'Bearer alice' };
function dependencies() {
  const profiles = new Map<string, SavedProfile>();
  const store: ProfileStore = {
    sessionActive: async () => true,
    save: async (account, profile) => {
      profiles.set(account.userId, {
        ...profile,
        ageCapturedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    read: async (account) => profiles.get(account.userId) ?? null,
  };
  return {
    store,
    verifyAccount: async (token: string) => accounts[token as keyof typeof accounts] ?? null,
  };
}

test('GET /health returns the public API health contract', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] ?? '', /application\/json/);
  assert.deepEqual(response.json(), { service: 'fitquest-api', status: 'ok' });
});

test('an unknown path cannot return a successful health response', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/missing' });
  assert.equal(response.statusCode, 404);
});

const intake = {
  firstName: 'Alex',
  lastName: 'Example',
  height: { value: 68, unit: 'in' },
  age: 29,
  weight: { value: 155.5, unit: 'lb' },
  gender: 'Prefer not to say',
};

test('POST /profile-intake commits all six fields before acknowledgment and supports repeat saves', async (t) => {
  const app = buildApp(false, dependencies());
  t.after(() => app.close());
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers,
      payload: intake,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { message: 'User Data Saved' });
  }
  assert.equal((await app.inject({ method: 'GET', url: '/profile-intake' })).statusCode, 404);
});

test('intake rejects missing, malformed, out-of-range and ambiguous-unit data without coercion', async (t) => {
  const app = buildApp(false, dependencies());
  t.after(() => app.close());
  const invalid: unknown[] = [null, [], {}, { ...intake, extra: 'unexpected' }];
  for (const key of Object.keys(intake)) {
    const missing = { ...intake } as Record<string, unknown>;
    delete missing[key];
    invalid.push(missing, { ...intake, [key]: null });
  }
  for (const key of ['firstName', 'lastName', 'gender']) {
    for (const value of ['', '   ', 123, 'a'.repeat(101)])
      invalid.push({ ...intake, [key]: value });
  }
  for (const age of [0, -1, 131, 29.5, '29', true]) invalid.push({ ...intake, age });
  for (const height of [
    68,
    { value: 68 },
    { unit: 'in' },
    { value: 68, unit: 'cm' },
    { value: '68', unit: 'in' },
    { value: 0, unit: 'in' },
    { value: 121, unit: 'in' },
    { value: 68.5, unit: 'in' },
    { value: 68, unit: 'in', extra: true },
  ])
    invalid.push({ ...intake, height });
  for (const weight of [
    155,
    { value: 155 },
    { unit: 'lb' },
    { value: 70, unit: 'kg' },
    { value: '155', unit: 'lb' },
    { value: 0, unit: 'lb' },
    { value: -1, unit: 'lb' },
    { value: 1501, unit: 'lb' },
    { value: 155, unit: 'lb', extra: true },
  ])
    invalid.push({ ...intake, weight });
  for (const payload of invalid) {
    const response = await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      message: 'Check all six fields and use inches and pounds.',
    });
  }
  for (const contentType of ['text/plain', 'application/octet-stream']) {
    const response = await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers: { ...headers, 'content-type': contentType },
      payload: JSON.stringify(intake),
    });
    assert.ok(response.statusCode >= 400 && response.statusCode < 500);
  }
});

test('valid input, parser failures and validation errors never log or echo personal values', async (t) => {
  let logs = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });
  const app = buildApp({ stream }, dependencies());
  t.after(() => app.close());
  const marker = 'InventedPrivacyMarker';
  const responses = [
    await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers,
      payload: { ...intake, firstName: marker },
    }),
    await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers,
      payload: { firstName: marker },
    }),
    await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: `{"firstName":"${marker}" invalid`,
    }),
  ];
  for (const response of responses) assert.equal(response.body.includes(marker), false);
  assert.equal(logs, '');
  await app.inject({ method: 'GET', url: '/health' });
  assert.ok(logs.includes('incoming request'), 'the test logger must actually capture logs');
  assert.equal(logs.includes(marker), false);
});

test('missing, invalid and expired identity cannot reach storage; health stays public', async (t) => {
  const deps = dependencies();
  let touched = 0;
  deps.store.sessionActive = async () => {
    touched++;
    return true;
  };
  const app = buildApp(false, deps);
  t.after(() => app.close());
  for (const authorization of [
    '',
    'Bearer invalid',
    'Bearer expired',
    'Bearer alice extra',
    'Basic alice',
  ]) {
    for (const method of ['GET', 'POST'] as const) {
      const r = await app.inject({
        method,
        url: method === 'GET' ? '/profile' : '/profile-intake',
        headers: { authorization },
        ...(method === 'POST' ? { payload: intake } : {}),
      });
      assert.equal(r.statusCode, 401);
      assert.equal(r.headers['cache-control'], 'no-store');
    }
  }
  assert.equal(touched, 0);
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
});

test('two identities see only their profile; payload ownership and aliases cannot impersonate', async (t) => {
  const app = buildApp(false, dependencies());
  t.after(() => app.close());
  assert.deepEqual(
    (
      await app.inject({ method: 'GET', url: '/profile', headers: { authorization: 'Bearer bob' } })
    ).json(),
    { profile: null },
  );
  await app.inject({ method: 'POST', url: '/profile-intake', headers, payload: intake });
  await app.inject({
    method: 'POST',
    url: '/profile-intake',
    headers: { authorization: 'Bearer bob' },
    payload: { ...intake, firstName: 'Jordan' },
  });
  const a = (await app.inject({ method: 'GET', url: '/profile?userId=bob', headers })).json()
    .profile;
  const b = (
    await app.inject({
      method: 'GET',
      url: '/profile?userId=alice',
      headers: { authorization: 'Bearer bob' },
    })
  ).json().profile;
  assert.equal(a.firstName, 'Alex');
  assert.equal(b.firstName, 'Jordan');
  for (const key of ['userId', 'user_id', 'user_metadata']) {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/profile-intake',
          headers,
          payload: { ...intake, [key]: 'bob' },
        })
      ).statusCode,
      400,
    );
  }
});

test('signed-out session is rejected even with a verified unexpired token', async (t) => {
  const deps = dependencies();
  deps.store.sessionActive = async () => false;
  const app = buildApp(false, deps);
  t.after(() => app.close());
  assert.equal(
    (await app.inject({ method: 'POST', url: '/profile-intake', headers, payload: intake }))
      .statusCode,
    401,
  );
  assert.equal((await app.inject({ method: 'GET', url: '/profile', headers })).statusCode, 401);
});

test('a database write or COMMIT failure never returns User Data Saved', async (t) => {
  const deps = dependencies();
  deps.store.save = async () => {
    throw new Error('private database parameters');
  };
  deps.store.read = async () => {
    throw new Error('private database parameters');
  };
  const app = buildApp(false, deps);
  t.after(() => app.close());
  for (const method of ['POST', 'GET'] as const) {
    const r = await app.inject({
      method,
      url: method === 'POST' ? '/profile-intake' : '/profile',
      headers,
      ...(method === 'POST' ? { payload: intake } : {}),
    });
    assert.equal(r.statusCode, 503);
    assert.equal(r.body.includes('User Data Saved'), false);
    assert.equal(r.body.includes('private'), false);
  }
});

test('success waits for the storage promise to commit', async (t) => {
  const deps = dependencies();
  let commit!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  deps.store.save = () => {
    entered();
    return new Promise<void>((resolve) => {
      commit = resolve;
    });
  };
  const app = buildApp(false, deps);
  t.after(() => app.close());
  let complete = false;
  const pending = app
    .inject({ method: 'POST', url: '/profile-intake', headers, payload: intake })
    .then((r) => {
      complete = true;
      return r;
    });
  await started;
  assert.equal(complete, false);
  commit();
  assert.deepEqual((await pending).json(), { message: 'User Data Saved' });
});
