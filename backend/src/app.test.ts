import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import { buildApp } from './app.js';

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
  firstName: 'Alex', lastName: 'Example', height: { value: 68, unit: 'in' },
  age: 29, weight: { value: 155.5, unit: 'lb' }, gender: 'Prefer not to say',
};

test('POST /profile-intake acknowledges all six fields without returning a profile or read API', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await app.inject({ method: 'POST', url: '/profile-intake', payload: intake });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { message: 'User Data Saved' });
  }
  assert.equal((await app.inject({ method: 'GET', url: '/profile-intake' })).statusCode, 404);
});

test('intake rejects missing, malformed, out-of-range and ambiguous-unit data without coercion', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const invalid: unknown[] = [null, [], {}, { ...intake, extra: 'unexpected' }];
  for (const key of Object.keys(intake)) {
    const missing = { ...intake } as Record<string, unknown>;
    delete missing[key];
    invalid.push(missing, { ...intake, [key]: null });
  }
  for (const key of ['firstName', 'lastName', 'gender']) {
    for (const value of ['', '   ', 123, 'a'.repeat(101)]) invalid.push({ ...intake, [key]: value });
  }
  for (const age of [0, -1, 131, 29.5, '29', true]) invalid.push({ ...intake, age });
  for (const height of [68, { value: 68 }, { unit: 'in' }, { value: 68, unit: 'cm' },
    { value: '68', unit: 'in' }, { value: 0, unit: 'in' }, { value: 121, unit: 'in' },
    { value: 68.5, unit: 'in' }, { value: 68, unit: 'in', extra: true }]) invalid.push({ ...intake, height });
  for (const weight of [155, { value: 155 }, { unit: 'lb' }, { value: 70, unit: 'kg' },
    { value: '155', unit: 'lb' }, { value: 0, unit: 'lb' }, { value: -1, unit: 'lb' },
    { value: 1501, unit: 'lb' }, { value: 155, unit: 'lb', extra: true }]) invalid.push({ ...intake, weight });
  for (const payload of invalid) {
    const response = await app.inject({ method: 'POST', url: '/profile-intake',
      headers: { 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { message: 'Check all six fields and use inches and pounds.' });
  }
  for (const contentType of ['text/plain', 'application/octet-stream']) {
    const response = await app.inject({ method: 'POST', url: '/profile-intake',
      headers: { 'content-type': contentType }, payload: JSON.stringify(intake) });
    assert.ok(response.statusCode >= 400 && response.statusCode < 500);
  }
});

test('valid input, parser failures and validation errors never log or echo personal values', async (t) => {
  let logs = '';
  const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } });
  const app = buildApp({ stream });
  t.after(() => app.close());
  const marker = 'InventedPrivacyMarker';
  const responses = [
    await app.inject({ method: 'POST', url: '/profile-intake', payload: { ...intake, firstName: marker } }),
    await app.inject({ method: 'POST', url: '/profile-intake', payload: { firstName: marker } }),
    await app.inject({ method: 'POST', url: '/profile-intake', headers: { 'content-type': 'application/json' },
      payload: `{"firstName":"${marker}" invalid` }),
  ];
  for (const response of responses) assert.equal(response.body.includes(marker), false);
  assert.equal(logs, '');
  await app.inject({ method: 'GET', url: '/health' });
  assert.ok(logs.includes('incoming request'), 'the test logger must actually capture logs');
  assert.equal(logs.includes(marker), false);
});
