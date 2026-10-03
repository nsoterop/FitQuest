import assert from 'node:assert/strict';
import test from 'node:test';
import { supabaseVerifier } from './auth.js';

const id = '11111111-1111-4111-8111-111111111111';
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const claims = { sub: id, session_id: sessionId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
const token = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const user = { id, aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-10-02T12:00:00Z',
  app_metadata: {}, user_metadata: { userId: 'someone-else' }, created_at: '2026-10-02T12:00:00Z' };

test('identity requires Auth server verification of the exact token; editable metadata is ignored', async () => {
  let sent = '';
  const verify = supabaseVerifier('https://test.supabase.co', 'sb_publishable_test', async (url, init) => {
    assert.equal(String(url), 'https://test.supabase.co/auth/v1/user');
    sent = new Headers(init?.headers).get('Authorization')!;
    return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const jwt = token(claims);
  assert.deepEqual(await verify(jwt), { userId: id, sessionId });
  assert.equal(sent, `Bearer ${jwt}`);
});

test('Auth rejection, mismatched identity, anonymous/unconfirmed accounts and expired claims fail closed', async () => {
  for (const scenario of [
    { status: 401, body: { message: 'invalid JWT' }, payload: claims },
    { status: 200, body: user, payload: { ...claims, exp: 1 } },
    { status: 200, body: user, payload: { ...claims, sub: 'different' } },
    { status: 200, body: user, payload: { ...claims, session_id: 'invalid' } },
    { status: 200, body: user, payload: { ...claims, role: 'service_role' } },
    { status: 200, body: { ...user, is_anonymous: true }, payload: claims },
    { status: 200, body: { ...user, email_confirmed_at: null }, payload: claims },
  ]) {
    const verify = supabaseVerifier('https://test.supabase.co', 'sb_publishable_test', async () =>
      new Response(JSON.stringify(scenario.body), { status: scenario.status, headers: { 'Content-Type': 'application/json' } }));
    assert.equal(await verify(token(scenario.payload)), null);
  }
});
