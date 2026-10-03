import assert from 'node:assert/strict';
import test from 'node:test';
import { submitIntake, validateIntake, loadProfile, profileFields } from './profileIntake.ts';

const fields = { firstName: ' Alex ', lastName: ' Example ', heightFeet: '5', heightInches: '8',
  age: '29', weight: '155.5', gender: ' Prefer not to say ' };
const payload = { firstName: 'Alex', lastName: 'Example', height: { value: 68, unit: 'in' },
  age: 29, weight: { value: 155.5, unit: 'lb' }, gender: 'Prefer not to say' };
const apiUrl = 'https://fitquest-api.example';
const response = (status, body) => async () => ({ status, json: async () => body });

test('current form fields become six explicit API fields with total inches and pounds', () => {
  assert.deepEqual(validateIntake(fields), { payload });
  assert.deepEqual(validateIntake({ ...fields, firstName: 'Renée', heightFeet: '6', heightInches: '0',
    age: '31', weight: '180', gender: 'Nonbinary' }), { payload: { ...payload,
    firstName: 'Renée', height: { value: 72, unit: 'in' }, age: 31,
    weight: { value: 180, unit: 'lb' }, gender: 'Nonbinary' } });
});

test('each field is required and invalid numbers cannot become a successful payload', () => {
  for (const key of Object.keys(fields)) assert.ok('error' in validateIntake({ ...fields, [key]: '' }));
  const invalid = { firstName: ['   ', 'a'.repeat(101)], lastName: ['   ', 'a'.repeat(101)],
    gender: ['   ', 'a'.repeat(101)], age: ['0', '-1', '131', '29.5', 'abc', 'Infinity'],
    heightFeet: ['-1', '5.5', '11', 'abc', 'Infinity'], heightInches: ['12', '-1', '1.5', 'abc'],
    weight: ['0', '-1', '1501', '1e2', 'NaN', 'Infinity', 'abc'] };
  for (const [key, values] of Object.entries(invalid)) {
    for (const value of values) assert.ok('error' in validateIntake({ ...fields, [key]: value }));
  }
  assert.ok('error' in validateIntake({ ...fields, heightFeet: '0', heightInches: '0' }));
});

test('submission sends all current values as JSON over configured HTTPS without mutating input', async () => {
  const signal = new AbortController().signal;
  const snapshot = structuredClone(payload);
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, `${apiUrl}/profile-intake`);
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' });
    assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(options.body), payload);
    return { status: 200, json: async () => ({ message: 'User Data Saved' }) };
  };
  assert.deepEqual(await submitIntake(`${apiUrl}/`, payload, signal, 'test-token', fetcher), { success: true });
  assert.equal(calls, 1);
  assert.deepEqual(payload, snapshot);
});

test('only HTTP 200 with the exact acknowledgment succeeds; failures preserve input', async () => {
  const signal = new AbortController().signal;
  const snapshot = structuredClone(payload);
  for (const status of [201, 204, 400, 401, 404, 500]) {
    assert.ok('error' in await submitIntake(apiUrl, payload, signal, 'test-token', response(status, { message: 'User Data Saved' })));
  }
  assert.deepEqual(await submitIntake(apiUrl, payload, signal, 'test-token', response(404, {})), {
    error: 'Profile submission is not available on the backend yet. Please try again after it is updated.',
  });
  for (const body of [null, [], {}, 'User Data Saved', { message: 'Saved' }]) {
    assert.ok('error' in await submitIntake(apiUrl, payload, signal, 'test-token', response(200, body)));
  }
  for (const fetcher of [async () => { throw new Error('offline'); },
    async () => ({ status: 200, json: async () => { throw new SyntaxError('bad JSON'); } })]) {
    assert.ok('error' in await submitIntake(apiUrl, payload, signal, 'test-token', fetcher));
  }
  assert.deepEqual(payload, snapshot);
});

test('bad configuration never transmits personal fields', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('unexpected request'); };
  for (const url of [undefined, '', 'invalid', 'http://localhost:10000', 'https://user:password@example.com']) {
    assert.ok('error' in await submitIntake(url, payload, new AbortController().signal, 'test-token', fetcher));
  }
  assert.equal(calls, 0);
});

test('aborted submissions cannot show success even if a late response arrives', async () => {
  const controller = new AbortController();
  const fetcher = async () => {
    controller.abort();
    return { status: 200, json: async () => ({ message: 'User Data Saved' }) };
  };
  assert.ok('error' in await submitIntake(apiUrl, payload, controller.signal, 'test-token', fetcher));
  assert.ok('error' in await submitIntake(apiUrl, payload, controller.signal, 'test-token', response(200, { message: 'User Data Saved' })));
});

test('saved profile restores display units and validates server shape', async () => {
  const saved = { ...payload, ageCapturedAt: '2026-10-02T12:00:00Z', updatedAt: '2026-10-02T12:00:00Z' };
  const controller = new AbortController();
  assert.deepEqual(profileFields(saved), { ...fields, firstName: 'Alex', lastName: 'Example', gender: 'Prefer not to say' });
  const fetcher = async (url, options) => {
    assert.equal(url, `${apiUrl}/profile`); assert.equal(options.headers.Authorization, 'Bearer test-token');
    return { status: 200, json: async () => ({ profile: saved }) };
  };
  assert.deepEqual(await loadProfile(apiUrl, controller.signal, 'test-token', fetcher), { profile: saved });
  assert.deepEqual(await loadProfile(apiUrl, controller.signal, 'test-token', response(200, { profile: null })), { profile: null });
  for (const profile of [{ ...saved, height: { value: 170, unit: 'cm' } }, { ...saved, age: '29' },
    { ...saved, updatedAt: 'invalid' }, { ...saved, weight: { value: -1, unit: 'lb' } }, {}]) {
    assert.ok('error' in await loadProfile(apiUrl, controller.signal, 'test-token', response(200, { profile })));
  }
});

test('logout/account switch cancellation discards delayed profile reads and saves', async () => {
  for (const operation of ['read', 'save']) {
    const controller = new AbortController(); let deliver;
    const delayed = async () => new Promise(resolve => { deliver = () => resolve({ status: 200,
      json: async () => operation === 'read' ? { profile: null } : { message: 'User Data Saved' } }); });
    const request = operation === 'read' ? loadProfile(apiUrl, controller.signal, 'old-account-token', delayed)
      : submitIntake(apiUrl, payload, controller.signal, 'old-account-token', delayed);
    controller.abort(); deliver(); assert.ok('error' in await request);
  }
});

test('missing auth cannot transmit profile fields', async () => {
  let calls = 0;
  assert.ok('error' in await submitIntake(apiUrl, payload, new AbortController().signal, '', async () => { calls++; }));
  assert.equal(calls, 0);
});
