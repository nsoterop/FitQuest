import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import { buildApp } from '../../app.js';
import type { ProfileStore, SavedProfile } from '../../features/account/profileStore.js';
import {
  planningConsentVersion,
  planningConsentScope,
  recurringConsentVersion,
  recurringConsentScope,
} from '../../shared/planningConsent.js';
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

test('workout completion route verifies the account, returns minimal status and never caches private data', async (t) => {
  const unused = async () => {
    throw Error('Unexpected journal write');
  };
  const calls: unknown[] = [];
  const planId = 'cccccccc-1111-4111-8111-111111111111';
  const app = buildApp(false, {
    ...dependencies(),
    journal: {
      sessionStates: unused,
      list: unused,
      read: unused,
      readOperation: unused,
      command: unused,
      completedSessions: async (account, id, revision) => {
        calls.push({ account, id, revision });
        return { planId: id, revision, sessions: [{ date: '2026-10-05', sessionIndex: 0 }] };
      },
    },
  });
  t.after(() => app.close());
  const url = `/workout-journal/completed-sessions?planId=${planId}&revision=2`;
  const denied = await app.inject({ method: 'GET', url });
  assert.equal(denied.statusCode, 401);
  assert.equal(calls.length, 0);
  const reply = await app.inject({ method: 'GET', url, headers });
  assert.equal(reply.statusCode, 200);
  assert.equal(reply.headers['cache-control'], 'no-store');
  assert.deepEqual(calls, [{ account: accounts.alice, id: planId, revision: 2 }]);
  assert.deepEqual(reply.json(), {
    planId,
    revision: 2,
    sessions: [{ date: '2026-10-05', sessionIndex: 0 }],
  });
});

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
  gender: 'Male',
};

test('training permission HTTP route preserves both revisions and validates history revision', async (t) => {
  const calls: unknown[] = [];
  const unused = async () => {
    throw Error('Unexpected planning operation');
  };
  const app = buildApp(false, {
    ...dependencies(),
    planning: {
      schedule: unused,
      scheduled: unused,
      historyConsent: unused,
      ensureNextWeek: unused,
      read: unused,
      edit: unused,
      ensurePlan: unused,
      accept: unused,
      consent: async (account, request) => {
        assert.deepEqual(account, accounts.alice);
        calls.push(request);
        return {
          summary: null,
          plans: [],
          onboarded: false,
          nextOffset: null,
          schedule: null,
          consent: null,
          historyConsent: null,
        };
      },
      nutrition: unused,
      review: unused,
      generate: unused,
    },
  });
  t.after(() => app.close());
  const permission = {
    version: recurringConsentVersion,
    scope: recurringConsentScope,
    granted: true,
    expectedRevision: 0,
    expectedHistoryRevision: 0,
  };
  for (const payload of [
    permission,
    { ...permission, granted: false, expectedRevision: 3, expectedHistoryRevision: 5 },
    {
      version: planningConsentVersion,
      scope: planningConsentScope,
      granted: true,
      expectedRevision: 0,
    },
  ]) {
    const response = await app.inject({
      method: 'PUT',
      url: '/training/consent',
      headers,
      payload,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(calls.at(-1), payload);
  }
  for (const expectedHistoryRevision of [-1, 0.5, '0', null, 1000001]) {
    const response = await app.inject({
      method: 'PUT',
      url: '/training/consent',
      headers,
      payload: { ...permission, expectedHistoryRevision },
    });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls.length, 3);
});

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

test('every private route uses the shared pre-auth burst guard and ignores spoofed forwarding headers', async (t) => {
  const app = buildApp(false);
  t.after(() => app.close());
  const routes = [
    ['GET', '/profile'],
    ['POST', '/profile-intake'],
    ['GET', '/training'],
    ['POST', '/training/generate'],
    ['GET', '/food'],
    ['POST', '/food/commands'],
    ['GET', '/food-library'],
    ['POST', '/food-library/commands'],
    ['GET', '/body-weight'],
    ['POST', '/body-weight/commands'],
    ['GET', '/workout-journal'],
    [
      'GET',
      '/workout-journal/completed-sessions?planId=11111111-1111-4111-8111-111111111111&revision=1',
    ],
    ['POST', '/workout-journal/commands'],
    ['POST', '/onboarding'],
    ['GET', '/onboarding/11111111-1111-4111-8111-111111111111'],
  ] as const;
  for (let i = 0; i < 120; i++) {
    const [method, url] = routes[i % routes.length]!;
    assert.equal(
      (await app.inject({ method, url, headers: { 'x-forwarded-for': `203.0.113.${i}` } }))
        .statusCode,
      401,
    );
  }
  for (const [method, url] of routes) {
    const reply = await app.inject({
      method,
      url,
      headers: { 'x-forwarded-for': '198.51.100.88', 'x-real-ip': '192.0.2.99' },
    });
    assert.equal(reply.statusCode, 429, url);
    assert.equal(reply.headers['cache-control'], 'no-store');
    assert(Number(reply.headers['retry-after']) >= 1);
  }
  assert.equal((await app.inject({ url: '/health' })).statusCode, 200);
});

test('durable account throttle runs before private body parsing and fails closed without leaking diagnostics', async (t) => {
  const deps = dependencies();
  let count = 0;
  const app = buildApp(false, {
    ...deps,
    accountRequestGuard: async () => {
      count++;
      return 37;
    },
  });
  t.after(() => app.close());
  const reply = await app.inject({
    method: 'POST',
    url: '/profile-intake',
    headers,
    payload: { malicious: 'private payload' },
  });
  assert.equal(count, 1);
  assert.equal(reply.statusCode, 429);
  assert.equal(reply.headers['retry-after'], '37');
  assert(!reply.body.includes('private payload'));
  const failed = buildApp(false, {
    ...deps,
    accountRequestGuard: async () => {
      throw Error('postgres credential secret');
    },
  });
  t.after(() => failed.close());
  const denied = await failed.inject({ url: '/profile', headers });
  assert.equal(denied.statusCode, 503);
  assert(!denied.body.includes('credential'));
});

test('private training, food, journal and weight requests never log input, credentials or thrown service details', async (t) => {
  const marker = 'InventedPrivateTrainingAndCredentialMarker';
  let logs = '',
    calls = 0;
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });
  const fail = async () => {
    calls++;
    throw new Error(marker);
  };
  const deps = dependencies();
  deps.store.read = fail;
  const app = buildApp(
    { stream },
    {
      ...deps,
      verifyAccount: async (token) => (token === marker ? accounts.alice : null),
      planning: {
        schedule: fail,
        scheduled: fail,
        historyConsent: fail,
        ensureNextWeek: fail,
        read: fail,
        edit: fail,
        ensurePlan: fail,
        accept: fail,
        consent: fail,
        nutrition: fail,
        review: fail,
        generate: fail,
      },
      food: { read: fail, readOperation: fail, command: fail },
      journal: {
        sessionStates: fail,
        completedSessions: fail,
        list: fail,
        read: fail,
        readOperation: fail,
        command: fail,
      },
      weight: { list: fail, read: fail, readOperation: fail, command: fail },
      library: { read: fail, readOperation: fail, command: fail },
      onboarding: { create: fail, clarify: fail, read: fail, remove: fail, command: fail },
    },
  );
  t.after(() => app.close());
  const id = '11111111-1111-4111-8111-111111111111';
  const routes = [
    { method: 'GET', url: `/profile?private=${marker}` },
    { method: 'GET', url: `/training?private=${marker}` },
    { method: 'GET', url: `/onboarding/${id}?private=${marker}` },
    {
      method: 'POST',
      url: '/training/review',
      payload: {
        summaryRevision: 1,
        planRevision: 1,
        planId: id,
        feedback: marker,
        retryAttempt: null,
      },
    },
    { method: 'POST', url: '/training/next-week', payload: { operationId: id, changes: marker } },
    {
      method: 'POST',
      url: '/food/commands',
      payload: {
        operationId: id,
        kind: 'interpret',
        message: marker,
        date: '2026-10-12',
        timeZone: 'UTC',
        previousOperation: null,
        entryId: null,
        expectedRevision: null,
      },
    },
    { method: 'POST', url: '/workout-journal/commands', payload: { notes: marker } },
    { method: 'POST', url: '/body-weight/commands', payload: { notes: marker } },
    { method: 'POST', url: '/food-library/commands', payload: { notes: marker } },
  ] as const;
  for (const route of routes) {
    const response = await app.inject({ ...route, headers: { authorization: `Bearer ${marker}` } });
    assert.equal(response.statusCode, 503, route.url);
    assert.equal(response.headers['cache-control'], 'no-store');
    if (route.url.startsWith('/profile'))
      assert.deepEqual(response.json(), {
        message: 'Unable to load your profile. Please try again.',
      });
    else assert.equal(response.json().code, 'unavailable');
    assert(!response.body.includes(marker));
  }
  assert.equal(calls, routes.length, 'all intended private handlers were exercised');
  for (const url of [
    '/training/review',
    '/food/commands',
    '/workout-journal/commands',
    '/body-weight/commands',
  ]) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${marker}`, 'content-type': 'application/json' },
      payload: `{"notes":"${marker}" invalid`,
    });
    assert.equal(response.statusCode, 400);
    assert(!response.body.includes(marker));
  }
  assert.equal(calls, routes.length, 'malformed payloads never reach services');
  assert.equal(logs, '');
  await app.inject({ url: '/health' });
  assert(logs.includes('incoming request'), 'the logger must capture the public control request');
  assert(!logs.includes(marker));
});

test('birthday intake derives age, rejects invalid dates and ambiguous age, and keeps old clients compatible', async (t) => {
  const deps = dependencies(),
    app = buildApp(false, deps);
  t.after(() => app.close());
  const { age: _age, ...profile } = intake;
  const valid = { ...profile, birthday: '1997-01-01' };
  assert.equal(
    (await app.inject({ method: 'POST', url: '/profile-intake', headers, payload: valid }))
      .statusCode,
    200,
  );
  const saved = await deps.store.read(accounts.alice);
  assert.equal(saved?.birthday, valid.birthday);
  assert.equal(saved?.age, new Date().getUTCFullYear() - 1997);
  for (const body of [
    { ...valid, birthday: '2026-02-30' },
    { ...valid, birthday: '2025-02-29' },
    { ...valid, birthday: '9999-01-01' },
    { ...valid, birthday: '0000-01-01' },
    { ...valid, age: 29 },
    { ...valid, gender: 'Unspecified' },
  ]) {
    const reply = await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers,
      payload: body,
    });
    assert.equal(reply.statusCode, 400);
    assert.deepEqual(await deps.store.read(accounts.alice), saved);
    assert(!reply.body.includes(body.birthday));
  }
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/profile-intake',
        headers,
        payload: { ...intake, gender: 'Prefer not to say' },
      })
    ).statusCode,
    200,
  );
});
