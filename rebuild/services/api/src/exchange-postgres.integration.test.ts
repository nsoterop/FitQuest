import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, Pool } from 'pg';
import { CompactSign, exportJWK, generateKeyPair, type FetchImplementation } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppleChallengeSchema, CommandSchema, type AppleChallenge, type AppleExchange, type PendingCredentials } from '@fitquest-rebuild/contracts';
import { AuthSessionRepository, AuthUnauthorized, type SessionEnvironment } from './authSessions';
import { PostgresAthleteRepository } from './repository';
import { createSimulatedAppleSignInForTest, type ExchangePhase, type SimulatedExchangeResult, type SimulatedSignInConfiguration } from './simulatedAppleSignIn';

const root = path.resolve(__dirname, '../../../');
// The SAME non-mutating preflight is called directly on the actual cleanup connection.
const loadPreflight = createRequire(__filename);
const { preflight, socket, port, database } = loadPreflight(path.join(root, 'scripts/m1c4b-preflight.mjs')) as {
  preflight: (client: Client) => Promise<void>; socket: string; port: number; database: string;
};
const target = { host: socket, port, database };
const start = Date.parse('2026-09-29T12:00:00Z');
const clientId = 'com.example.fitquest.exchange';
const environment = 'm1c4b.synthetic.test.v1' as const;
const issuer = 'https://appleid.apple.com';
const forbiddenOutput = new Set<string>();
const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const credentials = (result: SimulatedExchangeResult): PendingCredentials => {
  expect(result.kind).toBe('credentials');
  if (result.kind !== 'credentials') throw new Error('Expected pending credentials');
  for (const value of [result.bundle.accessToken,result.bundle.refreshToken,result.bundle.revocationToken]) forbiddenOutput.add(value);
  return result.bundle;
};

describe('isolated real PostgreSQL simulated sign-in exchange', () => {
  let admin: Client, runtime: Pool, preauth: Pool, lookup: Pool, fixture: Pool;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let keys: object[];
  let time = start, calls = 0, outbound = 0;
  const responses = new Map<string, string>();
  let provider: (input: { authorizationCode: string; clientId: string; signal: AbortSignal }) => Promise<unknown>;
  let fetchKeys: FetchImplementation;
  const sessions = (env: SessionEnvironment = environment) => new AuthSessionRepository(runtime, lookup,
    new PostgresAthleteRepository(runtime), () => new Date(time), undefined, {}, env);
  const rig = (options: { phase?: (phase: ExchangePhase) => void | Promise<void>; config?: Partial<SimulatedSignInConfiguration> } = {}) => {
    const config = { clientId, environment, jwtClockToleranceSeconds: 0, ...options.config };
    return createSimulatedAppleSignInForTest(config, {
      preauth, runtime, sessions: sessions(config.environment), now: () => new Date(time), phase: options.phase,
      fetch: (...args) => fetchKeys(...args),
      exchange: { exchange: async input => { calls++; expect(input.clientId).toBe(config.clientId); return provider(input); } },
    });
  };
  const sign = async (challenge: AppleChallenge, subject = 'Invented-Athlete', overrides: Record<string, unknown> = {}, kid = 'exchange-key') =>
    new CompactSign(Buffer.from(JSON.stringify({ iss: issuer, aud: clientId, sub: subject, nonce: challenge.nonce,
      iat: Math.floor(time / 1000), exp: Math.floor(time / 1000) + 300, ...overrides })))
      .setProtectedHeader({ alg: 'RS256', kid }).sign(privateKey);
  const request = async (service: ReturnType<typeof rig>, subject?: string, overrides?: Record<string, unknown>) => {
    const challenge = AppleChallengeSchema.parse(await service.challenge());
    const identityToken = await sign(challenge, subject, overrides);
    const authorizationCode = `invented-code-${randomUUID()}`;
    for (const value of [identityToken,authorizationCode,challenge.nonce,challenge.state]) forbiddenOutput.add(value);
    responses.set(authorizationCode, identityToken);
    return { challenge, wire: { challengeId: challenge.challengeId, state: challenge.state, identityToken, authorizationCode } satisfies AppleExchange };
  };
  const count = async (table: string) => Number((await admin.query(`SELECT count(*) AS n FROM m1b.${table}`)).rows[0].n);
  const noIssuance = async () => {
    for (const table of ['accounts', 'provider_identities', 'session_families', 'credential_generations', 'revocation_capabilities']) expect(await count(table)).toBe(0);
  };
  const noHeldClients = async () => {
    expect(preauth.idleCount).toBe(preauth.totalCount);
    expect(runtime.idleCount).toBe(runtime.totalCount);
    const transactions = await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename IN ('fitquest_m1c4b_api','fitquest_m1c4b_preauth','fitquest_m1c4b_lookup') AND xact_start IS NOT NULL");
    expect(transactions.rows[0].n).toBe(0);
  };

  beforeAll(async () => {
    vi.stubGlobal('fetch', async () => { outbound++;throw new Error('Unexpected outbound network'); });
    admin = new Client({ ...target, user: os.userInfo().username }); await admin.connect();
    await preflight(admin);
    runtime = new Pool({ ...target, user: 'fitquest_m1c4b_api', max: 6 });
    preauth = new Pool({ ...target, user: 'fitquest_m1c4b_preauth', max: 6 });
    lookup = new Pool({ ...target, user: 'fitquest_m1c4b_lookup', max: 2 });
    fixture = new Pool({ ...target, user: 'fitquest_m1b_api', max: 2 });
    const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey;
    keys = [{ ...await exportJWK(pair.publicKey), kid: 'exchange-key', alg: 'RS256', use: 'sig' }];
  });
  afterAll(async () => {
    await Promise.all([runtime?.end(), preauth?.end(), lookup?.end(), fixture?.end()]); await admin?.end(); vi.unstubAllGlobals();
    expect(outbound).toBe(0);
    const log=readFileSync(path.join(socket,'../postgres.log'),'utf8');
    expect([...forbiddenOutput].some(secret => log.includes(secret))).toBe(false);
  });
  beforeEach(async () => {
    await preflight(admin); // Must succeed before EVERY cleanup, without setup/migration/seed fallback.
    await admin.query('TRUNCATE m1b.auth_exchange_attempts,m1b.auth_challenges,m1b.aggregate_revisions,m1b.operation_outcomes,m1b.aggregates,m1b.revocation_capabilities,m1b.credential_generations,m1b.session_families,m1b.provider_identities,m1b.accounts');
    time = start; calls = 0; responses.clear();
    provider = async input => ({ identityToken: responses.get(input.authorizationCode) });
    fetchKeys = async (url, options) => {
      expect(url).toBe('https://appleid.apple.com/auth/keys'); expect(options.redirect).toBe('manual');
      return new Response(JSON.stringify({ keys }), { status: 200 });
    };
  });

  it('generates independently random bound challenges; stores state digest and no raw code/JWT/bundle', async () => {
    const service = rig(), first = await request(service), second = await request(service);
    expect(first.challenge.challengeId).not.toBe(second.challenge.challengeId);
    expect(first.challenge.nonce === first.challenge.state || first.challenge.nonce === second.challenge.nonce).toBe(false);
    expect(first.challenge.nonce).toHaveLength(64); expect(first.challenge.state).toHaveLength(64);
    expect(Date.parse(first.challenge.expiresAt) - time).toBe(300_000);
    const bundle = credentials(await service.exchange(first.wire));
    const tables = ['auth_challenges', 'auth_exchange_attempts', 'provider_identities', 'session_families', 'credential_generations', 'revocation_capabilities'];
    for (const table of tables) {
      const stored = JSON.stringify((await admin.query(`SELECT row_to_json(t) AS value FROM m1b.${table} t`)).rows);
      for (const raw of [first.wire.authorizationCode, first.wire.identityToken, first.wire.state, bundle.accessToken, bundle.refreshToken, bundle.revocationToken]) expect(stored.includes(raw)).toBe(false);
    }
    expect((await admin.query('SELECT status FROM m1b.auth_exchange_attempts')).rows[0].status).toBe('completed');
    expect(calls).toBe(1); expect(await count('session_families')).toBe(1);
  });

  it('rejects caller-selected bindings and malformed wire values before exchange', async () => {
    const service = rig(), { wire } = await request(service);
    expect(await service.challenge({ accountId: randomUUID() })).toEqual({ kind: 'error', code: 'AUTH_BAD_REQUEST' });
    for (const value of [null, {}, { ...wire, accountId: randomUUID() }, { ...wire, environment },
      { ...wire, clientId }, { ...wire, identityToken: 'x'.repeat(16385) }, { ...wire, authorizationCode: 'x'.repeat(4097) }])
      expect(await service.exchange(value)).toEqual({ kind: 'error', code: 'AUTH_BAD_REQUEST' });
    expect(calls).toBe(0); await noIssuance();
  });

  it('keeps state and nonce case-sensitive, rejects unknown challenge, wrong client and invalid native time/signature', async () => {
    const service = rig(), { challenge, wire } = await request(service);
    for (const value of [{ ...wire, state: wire.state.toUpperCase() }, { ...wire, challengeId: randomUUID() },
      { ...wire, identityToken: await sign(challenge, undefined, { nonce: challenge.nonce.toUpperCase() }) },
      { ...wire, identityToken: await sign(challenge, undefined, { aud: 'com.other.fitquest' }) },
      { ...wire, identityToken: await sign(challenge, undefined, { exp: time / 1000 }) },
      { ...wire, identityToken: `${wire.identityToken.slice(0, -8)}AAAAAAAA` }])
      expect(await service.exchange(value)).toEqual({ kind: 'error', code: 'AUTH_INVALID' });
    expect(calls).toBe(0); expect(await count('auth_exchange_attempts')).toBe(0); await noIssuance();
  });

  it('normalizes UUID spelling while retaining opaque state and subjects', async () => {
    const service = rig(), { wire } = await request(service);
    const bundle = credentials(await service.exchange({ ...wire, challengeId: wire.challengeId.toUpperCase() }));
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(await sessions().activate(bundle.accessToken, bundle.sessionId.toUpperCase(), 1)).toMatchObject({ kind: 'active' });
    expect(calls).toBe(1);
  });

  it('strict challenge expiry is independent of JWT tolerance', async () => {
    const service = rig({ config: { jwtClockToleranceSeconds: 60 } }), { wire } = await request(service);
    time += 300_000;
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(0); await noIssuance();
  });

  it('native JWKS failure cannot dispatch or leak provider errors', async () => {
    const service = rig(), { wire } = await request(service);
    fetchKeys = async () => { throw new Error(wire.identityToken + wire.authorizationCode); };
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_PROVIDER_UNAVAILABLE' });
    expect(calls).toBe(0); await noIssuance();
  });

  it('native JWKS wait holds no client/transaction and rechecks strict challenge expiry after verification', async () => {
    const entered = deferred(), release = deferred();
    const service = rig({ config: { jwtClockToleranceSeconds: 60 } }), { wire } = await request(service);
    fetchKeys = async () => { entered.resolve(); await release.promise; return new Response(JSON.stringify({ keys })); };
    const pending = service.exchange(wire); await entered.promise; await noHeldClients();
    time += 300_000; release.resolve();
    expect(await pending).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(0); await noIssuance();
  });

  it('commits one exclusive claim: identical in progress and conflicting reused cannot exchange twice', async () => {
    const entered = deferred(), release = deferred();
    const service = rig(), { wire } = await request(service);
    provider = async input => { entered.resolve(); await release.promise; return { identityToken: responses.get(input.authorizationCode) }; };
    const first = service.exchange(wire); await entered.promise; await noHeldClients();
    expect(await service.exchange({ ...wire, challengeId: wire.challengeId.toUpperCase() })).toEqual({ kind: 'error', code: 'AUTH_EXCHANGE_IN_PROGRESS' });
    expect(await service.exchange({ ...wire, authorizationCode: 'different-invented-code' })).toEqual({ kind: 'error', code: 'AUTH_CHALLENGE_REUSED' });
    expect(calls).toBe(1); expect(await count('auth_exchange_attempts')).toBe(1);
    release.resolve(); credentials(await first);
    expect(await count('session_families')).toBe(1);
  });

  it('claim rollback leaves no attempt/account and allows one later dispatch', async () => {
    const broken = rig({ phase: phase => { if (phase === 'after_claim_insert') throw new Error('Injected rollback'); } });
    const { wire } = await request(broken);
    expect(await broken.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(0); expect(await count('auth_exchange_attempts')).toBe(0); await noIssuance();
    credentials(await rig().exchange(wire)); expect(calls).toBe(1);
  });

  it('simulated crash after committed claim never reclaims or re-exchanges the code', async () => {
    const broken = rig({ phase: phase => { if (phase === 'after_claim_commit') throw new Error('Injected crash'); } });
    const { wire } = await request(broken);
    expect(await broken.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect((await admin.query('SELECT status FROM m1b.auth_exchange_attempts')).rows[0].status).toBe('claimed');
    expect(await rig().exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_EXCHANGE_IN_PROGRESS' });
    time += 30_000;
    expect(await rig().exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(0); await noIssuance();
  });

  it.each(['throw', 'missing', 'null', 'extras'] as const)('sanitizes provider %s and permanently spends the claim', async failure => {
    const service = rig(), { wire } = await request(service);
    provider = async () => {
      if (failure === 'throw') throw new Error(wire.authorizationCode + wire.identityToken);
      if (failure === 'missing') return {};
      if (failure === 'null') return null;
      return { identityToken: wire.identityToken, refreshToken: 'Invented-provider-secret' };
    };
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: failure === 'throw' ? 'AUTH_PROVIDER_UNAVAILABLE' : 'AUTH_INVALID' });
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(1); await noIssuance();
  });

  it('timeout/lost external response aborts once; ignored abort and late completion have no side effects', async () => {
    const entered = deferred(), response = deferred<unknown>(); let signal: AbortSignal | undefined;
    const service = rig({ config: { providerTimeoutMs: 20 } }), { wire } = await request(service);
    provider = async input => { signal = input.signal; entered.resolve(); return response.promise; };
    const pending = service.exchange(wire); await entered.promise; await noHeldClients();
    expect(await pending).toEqual({ kind: 'error', code: 'AUTH_PROVIDER_UNAVAILABLE' });
    expect(signal?.aborted).toBe(true);
    response.resolve({ identityToken: wire.identityToken }); await Promise.resolve();
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(1); await noIssuance();
  });

  it.each(['subject', 'audience', 'issuer', 'nonce', 'signature', 'missing-token'] as const)('independently rejects exchanged %s substitution', async substitution => {
    const service = rig(), { challenge, wire } = await request(service);
    let token = await sign(challenge, substitution === 'subject' ? 'Different-Invented-Subject' : undefined,
      substitution === 'audience' ? { aud: 'com.other.fitquest' } : substitution === 'issuer' ? { iss: 'https://invented.invalid' } : substitution === 'nonce' ? { nonce: 'Different-Invented-Nonce' } : {});
    if (substitution === 'signature') token = `${token.slice(0, -8)}AAAAAAAA`;
    provider = async () => ({ identityToken: substitution === 'missing-token' ? undefined : token });
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_INVALID' });
    expect(calls).toBe(1); await noIssuance();
  });

  it('returned JWKS outage spends the claim without any session', async () => {
    const service = rig({ config: { jwksCooldownMs: 0, jwksCacheMaxAgeMs: 1 } }), { challenge, wire } = await request(service);
    provider = async () => {
      fetchKeys = async () => { throw new Error('Invented key outage'); };
      return { identityToken: await sign(challenge, undefined, {}, 'unavailable-key') };
    };
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_PROVIDER_UNAVAILABLE' });
    expect(calls).toBe(1); await noIssuance();
  });

  it('returned JWKS wait holds no DB client and cannot extend the attempt deadline with JWT tolerance', async () => {
    const entered = deferred(), release = deferred();
    const service = rig({ config: { jwtClockToleranceSeconds: 60, jwksCooldownMs: 0 } }), { challenge, wire } = await request(service);
    provider = async () => {
      fetchKeys = async () => { entered.resolve(); await release.promise; return new Response(JSON.stringify({ keys: keys.map(key => ({ ...key, kid: 'returned-key' })) })); };
      return { identityToken: await sign(challenge, undefined, {}, 'returned-key') };
    };
    const pending = service.exchange(wire); await entered.promise; await noHeldClients();
    time += 30_000; release.resolve();
    expect(await pending).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(1); await noIssuance();
  });

  it('successful code exchange plus finalization rollback leaves no orphan and never retries that code', async () => {
    const broken = rig({ phase: phase => { if (phase === 'before_finalize_commit') throw new Error('Injected finalization rollback'); } });
    const { wire } = await request(broken, 'Rollback-Subject');
    expect(await broken.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    await noIssuance(); expect(calls).toBe(1);
    expect(await rig().exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    const fresh = rig(), next = await request(fresh, 'Rollback-Subject'); credentials(await fresh.exchange(next.wire));
    expect(calls).toBe(2); expect(await count('accounts')).toBe(1);
  });

  it('commit then response loss retains one family with no replayable response; fresh authorization reuses account', async () => {
    const lost = rig({ phase: phase => { if (phase === 'after_finalize_commit') throw new Error('Injected response loss'); } });
    const { wire } = await request(lost, 'Lost-Response-Subject');
    expect(await lost.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(await count('session_families')).toBe(1);
    expect(await rig().exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(calls).toBe(1);
    const fresh = rig(), next = await request(fresh, 'Lost-Response-Subject'); credentials(await fresh.exchange(next.wire));
    expect(await count('accounts')).toBe(1); expect(await count('session_families')).toBe(2); expect(calls).toBe(2);
  });

  it('late provider result at exact capped deadline cannot create identity/account/family', async () => {
    const service = rig({ config: { challengeLifetimeMs: 10_000 } }), { wire } = await request(service);
    provider = async () => { time += 10_000; return { identityToken: wire.identityToken }; };
    expect(await service.exchange(wire)).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect((await admin.query('SELECT deadline=($1::timestamptz) AS capped FROM m1b.auth_exchange_attempts', [new Date(time)])).rows[0].capped).toBe(true);
    await noIssuance(); expect(calls).toBe(1);
  });

  it('a delayed losing attempt cannot finalize after its fence is marked failed', async () => {
    const entered = deferred(), release = deferred();
    const service = rig(), { wire } = await request(service);
    provider = async () => { entered.resolve(); await release.promise; return { identityToken: wire.identityToken }; };
    const pending = service.exchange(wire); await entered.promise;
    const row = (await admin.query('SELECT attempt_id,request_digest FROM m1b.auth_exchange_attempts')).rows[0];
    await preauth.query('SELECT m1b.fail_exchange($1,$2,$3)', [wire.challengeId, row.attempt_id, row.request_digest]);
    release.resolve(); expect(await pending).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    await noIssuance(); expect(calls).toBe(1);
  });

  it('simultaneous first sign-ins resolve one account; subjects and trusted environments remain isolated', async () => {
    const service = rig(), left = await request(service, 'Same-Subject'), right = await request(service, 'Same-Subject');
    const [a,b] = (await Promise.all([service.exchange(left.wire), service.exchange(right.wire)])).map(credentials);
    expect(a.accountId).toBe(b.accountId); expect(a.sessionId).not.toBe(b.sessionId); expect(await count('accounts')).toBe(1);
    const distinct = await request(service, 'same-subject');
    const c = credentials(await service.exchange(distinct.wire)); expect(c.accountId).not.toBe(a.accountId);
    const other = rig({ config: { environment: 'm1c4b.synthetic.other.v1' } }), next = await request(other, 'Same-Subject');
    expect(await service.exchange(next.wire)).toEqual({ kind: 'error', code: 'AUTH_INVALID' });
    const d = credentials(await other.exchange(next.wire)); expect(d.accountId).not.toBe(a.accountId);
    expect(await sessions().identity(d.accessToken)).toEqual({ kind: 'invalid' });
    expect(await sessions('m1c4b.synthetic.other.v1').activate(d.accessToken,d.sessionId,1)).toMatchObject({ kind: 'active' });
    expect(await count('accounts')).toBe(3);
  });

  it('fresh disabled-B sign-in denies without revocation authority, dispatch or claim; active A stays usable', async () => {
    const service=rig(),auth=sessions();
    const a=credentials(await service.exchange((await request(service,'Invented-Active-A')).wire));
    const b=credentials(await service.exchange((await request(service,'Invented-Disabled-B')).wire));
    await auth.activate(a.accessToken,a.sessionId,1);await auth.activate(b.accessToken,b.sessionId,1);
    const view=await auth.privateAthlete(a.accessToken);
    const cmd=CommandSchema.parse({contractVersion:1,operationId:randomUUID(),kind:'profile.put',expectedRevision:0,
      payload:{displayName:'Invented active athlete',timeZone:'UTC',units:{load:'lb',distance:'mi'}}});
    expect((await view.repository.execute(a.accountId,cmd)).state).toBe('committed');
    await admin.query("UPDATE m1b.accounts SET status='disabled' WHERE account_id=$1",[b.accountId]);
    const denied=await request(service,'Invented-Disabled-B');
    const tables=['accounts','provider_identities','auth_exchange_attempts','session_families','credential_generations','revocation_capabilities'];
    const counts=async () => {const values:number[]=[];for(const table of tables) values.push(await count(table));return values;};
    const before=await counts(),dispatches=calls;
    expect(await service.exchange(denied.wire)).toEqual({kind:'error',code:'AUTH_INVALID'});
    expect(calls).toBe(dispatches);
    expect(await counts()).toEqual(before);
    expect((await admin.query('SELECT 1 FROM m1b.auth_exchange_attempts WHERE challenge_id=$1',[denied.wire.challengeId])).rowCount).toBe(0);
    expect(await auth.identity(a.accessToken)).toMatchObject({kind:'active',identity:{accountId:a.accountId,sessionId:a.sessionId}});
    expect((await view.repository.profile(a.accountId)).revision).toBe(1);
    expect((await view.repository.outcome(a.accountId,cmd.operationId))?.state).toBe('committed');
    // Actual B credentials still identify a known family and enforce disabled-account revocation.
    expect(await auth.identity(b.accessToken)).toEqual({kind:'revoked'});
    expect(await auth.activate(b.accessToken,b.sessionId,1)).toEqual({kind:'revoked'});
    expect(await auth.refresh(randomUUID(),b.refreshToken)).toEqual({kind:'revoked'});
    expect(await auth.revoke(a.revocationToken)).toBe('revoked');
    expect(await auth.identity(a.accessToken)).toEqual({kind:'revoked'});
  });

  it.each(['disabled','epoch'] as const)('captured account authorization rejects late %s invalidation', async mode => {
    const service = rig(), first = await request(service, 'Security-Race');
    const bundle = credentials(await service.exchange(first.wire));
    const entered = deferred(), release = deferred(), next = await request(service, 'Security-Race');
    provider = async () => { entered.resolve(); await release.promise; return { identityToken: next.wire.identityToken }; };
    const pending = service.exchange(next.wire); await entered.promise;
    await admin.query(mode === 'disabled' ? "UPDATE m1b.accounts SET status='disabled' WHERE account_id=$1"
      : 'UPDATE m1b.accounts SET authorization_epoch=authorization_epoch+1 WHERE account_id=$1', [bundle.accountId]);
    release.resolve(); expect(await pending).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
    expect(await count('accounts')).toBe(1); expect(await count('session_families')).toBe(1);
    expect(await sessions().activate(bundle.accessToken,bundle.sessionId,1)).toEqual({ kind: 'revoked' });
    const third=await request(service,'Security-Race');
    provider=async input => ({identityToken:responses.get(input.authorizationCode)});
    if (mode==='disabled') {
      expect(await service.exchange(third.wire)).toEqual({kind:'error',code:'AUTH_INVALID'});
      expect(calls).toBe(2);
    } else {
      const fresh=credentials(await service.exchange(third.wire));
      expect(fresh.accountId).toBe(bundle.accountId);
      expect(await sessions().activate(fresh.accessToken,fresh.sessionId,1)).toMatchObject({kind:'active'});
      expect((await admin.query('SELECT authorization_epoch FROM m1b.session_families WHERE family_id=$1',[fresh.sessionId])).rows[0].authorization_epoch).toBe('2');
    }
  });

  it.each(['native-time','returned-time','attempt-deadline'] as const)('rechecks %s after real account lock waits', async mode => {
    const service = rig(), first = await request(service, 'Lock-Subject');
    const bundle = credentials(await service.exchange(first.wire));
    const blocker = new Client({ ...target, user: os.userInfo().username }); await blocker.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT 1 FROM m1b.accounts WHERE account_id=$1 FOR UPDATE', [bundle.accountId]);
      const entered = deferred(), waiting = rig({ phase: phase => { if (phase === 'before_finalize') entered.resolve(); } });
      const next = await request(waiting, 'Lock-Subject', mode === 'native-time' ? { exp: time / 1000 + 5 } : {});
      if (mode === 'returned-time') responses.set(next.wire.authorizationCode, await sign(next.challenge,'Lock-Subject',{exp:time/1000+5}));
      const pending = waiting.exchange(next.wire); await entered.promise;
      // Synchronize on the PostgreSQL lock wait, not a guessed sleep.
      for (let i=0;i<200;i++) {
        const blocked = (await admin.query("SELECT 1 FROM pg_stat_activity WHERE usename='fitquest_m1c4b_api' AND wait_event_type='Lock'")).rowCount;
        if (blocked) break;
        if (i===199) throw new Error('Expected account lock wait');
        await new Promise(resolve => setTimeout(resolve,5));
      }
      time += mode === 'attempt-deadline' ? 30_000 : 5000; await blocker.query('COMMIT');
      expect(await pending).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
      expect(await count('session_families')).toBe(1);
    } finally {await blocker.query('ROLLBACK');await blocker.end();}
  });

  it('deadline is resampled after real final attempt lock waits and rolls back all new rows', async () => {
    const entered = deferred(), release = deferred();
    const service = rig({ phase: async phase => { if (phase === 'before_finalize') {entered.resolve();await release.promise;} } });
    const { wire } = await request(service,'Attempt-Lock-Subject');
    const pending = service.exchange(wire); await entered.promise;
    const blocker = new Client({...target,user:os.userInfo().username});await blocker.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT 1 FROM m1b.auth_exchange_attempts WHERE challenge_id=$1 FOR UPDATE',[wire.challengeId]);
      release.resolve();
      for (let i=0;i<200;i++) {
        if ((await admin.query("SELECT 1 FROM pg_stat_activity WHERE usename='fitquest_m1c4b_api' AND wait_event_type='Lock'")).rowCount) break;
        if (i===199) throw new Error('Expected final attempt lock wait');
        await new Promise(resolve => setTimeout(resolve,5));
      }
      time+=30_000;await blocker.query('COMMIT');
      expect(await pending).toEqual({kind:'error',code:'AUTH_REAUTH_REQUIRED'});
      await noIssuance();expect(calls).toBe(1);
    } finally {await blocker.query('ROLLBACK');await blocker.end();}
  });

  it('direct preflight rejects changed real marker/ledger/schema before any cleanup callback', async () => {
    for (const mutation of ["UPDATE m1b.meta SET value='Invented wrong marker' WHERE key='owner'",
      "UPDATE m1b.migrations SET checksum=repeat('0',64) WHERE version=5", 'CREATE SCHEMA invented_unknown']) {
      await admin.query('BEGIN');let cleanupCalls=0;
      try {
        await admin.query(mutation);
        await expect((async () => {await preflight(admin);cleanupCalls++;})()).rejects.toThrow();
        expect(cleanupCalls).toBe(0);
      } finally {await admin.query('ROLLBACK');}
    }
    await preflight(admin);
  });

  it('null state, client, time or fence arguments cannot claim/finalize through narrow helpers', async () => {
    const service=rig(),{wire}=await request(service);
    const stateHash=(await admin.query('SELECT state_hash FROM m1b.auth_challenges WHERE challenge_id=$1',[wire.challengeId])).rows[0].state_hash;
    const args:unknown[]=[wire.challengeId,environment,clientId,stateHash,'1'.repeat(64),'2'.repeat(64),randomUUID(),new Date(time),new Date(time+30_000)];
    for (const index of [2,3,6,7,8]) {
      const values=[...args];values[index]=null;
      expect((await preauth.query('SELECT * FROM m1b.claim_exchange($1,$2,$3,$4,$5,$6,$7,$8,$9)',values)).rows).toHaveLength(0);
    }
    expect(await count('auth_exchange_attempts')).toBe(0);expect(calls).toBe(0);await noIssuance();
    credentials(await service.exchange(wire));
    const strict=(await admin.query("SELECT proisstrict FROM pg_proc WHERE pronamespace='m1b'::regnamespace AND proname LIKE '%exchange%' AND prosecdef")).rows;
    expect(strict).toHaveLength(6);expect(strict.every(row=>row.proisstrict)).toBe(true);
    expect((await runtime.query('SELECT m1b.complete_exchange($1,$2,$3,$4,NULL) AS done',[wire.challengeId,randomUUID(),'1'.repeat(64),randomUUID()])).rows[0].done).toBeNull();
  });

  it('deadline expiry after real challenge lock wait rolls claim back before dispatch', async () => {
    const service = rig({ config: { challengeLifetimeMs: 1000 } }), { wire } = await request(service);
    const blocker = new Client({ ...target, user: os.userInfo().username }); await blocker.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT 1 FROM m1b.auth_challenges WHERE challenge_id=$1 FOR UPDATE', [wire.challengeId]);
      const pending = service.exchange(wire);
      for (let i=0;i<200;i++) {
        if ((await admin.query("SELECT 1 FROM pg_stat_activity WHERE usename='fitquest_m1c4b_preauth' AND wait_event_type='Lock'")).rowCount) break;
        if (i===199) throw new Error('Expected challenge lock wait');
        await new Promise(resolve => setTimeout(resolve,5));
      }
      time += 1000; await blocker.query('COMMIT');
      expect(await pending).toEqual({ kind: 'error', code: 'AUTH_REAUTH_REQUIRED' });
      expect(calls).toBe(0); expect(await count('auth_exchange_attempts')).toBe(0); await noIssuance();
    } finally {await blocker.query('ROLLBACK');await blocker.end();}
  });

  it('pending denies every private operation; activation, refresh, logout and fresh-sign-in outcome recovery reuse shared repository', async () => {
    const service = rig(), first = await request(service, 'Domain-Subject'), auth = sessions();
    const bundle = credentials(await service.exchange(first.wire)), view = await auth.privateAthlete(bundle.accessToken);
    const cmd = CommandSchema.parse({ contractVersion:1,operationId:randomUUID(),kind:'profile.put',expectedRevision:0,
      payload:{displayName:'Invented athlete',timeZone:'UTC',units:{load:'lb',distance:'mi'}} });
    for (const work of [() => view.repository.execute(bundle.accountId,cmd), () => view.repository.outcome(bundle.accountId,cmd.operationId),
      () => view.repository.profile(bundle.accountId), () => view.repository.session(bundle.accountId,randomUUID()), () => view.repository.sessions(bundle.accountId,20)])
      await expect(work()).rejects.toThrow(AuthUnauthorized);
    expect(await auth.identity(bundle.accessToken)).toEqual({ kind:'invalid' });
    expect(await auth.activate(bundle.accessToken,bundle.sessionId,1)).toMatchObject({ kind:'active' });
    expect(await auth.identity(bundle.accessToken)).toMatchObject({ kind:'active' });
    expect((await view.repository.execute(bundle.accountId,cmd)).state).toBe('committed');
    const refreshed = await auth.refresh(randomUUID(),bundle.refreshToken);
    expect(refreshed.kind).toBe('credentials');
    if (refreshed.kind !== 'credentials') throw new Error('Expected refresh credentials');
    expect(await auth.activate(refreshed.bundle.accessToken,bundle.sessionId,2)).toMatchObject({ kind:'active' });
    expect(await auth.revoke(bundle.revocationToken)).toBe('revoked');
    await expect(view.repository.profile(bundle.accountId)).rejects.toThrow(AuthUnauthorized);
    const next = await request(service, 'Domain-Subject'), fresh = credentials(await service.exchange(next.wire));
    expect(fresh.accountId).toBe(bundle.accountId);
    await auth.activate(fresh.accessToken,fresh.sessionId,1);
    const recovered = await auth.privateAthlete(fresh.accessToken);
    expect((await recovered.repository.outcome(fresh.accountId,cmd.operationId))?.state).toBe('committed');
    expect((await recovered.repository.execute(fresh.accountId,cmd)).state).toBe('committed');
    expect(await count('operation_outcomes')).toBe(1);
  });

  it('pre-auth and lookup roles cannot read athlete/credential tables or invoke arbitrary identity resolution; owner context is local', async () => {
    const service = rig(), { wire } = await request(service), bundle = credentials(await service.exchange(wire));
    for (const pool of [preauth,lookup]) {
      for (const table of ['accounts','aggregates','operation_outcomes','auth_challenges','auth_exchange_attempts','credential_generations'])
        await expect(pool.query(`SELECT * FROM m1b.${table}`)).rejects.toThrow(/permission denied/);
      await expect(pool.query("SELECT m1b.resolve_test_identity('synthetic_verified','fitquest-m1c3-test',$1)", ['0'.repeat(64)])).rejects.toThrow(/permission denied/);
      await expect(pool.query('SELECT * FROM m1b.resolve_exchange_account($1,$2,$3,$4,$5,now())',
        [wire.challengeId,randomUUID(),'0'.repeat(64),environment,clientId])).rejects.toThrow(/permission denied/);
    }
    expect((await runtime.query('SELECT * FROM m1b.accounts')).rows).toHaveLength(0);
    expect((await runtime.query("SELECT current_setting('fitquest.owner_id',true) AS owner")).rows[0].owner ?? '').toBe('');
    const conn = await fixture.connect();
    try {
      await conn.query('BEGIN'); await conn.query("SELECT set_config('fitquest.owner_id',$1,true)",[bundle.accountId]);
      expect((await conn.query('SELECT * FROM m1b.accounts')).rows).toHaveLength(0);
      expect((await conn.query('SELECT * FROM m1b.aggregates')).rows).toHaveLength(0);
      await conn.query('ROLLBACK');
    } finally {conn.release();}
    const funcs = (await admin.query("SELECT proconfig,EXISTS(SELECT 1 FROM aclexplode(proacl) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute FROM pg_proc WHERE pronamespace='m1b'::regnamespace AND proname LIKE '%exchange%' AND prosecdef")).rows;
    expect(funcs.length).toBe(6);
    expect(funcs.every(row => row.proconfig.includes('search_path=pg_catalog, m1b') && !row.public_execute)).toBe(true);
  });
});
