import assert from 'node:assert/strict';
import test from 'node:test';
import { secureSessionStorage } from './secureSessionStorage.ts';

function platform() {
  const encrypted = new Map(); let fail = false;
  return { encrypted, failNext: () => { fail = true; },
    getItemAsync: async k => encrypted.get(k) ?? null,
    setItemAsync: async (k, v) => { if (fail) { fail = false; throw new Error('Keychain locked'); }
      assert.ok(Buffer.byteLength(v) < 2048); encrypted.set(k, Buffer.from(v, 'utf8').toString('utf8')); },
    deleteItemAsync: async k => { encrypted.delete(k); },
  };
}
test('secure session chunks restore after reopen and serialize refresh/logout', async () => {
  const device = platform(); const storage = secureSessionStorage(device);
  const session = JSON.stringify({ access_token: 'a'.repeat(12000), refresh_token: 'synthetic', user: { name: '😀'.repeat(400) } });
  await storage.setItem('session', session);
  assert.equal(await secureSessionStorage(device).getItem('session'), session);
  await Promise.all([storage.setItem('session', 'refreshed'), storage.removeItem('session')]);
  assert.equal(await storage.getItem('session'), null); assert.equal(device.encrypted.size, 0);
});
test('failed secure write preserves the previous complete session and never returns partial data', async () => {
  const device = platform(); const storage = secureSessionStorage(device);
  await storage.setItem('session', 'old'); device.failNext();
  await assert.rejects(storage.setItem('session', 'new'));
  assert.equal(await storage.getItem('session'), 'old');
  const chunk = [...device.encrypted.keys()].find(k => !k.endsWith('.index'));
  device.encrypted.delete(chunk); assert.equal(await storage.getItem('session'), null);
});
