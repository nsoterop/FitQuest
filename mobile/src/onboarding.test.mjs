import assert from 'node:assert/strict';
import test from 'node:test';
import { onboardingDrafts } from './onboardingDraft.ts';
import { secureSessionStorage } from './secureSessionStorage.ts';
import { onboardingRequest, operationId } from './onboardingApi.ts';
test('device draft is bounded, expires, separates accounts, and clears encrypted pending operation', async () => {
  const map = new Map();
  const storage = secureSessionStorage({
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => {
      map.set(k, v);
    },
    deleteItemAsync: async (k) => {
      map.delete(k);
    },
  });
  const drafts = onboardingDrafts(storage);
  const draft = {
    conversationId: 'conversation',
    text: 'Coordination matters',
    pending: {
      operationId: operationId(),
      expectedRevision: 1,
      kind: 'message',
      text: 'Coordination matters',
    },
    savedAt: Date.now(),
  };
  await drafts.write('alice', draft);
  assert.deepEqual(await drafts.read('alice'), draft);
  assert.equal(await drafts.read('bob'), null);
  await assert.rejects(drafts.write('alice', { ...draft, text: 'x'.repeat(4001) }));
  assert.deepEqual(await drafts.read('alice'), draft);
  await drafts.write('alice', { ...draft, savedAt: Date.now() - 86400001 });
  assert.equal(await drafts.read('alice'), null);
  assert.equal(map.size, 0);
  await drafts.write('alice', draft);
  await drafts.clear('alice');
  assert.equal(await drafts.read('alice'), null);
  assert.equal(map.size, 0);
});
test('onboarding API checks HTTPS, validates reply, cancels stale requests, and preserves sanitized auth/conflict feedback', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:10000';
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return { status: 200, json: async () => ({}) };
  };
  await assert.rejects(
    onboardingRequest('POST', null, null, 'synthetic', new AbortController().signal, fetcher),
  );
  assert.equal(calls, 0);
  process.env.EXPO_PUBLIC_API_URL = 'https://fitquest-api.example';
  await assert.rejects(
    onboardingRequest('GET', 'id', null, 'synthetic', new AbortController().signal, async () => ({
      status: 401,
      json: async () => ({ message: 'private' }),
    })),
    (error) => error.sessionEnded && !error.message.includes('private'),
  );
  await assert.rejects(
    onboardingRequest('GET', 'id', null, 'synthetic', new AbortController().signal, async () => ({
      status: 409,
      json: async () => ({ code: 'revision_conflict', message: 'private' }),
    })),
    (error) => error.code === 'revision_conflict' && !error.message.includes('private'),
  );
  await assert.rejects(
    onboardingRequest('GET', 'id', null, 'synthetic', new AbortController().signal, fetcher),
  );
  const controller = new AbortController();
  const delayed = async () => {
    controller.abort();
    return { status: 204, json: async () => ({}) };
  };
  await assert.rejects(
    onboardingRequest('DELETE', 'id', null, 'synthetic', controller.signal, delayed),
  );
  assert.equal(
    await onboardingRequest(
      'DELETE',
      'id',
      null,
      'synthetic',
      new AbortController().signal,
      async () => ({ status: 204, json: async () => ({}) }),
    ),
    null,
  );
});

test('deletion receipts must match the requested conversation and cannot contain deleted content', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://fitquest-api.example';
  const signal = new AbortController().signal;
  const receipt = { id: 'old', deleted: true, message: 'Conversation deleted.' };
  assert.deepEqual(
    await onboardingRequest('GET', 'old', null, 'synthetic', signal, async () => ({
      status: 200,
      json: async () => receipt,
    })),
    receipt,
  );
  for (const body of [
    { ...receipt, id: 'new' },
    { ...receipt, turns: [{ message: 'private' }] },
    { ...receipt, deleted: 'true' },
  ])
    await assert.rejects(
      onboardingRequest('GET', 'old', null, 'synthetic', signal, async () => ({
        status: 200,
        json: async () => body,
      })),
    );
  await assert.rejects(
    onboardingRequest('POST', null, null, 'synthetic', signal, async () => ({
      status: 200,
      json: async () => receipt,
    })),
  );
});
test('scoped draft cleanup waits for in-flight writes and cannot remove a newer conversation or another account', async () => {
  const map = new Map();
  let release;
  let block = true;
  const storage = {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      if (block)
        await new Promise((resolve) => {
          release = resolve;
        });
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
  };
  const drafts = onboardingDrafts(storage);
  const draft = {
    conversationId: 'old',
    text: 'private draft',
    pending: null,
    savedAt: Date.now(),
  };
  const writing = drafts.write('alice', draft);
  await new Promise((resolve) => setImmediate(resolve));
  const clearing = drafts.clear('alice', 'old');
  block = false;
  release();
  await writing;
  await clearing;
  assert.equal(await drafts.read('alice'), null);
  await drafts.write('alice', { ...draft, conversationId: 'new' });
  await drafts.write('bob', draft);
  await drafts.clear('alice', 'old');
  assert.equal((await drafts.read('alice')).conversationId, 'new');
  assert.equal((await drafts.read('bob')).conversationId, 'old');
});
