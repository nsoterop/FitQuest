import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, Pool } from 'pg';
import { ActivationRequestSchema, CommandSchema, RefreshRequestSchema, type Command } from '@fitquest-rebuild/contracts';
import { AuthSessionRepository, AuthUnauthorized, type AuthPhase } from './authSessions';
import { OwnerUnavailable, PostgresAthleteRepository, type WritePhase } from './repository';

const root = path.resolve(__dirname, '../../../');
const base = path.join(root, 'private-test-artifacts', 'm1c3-pg');
const socket = path.join(base, 'socket');
const target = { host: socket, port: 55440, database: 'fitquest_m1c3_auth_test' };
const verifyTarget = () => { execFileSync(process.execPath, [path.join(root, 'scripts/m1c3-local-db.mjs'), 'verify'], { stdio: 'pipe' }); };
const accountIdentity = (subject: string) => ({ provider: 'synthetic_verified' as const, issuer: 'fitquest-m1c3-test' as const, subject });
const profile = { displayName: 'Synthetic athlete', timeZone: 'UTC', units: { load: 'lb', distance: 'mi' } } as const;
const command = (operationId = randomUUID()): Command => CommandSchema.parse({ contractVersion: 1, operationId, kind: 'profile.put', expectedRevision: 0, payload: profile });
const sessionCommand = (sessionId = randomUUID(), operationId = randomUUID()): Extract<Command, { kind: 'session.put' }> => CommandSchema.parse({
  contractVersion: 1, operationId, kind: 'session.put', expectedRevision: 0,
  payload: { id: sessionId, origin: 'unplanned', title: null, status: 'started', startedAt: '2026-09-26T12:00:00.000Z', endedAt: null, timeZone: 'UTC', localDate: '2026-09-26', correctionReason: null, activities: [] },
}) as Extract<Command, { kind: 'session.put' }>;
const start = Date.parse('2026-09-26T12:00:00.000Z');
const deferred = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

describe('isolated real PostgreSQL transactional sessions', () => {
  let admin: Client, runtime: Pool, lookup: Pool, fixture: Pool;
  let time = start;
  const auth = (phase?: (value: AuthPhase) => Promise<void> | void, domain?: (value: WritePhase) => Promise<void> | void,
    durations?: Partial<{ activationMs: number; accessMs: number; refreshMs: number; absoluteMs: number }>) =>
    new AuthSessionRepository(runtime, lookup, new PostgresAthleteRepository(runtime, domain), () => new Date(time), phase, durations);
  beforeAll(async () => {
    verifyTarget();
    admin = new Client({ ...target, user: os.userInfo().username }); await admin.connect();
    runtime = new Pool({ ...target, user: 'fitquest_m1c3_api', max: 6 });
    lookup = new Pool({ ...target, user: 'fitquest_m1c3_lookup', max: 4 });
    fixture = new Pool({ ...target, user: 'fitquest_m1b_api', max: 2 });
  });
  afterAll(async () => { await Promise.all([runtime?.end(), lookup?.end(), fixture?.end()]); await admin?.end(); });
  beforeEach(async () => {
    time = start;
    verifyTarget(); // Full non-mutating path/marker/schema/checksum preflight before every cleanup.
    await admin.query('TRUNCATE m1b.aggregate_revisions,m1b.operation_outcomes,m1b.aggregates,m1b.revocation_capabilities,m1b.credential_generations,m1b.session_families,m1b.provider_identities,m1b.accounts');
  });

  it('resolves simultaneous invented identities once and rolls issuance back without an orphan', async () => {
    const broken = auth(phase => { if (phase === 'before_issue_commit') throw new Error('Injected issuance rollback'); });
    await expect(broken.issue(accountIdentity('same-person'))).rejects.toThrow('Injected issuance rollback');
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.accounts')).rows[0].n)).toBe(0);
    const repo = auth();
    const [left, right] = await Promise.all([repo.issue(accountIdentity('same-person')), repo.issue(accountIdentity('same-person'))]);
    expect(left.accountId).toBe(right.accountId);
    expect(left.sessionId).not.toBe(right.sessionId);
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.accounts')).rows[0].n)).toBe(1);
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.provider_identities')).rows[0].n)).toBe(1);
  });

  it('commits a lost issuance response without retaining or replaying its bearer bundle', async () => {
    const lost = auth(phase => { if (phase === 'after_issue_commit') throw new Error('Injected response loss'); });
    await expect(lost.issue(accountIdentity('lost-issue'))).rejects.toThrow('Injected response loss');
    const rows = await admin.query('SELECT count(*)::int AS families FROM m1b.session_families');
    expect(rows.rows[0].families).toBe(1);
    const returned = await auth().issue(accountIdentity('lost-issue'));
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.accounts')).rows[0].n)).toBe(1);
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.session_families')).rows[0].n)).toBe(2);
    const stored = await admin.query('SELECT row_to_json(g)::text AS value FROM m1b.credential_generations g');
    expect(stored.rows.every(row => !row.value.includes(returned.accessToken) && !row.value.includes(returned.refreshToken))).toBe(true);
  });

  it('denies every private operation while pending, then activates and retrieves committed outcomes', async () => {
    const repo = auth(), bundle = await repo.issue(accountIdentity('pending'));
    const privateView = await repo.privateAthlete(bundle.accessToken);
    const item = command();
    await expect(privateView.repository.execute(bundle.accountId, item)).rejects.toThrow(AuthUnauthorized);
    await expect(privateView.repository.outcome(bundle.accountId, item.operationId)).rejects.toThrow(AuthUnauthorized);
    await expect(privateView.repository.profile(bundle.accountId)).rejects.toThrow(AuthUnauthorized);
    await expect(privateView.repository.session(bundle.accountId, randomUUID())).rejects.toThrow(AuthUnauthorized);
    await expect(privateView.repository.sessions(bundle.accountId, 20)).rejects.toThrow(AuthUnauthorized);
    expect(await repo.identity(bundle.accessToken)).toEqual({ kind: 'invalid' });
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.operation_outcomes')).rows[0].n)).toBe(0);
    expect(await repo.activate(bundle.accessToken, bundle.sessionId, 1)).toMatchObject({ kind: 'active', alreadyActive: false });
    expect(await repo.identity(bundle.accessToken)).toMatchObject({ kind: 'active', identity: { accountId: bundle.accountId, sessionId: bundle.sessionId, credentialGeneration: 1 } });
    expect((await privateView.repository.execute(bundle.accountId, item)).state).toBe('committed');
    expect((await privateView.repository.outcome(bundle.accountId, item.operationId))?.state).toBe('committed');
    expect((await privateView.repository.profile(bundle.accountId)).revision).toBe(1);
    const session = sessionCommand();
    expect((await privateView.repository.execute(bundle.accountId, session)).state).toBe('committed');
    expect((await privateView.repository.session(bundle.accountId, session.payload.id))?.revision).toBe(1);
    expect((await privateView.repository.sessions(bundle.accountId, 20)).items).toHaveLength(1);
  });

  it('enforces activation retry, pending deadline and access expiry at the server clock', async () => {
    const repo = auth(), first = await repo.issue(accountIdentity('activation'));
    expect(await repo.activate(first.accessToken, first.sessionId, 1)).toMatchObject({ kind: 'active', alreadyActive: false });
    time += 6 * 60_000;
    expect(await repo.activate(first.accessToken, first.sessionId, 1)).toMatchObject({ kind: 'active', alreadyActive: true });
    const pending = await repo.issue(accountIdentity('activation'));
    time += 6 * 60_000;
    expect(await repo.activate(pending.accessToken, pending.sessionId, 1)).toEqual({ kind: 'expired' });
    time += 4 * 60_000;
    expect(await repo.identity(first.accessToken)).toEqual({ kind: 'expired' });
    await expect((await repo.privateAthlete(first.accessToken)).repository.profile(first.accountId)).rejects.toThrow(AuthUnauthorized);
  });

  it('keeps unknown, crossed and expired credentials from changing another family', async () => {
    const repo = auth(), a = await repo.issue(accountIdentity('a')), b = await repo.issue(accountIdentity('b'));
    await repo.activate(a.accessToken, a.sessionId, 1); await repo.activate(b.accessToken, b.sessionId, 1);
    expect(await repo.activate(a.accessToken, b.sessionId, 1)).toEqual({ kind: 'invalid' });
    expect(await repo.revoke('0'.repeat(64))).toBe('invalid');
    expect(await repo.refresh(randomUUID(), '0'.repeat(64))).toEqual({ kind: 'invalid' });
    await expect((await repo.privateAthlete(a.accessToken)).repository.profile(b.accountId)).rejects.toThrow(OwnerUnavailable);
    expect(await repo.identity(b.accessToken)).toMatchObject({ kind: 'active' });
    time += 31 * 24 * 60 * 60_000;
    expect(await repo.refresh(randomUUID(), a.refreshToken)).toEqual({ kind: 'reauth_required' });
    time += 60 * 24 * 60 * 60_000;
    expect(await repo.identity(b.accessToken)).toEqual({ kind: 'expired' });
  });

  it('separates exact activation, access and refresh deadlines from confirmed revocation', async () => {
    const repo = auth(), activated = await repo.issue(accountIdentity('deadline'));
    time = Date.parse(activated.activationExpiresAt) - 1;
    expect(await repo.activate(activated.accessToken, activated.sessionId, 1)).toMatchObject({ kind: 'active', alreadyActive: false });
    time = Date.parse(activated.activationExpiresAt);
    expect(await repo.activate(activated.accessToken, activated.sessionId, 1)).toMatchObject({ kind: 'active', alreadyActive: true });
    const pending = await repo.issue(accountIdentity('deadline'));
    time = Date.parse(pending.activationExpiresAt);
    expect(await repo.activate(pending.accessToken, pending.sessionId, 1)).toEqual({ kind: 'expired' });
    time = Date.parse(activated.accessExpiresAt) - 1;
    expect(await repo.identity(activated.accessToken)).toMatchObject({ kind: 'active' });
    time = Date.parse(activated.accessExpiresAt);
    expect(await repo.identity(activated.accessToken)).toEqual({ kind: 'expired' });
    await expect((await repo.privateAthlete(activated.accessToken)).repository.profile(activated.accountId)).rejects.toThrow(AuthUnauthorized);
    time++;
    expect(await repo.identity(activated.accessToken)).toEqual({ kind: 'expired' });
    const refreshValid = await repo.refresh(randomUUID(), activated.refreshToken);
    expect(refreshValid.kind).toBe('credentials');

    const beforeBoundary = await repo.issue(accountIdentity('deadline'));
    const atBoundary = await repo.issue(accountIdentity('deadline'));
    await repo.activate(beforeBoundary.accessToken, beforeBoundary.sessionId, 1);
    await repo.activate(atBoundary.accessToken, atBoundary.sessionId, 1);
    time = Date.parse(beforeBoundary.refreshExpiresAt) - 1;
    expect((await repo.refresh(randomUUID(), beforeBoundary.refreshToken)).kind).toBe('credentials');
    time = Date.parse(atBoundary.refreshExpiresAt);
    expect(await repo.refresh(randomUUID(), atBoundary.refreshToken)).toEqual({ kind: 'reauth_required' });
    time++;
    expect(await repo.refresh(randomUUID(), atBoundary.refreshToken)).toEqual({ kind: 'reauth_required' });
    const family = (await admin.query('SELECT status,revoked_at FROM m1b.session_families WHERE family_id=$1', [atBoundary.sessionId])).rows[0];
    expect(family).toEqual({ status: 'active', revoked_at: null });
  });

  it('preserves ordinary absolute expiry, blocks private work and recovers prior outcome with a fresh same-account family', async () => {
    const repo = auth(undefined, undefined, { activationMs: 1000, accessMs: 10_000, refreshMs: 25_000, absoluteMs: 30_000 });
    const first = await repo.issue(accountIdentity('absolute-expiry'));
    await repo.activate(first.accessToken, first.sessionId, 1);
    const originalCommand = command(), original = await (await repo.privateAthlete(first.accessToken)).repository.execute(first.accountId, originalCommand);
    time = start + 24_000;
    const rotated = await repo.refresh(randomUUID(), first.refreshToken);
    expect(rotated.kind).toBe('credentials'); if (rotated.kind !== 'credentials') return;
    await repo.activate(rotated.bundle.accessToken, first.sessionId, 2);
    time = Date.parse(first.sessionExpiresAt) - 1;
    expect(await repo.identity(rotated.bundle.accessToken)).toMatchObject({ kind: 'active' });
    expect((await (await repo.privateAthlete(rotated.bundle.accessToken)).repository.profile(first.accountId)).revision).toBe(1);
    for (const instant of [Date.parse(first.sessionExpiresAt), Date.parse(first.sessionExpiresAt) + 1]) {
      time = instant;
      expect(await repo.identity(rotated.bundle.accessToken)).toEqual({ kind: 'expired' });
      expect(await repo.activate(rotated.bundle.accessToken, first.sessionId, 2)).toEqual({ kind: 'expired' });
      expect(await repo.refresh(randomUUID(), rotated.bundle.refreshToken)).toEqual({ kind: 'reauth_required' });
      await expect((await repo.privateAthlete(rotated.bundle.accessToken)).repository.outcome(first.accountId, originalCommand.operationId)).rejects.toThrow(AuthUnauthorized);
      expect((await admin.query('SELECT status,revoked_at FROM m1b.session_families WHERE family_id=$1', [first.sessionId])).rows[0]).toEqual({ status: 'active', revoked_at: null });
    }
    const returned = await repo.issue(accountIdentity('absolute-expiry'));
    expect(returned.accountId).toBe(first.accountId);
    await repo.activate(returned.accessToken, returned.sessionId, 1);
    expect(await (await repo.privateAthlete(returned.accessToken)).repository.outcome(first.accountId, originalCommand.operationId)).toEqual(original);
  });

  it('prioritizes persisted revocation and account-security invalidation even after an absolute deadline', async () => {
    const repo = auth(undefined, undefined, { activationMs: 1000, accessMs: 10_000, refreshMs: 25_000, absoluteMs: 30_000 });
    const loggedOut = await repo.issue(accountIdentity('revocation-precedence'));
    await repo.activate(loggedOut.accessToken, loggedOut.sessionId, 1);
    expect(await repo.revoke(loggedOut.revocationToken)).toBe('revoked');
    time = Date.parse(loggedOut.sessionExpiresAt);
    expect(await repo.identity(loggedOut.accessToken)).toEqual({ kind: 'revoked' });
    expect(await repo.activate(loggedOut.accessToken, loggedOut.sessionId, 1)).toEqual({ kind: 'revoked' });
    expect(await repo.refresh(randomUUID(), loggedOut.refreshToken)).toEqual({ kind: 'revoked' });
    const disabled = await repo.issue(accountIdentity('disabled-precedence'));
    await repo.activate(disabled.accessToken, disabled.sessionId, 1);
    await admin.query("UPDATE m1b.accounts SET status='disabled' WHERE account_id=$1", [disabled.accountId]);
    time = Date.parse(disabled.sessionExpiresAt);
    expect(await repo.identity(disabled.accessToken)).toEqual({ kind: 'revoked' });
    const epochChanged = await repo.issue(accountIdentity('epoch-precedence'));
    await repo.activate(epochChanged.accessToken, epochChanged.sessionId, 1);
    await admin.query('UPDATE m1b.accounts SET authorization_epoch=authorization_epoch+1 WHERE account_id=$1', [epochChanged.accountId]);
    time = Date.parse(epochChanged.sessionExpiresAt);
    expect(await repo.identity(epochChanged.accessToken)).toEqual({ kind: 'revoked' });
    expect(await repo.refresh(randomUUID(), epochChanged.refreshToken)).toEqual({ kind: 'revoked' });
  });

  it('invalidates sessions when account status or authorization epoch changes', async () => {
    const repo = auth(), bundle = await repo.issue(accountIdentity('status'));
    await repo.activate(bundle.accessToken, bundle.sessionId, 1);
    await admin.query("UPDATE m1b.accounts SET status='disabled' WHERE account_id=$1", [bundle.accountId]);
    expect(await repo.identity(bundle.accessToken)).toEqual({ kind: 'revoked' });
    await admin.query("UPDATE m1b.accounts SET status='active',authorization_epoch=authorization_epoch+1 WHERE account_id=$1", [bundle.accountId]);
    await expect((await repo.privateAthlete(bundle.accessToken)).repository.profile(bundle.accountId)).rejects.toThrow(AuthUnauthorized);
    expect(await repo.refresh(randomUUID(), bundle.refreshToken)).toEqual({ kind: 'revoked' });
  });

  it('rotates transactionally and treats a committed lost response as reauthentication, not bearer replay', async () => {
    const repo = auth(), first = await repo.issue(accountIdentity('rotation'));
    await repo.activate(first.accessToken, first.sessionId, 1);
    const operation = randomUUID();
    const rolled = auth(phase => { if (phase === 'before_refresh_commit') throw new Error('Injected rotation rollback'); });
    await expect(rolled.refresh(operation, first.refreshToken)).rejects.toThrow('Injected rotation rollback');
    expect(await repo.identity(first.accessToken)).toMatchObject({ kind: 'active' });
    const lost = auth(phase => { if (phase === 'after_refresh_commit') throw new Error('Injected lost rotation response'); });
    await expect(lost.refresh(operation, first.refreshToken)).rejects.toThrow('Injected lost rotation response');
    expect(await repo.refresh(operation, first.refreshToken)).toEqual({ kind: 'reauth_required' });
    expect(await repo.identity(first.accessToken)).toEqual({ kind: 'invalid' });
    const current = (await admin.query('SELECT current_generation,status FROM m1b.session_families WHERE family_id=$1', [first.sessionId])).rows[0];
    expect(current).toMatchObject({ current_generation: 2, status: 'pending' });
    // A fresh operation cannot recover the secret response; it is replay detection.
    expect(await repo.refresh(randomUUID(), first.refreshToken)).toEqual({ kind: 'revoked' });
  });

  it('does not let a delayed duplicate of a completed refresh revoke its activated successor', async () => {
    const repo = auth(), first = await repo.issue(accountIdentity('late-same-operation'));
    await repo.activate(first.accessToken, first.sessionId, 1);
    const operation = randomUUID(), next = await repo.refresh(operation, first.refreshToken);
    expect(next.kind).toBe('credentials'); if (next.kind !== 'credentials') return;
    expect(await repo.activate(next.bundle.accessToken, first.sessionId, 2)).toMatchObject({ kind: 'active' });
    expect(await repo.refresh(operation, first.refreshToken)).toEqual({ kind: 'reauth_required' });
    expect(await repo.refresh(operation, next.bundle.refreshToken)).toEqual({ kind: 'reauth_required' });
    expect(await repo.identity(next.bundle.accessToken)).toMatchObject({ kind: 'active' });
  });

  it('keeps an uppercase refresh UUID retry harmless before and after successor activation', async () => {
    const repo = auth(), first = await repo.issue(accountIdentity('uppercase-retry'));
    const upperSessionId = first.sessionId.toUpperCase();
    expect(ActivationRequestSchema.safeParse({ sessionId: upperSessionId, credentialGeneration: 1 }).success).toBe(true);
    expect(await repo.activate(first.accessToken, upperSessionId, 1)).toMatchObject({ kind: 'active', alreadyActive: false, identity: { sessionId: first.sessionId } });
    const upperOperation = 'ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF';
    expect(RefreshRequestSchema.safeParse({ operationId: upperOperation, refreshToken: first.refreshToken }).success).toBe(true);
    const next = await repo.refresh(upperOperation, first.refreshToken);
    expect(next.kind).toBe('credentials'); if (next.kind !== 'credentials') return;
    expect((await admin.query('SELECT consumed_operation_id FROM m1b.credential_generations WHERE family_id=$1 AND generation=1', [first.sessionId])).rows[0].consumed_operation_id).toBe(upperOperation.toLowerCase());
    expect(await repo.refresh(upperOperation, first.refreshToken)).toEqual({ kind: 'reauth_required' });
    expect((await admin.query('SELECT status,revoked_at FROM m1b.session_families WHERE family_id=$1', [first.sessionId])).rows[0]).toEqual({ status: 'pending', revoked_at: null });
    expect(await repo.activate(next.bundle.accessToken, upperSessionId, 2)).toMatchObject({ kind: 'active', alreadyActive: false, identity: { sessionId: first.sessionId } });
    expect(await repo.activate(next.bundle.accessToken, first.sessionId, 2)).toMatchObject({ kind: 'active', alreadyActive: true, identity: { sessionId: first.sessionId } });
    expect(await repo.refresh(upperOperation, first.refreshToken)).toEqual({ kind: 'reauth_required' });
    expect(await repo.identity(next.bundle.accessToken)).toMatchObject({ kind: 'active' });
    expect((await admin.query('SELECT status,revoked_at FROM m1b.session_families WHERE family_id=$1', [first.sessionId])).rows[0]).toEqual({ status: 'active', revoked_at: null });
  });

  it('treats mixed-case operation spellings as one UUID across generations while distinct replay stays family-scoped', async () => {
    const repo = auth(), first = await repo.issue(accountIdentity('case-equivalence'));
    const other = await repo.issue(accountIdentity('case-equivalence'));
    await repo.activate(first.accessToken, first.sessionId, 1);
    await repo.activate(other.accessToken, other.sessionId, 1);
    const upper = 'ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF';
    const mixed = 'AbCdEfAb-AbCd-4aBc-8aBc-AbCdEfAbCdEf';
    const next = await repo.refresh(upper, first.refreshToken);
    expect(next.kind).toBe('credentials'); if (next.kind !== 'credentials') return;
    expect(await repo.refresh(upper.toLowerCase(), first.refreshToken)).toEqual({ kind: 'reauth_required' });
    await repo.activate(next.bundle.accessToken, first.sessionId, 2);
    expect(await repo.refresh(mixed, first.refreshToken)).toEqual({ kind: 'reauth_required' });
    expect(await repo.refresh(mixed, next.bundle.refreshToken)).toEqual({ kind: 'reauth_required' });
    expect(await repo.identity(next.bundle.accessToken)).toMatchObject({ kind: 'active' });
    expect(await repo.refresh(randomUUID(), first.refreshToken)).toEqual({ kind: 'revoked' });
    expect(await repo.identity(next.bundle.accessToken)).toEqual({ kind: 'revoked' });
    expect(await repo.identity(other.accessToken)).toMatchObject({ kind: 'active' });
  });

  it('serializes concurrent equivalent-case refresh operations without revoking their family', async () => {
    const repo = auth(), first = await repo.issue(accountIdentity('concurrent-case-equivalence'));
    await repo.activate(first.accessToken, first.sessionId, 1);
    const upper = randomUUID().toUpperCase();
    const results = await Promise.all([repo.refresh(upper, first.refreshToken), repo.refresh(upper.toLowerCase(), first.refreshToken)]);
    expect(results.map(result => result.kind).sort()).toEqual(['credentials', 'reauth_required']);
    const next = results.find(result => result.kind === 'credentials');
    if (!next || next.kind !== 'credentials') return;
    expect((await admin.query('SELECT status,revoked_at FROM m1b.session_families WHERE family_id=$1', [first.sessionId])).rows[0]).toEqual({ status: 'pending', revoked_at: null });
    expect(await repo.activate(next.bundle.accessToken, first.sessionId.toUpperCase(), 2)).toMatchObject({ kind: 'active' });
    expect(await repo.identity(next.bundle.accessToken)).toMatchObject({ kind: 'active' });
  });

  it('activates a rotated generation, retains old revocation capability and recovers old outcome under fresh access', async () => {
    const repo = auth(), first = await repo.issue(accountIdentity('recover'));
    await repo.activate(first.accessToken, first.sessionId, 1);
    const old = await repo.privateAthlete(first.accessToken), item = command();
    const original = await old.repository.execute(first.accountId, item);
    const rotated = await repo.refresh(randomUUID(), first.refreshToken);
    expect(rotated.kind).toBe('credentials'); if (rotated.kind !== 'credentials') return;
    expect(rotated.bundle.sessionExpiresAt).toBe(first.sessionExpiresAt);
    expect(await repo.identity(first.accessToken)).toEqual({ kind: 'invalid' });
    expect(await repo.activate(rotated.bundle.accessToken, first.sessionId, 2)).toMatchObject({ kind: 'active' });
    const fresh = await repo.privateAthlete(rotated.bundle.accessToken);
    expect(await fresh.repository.outcome(first.accountId, item.operationId)).toEqual(original);
    expect(await fresh.repository.execute(first.accountId, item)).toEqual(original);
    expect(await repo.revoke(first.revocationToken)).toBe('revoked');
    expect(await repo.revoke(first.revocationToken)).toBe('revoked');
    expect(await repo.identity(rotated.bundle.accessToken)).toEqual({ kind: 'revoked' });
  });

  it('stores only credential hashes and returns sanitized invalid-identity and unknown-token outcomes', async () => {
    const repo = auth();
    const first = await repo.issue(accountIdentity('hash-only'));
    await repo.activate(first.accessToken, first.sessionId, 1);
    const rotated = await repo.refresh(randomUUID(), first.refreshToken);
    expect(rotated.kind).toBe('credentials'); if (rotated.kind !== 'credentials') return;
    const stored = await admin.query("SELECT (SELECT json_agg(g)::text FROM m1b.credential_generations g) || (SELECT json_agg(c)::text FROM m1b.revocation_capabilities c) AS data");
    for (const token of [first.accessToken, first.refreshToken, first.revocationToken, rotated.bundle.accessToken, rotated.bundle.refreshToken, rotated.bundle.revocationToken]) {
      expect(stored.rows[0].data).not.toContain(token);
    }
    const invalidSubject = 'private-identifier-that-must-not-appear-in-errors';
    await expect(repo.issue({ ...accountIdentity('x'), subject: invalidSubject.repeat(30) })).rejects.toThrow(AuthUnauthorized);
    expect(await repo.activate('0'.repeat(64), first.sessionId, 1)).toEqual({ kind: 'invalid' });
    expect(await repo.revoke('0'.repeat(64))).toBe('invalid');
  });

  it('serializes simultaneous refreshes with identical and different operation IDs', async () => {
    const repo = auth(), one = await repo.issue(accountIdentity('simultaneous'));
    await repo.activate(one.accessToken, one.sessionId, 1);
    const same = randomUUID();
    const identical = await Promise.all([repo.refresh(same, one.refreshToken), repo.refresh(same, one.refreshToken)]);
    expect(identical.map(result => result.kind).sort()).toEqual(['credentials', 'reauth_required']);
    const second = await repo.issue(accountIdentity('simultaneous'));
    await repo.activate(second.accessToken, second.sessionId, 1);
    const different = await Promise.all([repo.refresh(randomUUID(), second.refreshToken), repo.refresh(randomUUID(), second.refreshToken)]);
    expect(different.map(result => result.kind).sort()).toEqual(['credentials', 'revoked']);
    expect((await admin.query('SELECT status FROM m1b.session_families WHERE family_id=$1', [second.sessionId])).rows[0].status).toBe('revoked');
    expect((await admin.query('SELECT status FROM m1b.session_families WHERE family_id=$1', [one.sessionId])).rows[0].status).toBe('pending');
  });

  it('restricts runtime roles, lookup capabilities, fixture access and transaction-local RLS context', async () => {
    const repo = auth(), a = await repo.issue(accountIdentity('rls-a')), b = await repo.issue(accountIdentity('rls-b'));
    await repo.activate(a.accessToken, a.sessionId, 1); await repo.activate(b.accessToken, b.sessionId, 1);
    await (await repo.privateAthlete(a.accessToken)).repository.execute(a.accountId, command());
    await (await repo.privateAthlete(b.accessToken)).repository.execute(b.accountId, command());
    const roles = await admin.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('fitquest_m1b_api','fitquest_m1c3_api','fitquest_m1c3_lookup')");
    expect(roles.rows).toHaveLength(3);
    expect(roles.rows.every(row => !row.rolsuper && !row.rolbypassrls)).toBe(true);
    const secured = await admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('m1b.accounts'::regclass,'m1b.aggregates'::regclass,'m1b.operation_outcomes'::regclass,'m1b.session_families'::regclass,'m1b.credential_generations'::regclass,'m1b.revocation_capabilities'::regclass)");
    expect(secured.rows).toHaveLength(6);
    expect(secured.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    expect((await runtime.query("SELECT has_column_privilege(current_user,'m1b.accounts','environment','UPDATE') AS environment,has_column_privilege(current_user,'m1b.accounts','lock_guard','UPDATE') AS guard")).rows[0]).toEqual({ environment: false, guard: true });
    expect((await runtime.query("SELECT has_column_privilege(current_user,'m1b.credential_generations','access_hash','UPDATE') AS access_hash,has_column_privilege(current_user,'m1b.credential_generations','status','UPDATE') AS status")).rows[0]).toEqual({ access_hash: false, status: true });
    expect((await lookup.query("SELECT has_table_privilege(current_user,'m1b.aggregates','SELECT') AS domain,has_table_privilege(current_user,'m1b.credential_generations','SELECT') AS secrets")).rows[0]).toEqual({ domain: false, secrets: false });
    await expect(lookup.query('SELECT * FROM m1b.aggregates')).rejects.toThrow();
    const client = await runtime.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('fitquest.owner_id',$1,true)", [a.accountId]);
      expect(Number((await client.query('SELECT count(*) AS n FROM m1b.aggregates')).rows[0].n)).toBe(1);
      expect(Number((await client.query('SELECT count(*) AS n FROM m1b.aggregates WHERE account_id=$1', [b.accountId])).rows[0].n)).toBe(0);
      await client.query('COMMIT');
      expect(Number((await client.query('SELECT count(*) AS n FROM m1b.aggregates')).rows[0].n)).toBe(0);
    } finally { client.release(); }
    const fixtureFacade = new PostgresAthleteRepository(fixture);
    await expect(fixtureFacade.profile(a.accountId)).rejects.toThrow(OwnerUnavailable);
    const fixtureClient = await fixture.connect();
    try {
      await fixtureClient.query('BEGIN');
      await fixtureClient.query("SELECT set_config('fitquest.owner_id',$1,true)", [a.accountId]);
      expect(Number((await fixtureClient.query('SELECT count(*) AS n FROM m1b.aggregates')).rows[0].n)).toBe(0);
      await fixtureClient.query('ROLLBACK');
    } finally { fixtureClient.release(); }
  });

  it('lets a command holding the account guard commit before logout, then blocks its old access', async () => {
    const entered = deferred(), gate = deferred();
    const repo = auth(undefined, async phase => { if (phase === 'after_claim') { entered.release(); await gate.promise; } });
    const bundle = await repo.issue(accountIdentity('command-first')); await repo.activate(bundle.accessToken, bundle.sessionId, 1);
    const privateView = await repo.privateAthlete(bundle.accessToken);
    const work = privateView.repository.execute(bundle.accountId, command());
    await entered.promise;
    const logout = repo.revoke(bundle.revocationToken);
    gate.release();
    expect((await work).state).toBe('committed');
    expect(await logout).toBe('revoked');
    await expect(privateView.repository.profile(bundle.accountId)).rejects.toThrow(AuthUnauthorized);
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.operation_outcomes')).rows[0].n)).toBe(1);
  });

  it.each(['profile', 'outcome'] as const)('allows an already guarded %s read to finish before logout', async kind => {
    const initial = auth(), bundle = await initial.issue(accountIdentity(`read-first-${kind}`));
    await initial.activate(bundle.accessToken, bundle.sessionId, 1);
    const item = command();
    const original = await (await initial.privateAthlete(bundle.accessToken)).repository.execute(bundle.accountId, item);
    const entered = deferred(), gate = deferred();
    const racing = auth(undefined, async phase => { if (phase === 'after_owner_guard') { entered.release(); await gate.promise; } });
    const privateView = await racing.privateAthlete(bundle.accessToken);
    const read = kind === 'profile' ? privateView.repository.profile(bundle.accountId) : privateView.repository.outcome(bundle.accountId, item.operationId);
    await entered.promise;
    const logout = racing.revoke(bundle.revocationToken);
    gate.release();
    const result = await read;
    if (kind === 'profile') expect(result).toMatchObject({ revision: 1, document: profile });
    else expect(result).toEqual(original);
    expect(await logout).toBe('revoked');
    await expect(privateView.repository.profile(bundle.accountId)).rejects.toThrow(AuthUnauthorized);
  });

  it('rechecks a preselected candidate after logout wins and rejects commands, reads and outcomes before domain work', async () => {
    const entered = deferred(), gate = deferred();
    const repo = auth(async phase => { if (phase === 'after_logout_guard') { entered.release(); await gate.promise; } });
    const bundle = await repo.issue(accountIdentity('logout-first')); await repo.activate(bundle.accessToken, bundle.sessionId, 1);
    const privateView = await repo.privateAthlete(bundle.accessToken);
    const earlier = command();
    expect((await privateView.repository.execute(bundle.accountId, earlier)).state).toBe('committed');
    const logout = repo.revoke(bundle.revocationToken);
    await entered.promise;
    const item = command();
    const write = privateView.repository.execute(bundle.accountId, item);
    const read = privateView.repository.profile(bundle.accountId);
    const outcome = privateView.repository.outcome(bundle.accountId, earlier.operationId);
    const rejected = [expect(write).rejects.toThrow(AuthUnauthorized), expect(read).rejects.toThrow(AuthUnauthorized), expect(outcome).rejects.toThrow(AuthUnauthorized)];
    gate.release();
    expect(await logout).toBe('revoked');
    await Promise.all(rejected);
    expect(Number((await admin.query('SELECT count(*) AS n FROM m1b.operation_outcomes')).rows[0].n)).toBe(1);
  });

  it('serializes refresh and logout both ways across separate PostgreSQL connections', async () => {
    const firstEntered = deferred(), firstGate = deferred();
    const firstRepo = auth(async phase => { if (phase === 'before_refresh_commit') { firstEntered.release(); await firstGate.promise; } });
    const first = await firstRepo.issue(accountIdentity('refresh-first')); await firstRepo.activate(first.accessToken, first.sessionId, 1);
    const refresh = firstRepo.refresh(randomUUID(), first.refreshToken);
    await firstEntered.promise;
    const logout = firstRepo.revoke(first.revocationToken);
    firstGate.release();
    const next = await refresh; expect(next.kind).toBe('credentials');
    expect(await logout).toBe('revoked');
    if (next.kind === 'credentials') expect(await firstRepo.activate(next.bundle.accessToken, first.sessionId, 2)).toEqual({ kind: 'revoked' });

    const secondEntered = deferred(), secondGate = deferred();
    const secondRepo = auth(async phase => { if (phase === 'after_logout_guard') { secondEntered.release(); await secondGate.promise; } });
    const second = await secondRepo.issue(accountIdentity('logout-before-refresh')); await secondRepo.activate(second.accessToken, second.sessionId, 1);
    const logoutFirst = secondRepo.revoke(second.revocationToken);
    await secondEntered.promise;
    const refreshSecond = secondRepo.refresh(randomUUID(), second.refreshToken);
    secondGate.release();
    expect(await logoutFirst).toBe('revoked');
    expect(await refreshSecond).toEqual({ kind: 'revoked' });
  });

  it('persists generations and domain history through new repository and pool connections', async () => {
    const first = auth(), bundle = await first.issue(accountIdentity('reconnect'));
    await first.activate(bundle.accessToken, bundle.sessionId, 1);
    const item = command();
    const original = await (await first.privateAthlete(bundle.accessToken)).repository.execute(bundle.accountId, item);
    const freshRuntime = new Pool({ ...target, user: 'fitquest_m1c3_api', max: 2 });
    const freshLookup = new Pool({ ...target, user: 'fitquest_m1c3_lookup', max: 2 });
    try {
      const restarted = new AuthSessionRepository(freshRuntime, freshLookup, new PostgresAthleteRepository(freshRuntime), () => new Date(time));
      expect(await restarted.identity(bundle.accessToken)).toMatchObject({ kind: 'active' });
      expect(await (await restarted.privateAthlete(bundle.accessToken)).repository.outcome(bundle.accountId, item.operationId)).toEqual(original);
      expect(await restarted.refresh(randomUUID(), bundle.refreshToken)).toMatchObject({ kind: 'credentials' });
    } finally { await Promise.all([freshRuntime.end(), freshLookup.end()]); }
  });
});
