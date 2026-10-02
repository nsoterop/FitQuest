import assert from 'node:assert/strict';
import test from 'node:test';
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
