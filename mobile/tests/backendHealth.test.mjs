import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBackendHealth } from '../src/services/backendHealth.ts';

const apiUrl = 'https://fitquest-api.example';
const healthyBody = { service: 'fitquest-api', status: 'ok' };
const response = (status, body) => async () => ({
  status,
  json: async () => body,
});

test('only HTTP 200 with both expected fields confirms connection', async () => {
  const signal = new AbortController().signal;
  assert.equal(await checkBackendHealth(apiUrl, signal, response(200, healthyBody)), true);
  for (const status of [201, 204, 404, 500]) {
    assert.equal(await checkBackendHealth(apiUrl, signal, response(status, healthyBody)), false);
  }
  for (const body of [
    null,
    [],
    {},
    'ok',
    { status: 'ok' },
    { service: 'other', status: 'ok' },
    { service: 'fitquest-api', status: 'error' },
  ]) {
    assert.equal(await checkBackendHealth(apiUrl, signal, response(200, body)), false);
  }
});

test('the health request uses the configured HTTPS base URL and cancellation signal', async () => {
  const signal = new AbortController().signal;
  const fetcher = async (url, options) => {
    assert.equal(url, `${apiUrl}/health`);
    assert.equal(options.signal, signal);
    return { status: 200, json: async () => healthyBody };
  };
  assert.equal(await checkBackendHealth(`${apiUrl}/`, signal, fetcher), true);
});

test('missing, invalid or non-HTTPS configuration never issues a request', async () => {
  let requests = 0;
  const fetcher = async () => {
    requests++;
    throw new Error('unexpected request');
  };
  for (const url of [
    undefined,
    '',
    'invalid',
    'http://localhost:10000',
    'https://user:password@example.com',
  ]) {
    assert.equal(await checkBackendHealth(url, new AbortController().signal, fetcher), false);
  }
  assert.equal(requests, 0);
});

test('network and malformed JSON failures are unavailable', async () => {
  const signal = new AbortController().signal;
  assert.equal(
    await checkBackendHealth(apiUrl, signal, async () => {
      throw new Error('offline');
    }),
    false,
  );
  assert.equal(
    await checkBackendHealth(apiUrl, signal, async () => ({
      status: 200,
      json: async () => {
        throw new SyntaxError('not JSON');
      },
    })),
    false,
  );
});

test('a timed-out or cleaned-up request cannot confirm connection', async () => {
  const controller = new AbortController();
  const fetcher = async () => {
    controller.abort();
    return { status: 200, json: async () => healthyBody };
  };
  assert.equal(await checkBackendHealth(apiUrl, controller.signal, fetcher), false);
  assert.equal(
    await checkBackendHealth(apiUrl, controller.signal, response(200, healthyBody)),
    false,
  );
});
