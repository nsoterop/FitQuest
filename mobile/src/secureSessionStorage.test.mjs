import assert from 'node:assert/strict';
import test from 'node:test';
import { secureSessionStorage } from './secureSessionStorage.ts';

function platform() {
  const encrypted = new Map();
  let fail = false;
  return {
    encrypted,
    failNext: () => {
      fail = true;
    },
    getItemAsync: async (k) => encrypted.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (fail) {
        fail = false;
        throw new Error('Keychain locked');
      }
      assert.ok(Buffer.byteLength(v) < 2048);
      encrypted.set(k, Buffer.from(v, 'utf8').toString('utf8'));
    },
    deleteItemAsync: async (k) => {
      encrypted.delete(k);
    },
  };
}
test('secure session chunks restore after reopen and serialize refresh/logout', async () => {
  const device = platform();
  const storage = secureSessionStorage(device);
  const session = JSON.stringify({
    access_token: 'a'.repeat(12000),
    refresh_token: 'synthetic',
    user: { name: '😀'.repeat(400) },
  });
  await storage.setItem('session', session);
  assert.equal(await secureSessionStorage(device).getItem('session'), session);
  await Promise.all([storage.setItem('session', 'refreshed'), storage.removeItem('session')]);
  assert.equal(await storage.getItem('session'), null);
  assert.equal(device.encrypted.size, 0);
});
test('failed secure write preserves the previous complete session and never returns partial data', async () => {
  const device = platform();
  const storage = secureSessionStorage(device);
  await storage.setItem('session', 'old');
  device.failNext();
  await assert.rejects(storage.setItem('session', 'new'));
  assert.equal(await storage.getItem('session'), 'old');
  const chunk = [...device.encrypted.keys()].find((k) => !k.endsWith('.index'));
  device.encrypted.delete(chunk);
  assert.equal(await storage.getItem('session'), null);
});

test('failed private-chunk deletion is reported and the retained index allows a full cleanup retry', async () => {
  const map = new Map();
  let fail = false;
  const storage = secureSessionStorage({
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => {
      map.set(k, v);
    },
    deleteItemAsync: async (k) => {
      if (fail && !k.endsWith('.index')) throw Error('synthetic deletion failure');
      map.delete(k);
    },
  });
  await storage.setItem('onboarding.alice', 'Synthetic private draft');
  fail = true;
  await assert.rejects(storage.removeItem('onboarding.alice'));
  assert.ok([...map.values()].includes('Synthetic private draft'));
  fail = false;
  await storage.removeItem('onboarding.alice');
  assert.equal(map.size, 0);
  assert.equal(await storage.getItem('onboarding.alice'), null);
});

test('reopen finishes a partial deletion or reports its continuing failure instead of leaving private fragments', async () => {
  const map = new Map();
  let fail = false;
  const adapter = {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => {
      map.set(k, v);
    },
    deleteItemAsync: async (k) => {
      if (fail && k.endsWith('.1')) throw Error('synthetic second-chunk deletion failure');
      map.delete(k);
    },
  };
  let storage = secureSessionStorage(adapter);
  await storage.setItem('onboarding.alice', 'Private synthetic text '.repeat(40));
  fail = true;
  await assert.rejects(storage.removeItem('onboarding.alice'));
  storage = secureSessionStorage(adapter);
  await assert.rejects(storage.getItem('onboarding.alice'));
  fail = false;
  assert.equal(await storage.getItem('onboarding.alice'), null);
  assert.equal(map.size, 0);
});
