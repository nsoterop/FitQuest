import assert from 'node:assert/strict';
import test from 'node:test';
import { submitIntake, validateIntake } from './profileIntake.ts';

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
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(options.body), payload);
    return { status: 200, json: async () => ({ message: 'User Data Saved' }) };
  };
  assert.deepEqual(await submitIntake(`${apiUrl}/`, payload, signal, fetcher), { success: true });
  assert.equal(calls, 1);
  assert.deepEqual(payload, snapshot);
});

test('only HTTP 200 with the exact acknowledgment succeeds; failures preserve input', async () => {
  const signal = new AbortController().signal;
  const snapshot = structuredClone(payload);
  for (const status of [201, 204, 400, 401, 404, 500]) {
    assert.ok('error' in await submitIntake(apiUrl, payload, signal, response(status, { message: 'User Data Saved' })));
  }
  assert.deepEqual(await submitIntake(apiUrl, payload, signal, response(404, {})), {
    error: 'Profile submission is not available on the backend yet. Please try again after it is updated.',
  });
  for (const body of [null, [], {}, 'User Data Saved', { message: 'Saved' }]) {
    assert.ok('error' in await submitIntake(apiUrl, payload, signal, response(200, body)));
  }
  for (const fetcher of [async () => { throw new Error('offline'); },
    async () => ({ status: 200, json: async () => { throw new SyntaxError('bad JSON'); } })]) {
    assert.ok('error' in await submitIntake(apiUrl, payload, signal, fetcher));
  }
  assert.deepEqual(payload, snapshot);
});

test('bad configuration never transmits personal fields', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('unexpected request'); };
  for (const url of [undefined, '', 'invalid', 'http://localhost:10000', 'https://user:password@example.com']) {
    assert.ok('error' in await submitIntake(url, payload, new AbortController().signal, fetcher));
  }
  assert.equal(calls, 0);
});

test('aborted submissions cannot show success even if a late response arrives', async () => {
  const controller = new AbortController();
  const fetcher = async () => {
    controller.abort();
    return { status: 200, json: async () => ({ message: 'User Data Saved' }) };
  };
  assert.ok('error' in await submitIntake(apiUrl, payload, controller.signal, fetcher));
  assert.ok('error' in await submitIntake(apiUrl, payload, controller.signal, response(200, { message: 'User Data Saved' })));
});
