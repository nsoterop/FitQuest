import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import test from 'node:test';
import { assertOwnerMarker, assertTargetIdentity, assertDatabaseEvidence, assertPath, data, database, databaseMarker, migrations, owner, port, socket } from './m1c4b-preflight.mjs';

const evidence = () => ({
  schemas: ['m1b', 'public'], publicTables: [],
  tables: ['meta', 'migrations', 'accounts', 'aggregates', 'aggregate_revisions', 'operation_outcomes', 'provider_identities', 'session_families', 'credential_generations', 'revocation_capabilities','auth_challenges','auth_exchange_attempts'],
  markerValue: databaseMarker,
  ledger: migrations.map(item => ({ version: item.version, checksum: createHash('sha256').update(readFileSync(item.file)).digest('hex') })),
});
const target = () => ({ db: database, dir: data, port, tcp: null, listeners: '', sockets: socket });
const cleanup = (fileMarker, targetRow, databaseEvidence, action) => {
  assertOwnerMarker(fileMarker);
  assertTargetIdentity(targetRow, database);
  const ledger = assertDatabaseEvidence(databaseEvidence);
  if (ledger.length !== migrations.length) throw new Error('M1c.4b migrations incomplete');
  action();
};

test('valid exact preflight permits a cleanup callback', () => {
  let called = 0;
  cleanup(owner, target(), evidence(), () => { called++; });
  assert.equal(called, 1);
});

test('changed checksum and unknown migration entry stop before cleanup', () => {
  for (const mutation of ['checksum', 'unknown-version']) {
    const snapshot = evidence();
    if (mutation === 'checksum') snapshot.ledger[2].checksum = '0'.repeat(64);
    else snapshot.ledger.push({ version: 99, checksum: '0'.repeat(64) });
    let called = 0;
    assert.throws(() => cleanup(owner, target(), snapshot, () => { called++; }), /migration ledger/);
    assert.equal(called, 0);
  }
});

test('old six-entry ledger or altered correction checksum cannot authorize cleanup', () => {
  const old={...evidence(),ledger:evidence().ledger.slice(0,6)};
  assert.equal(assertDatabaseEvidence(old).length,6); // Valid upgrade prefix, not a completed test target.
  const altered=evidence();altered.ledger[6].checksum='0'.repeat(64);
  for(const snapshot of [old,altered]) {
    let called=0;
    assert.throws(()=>cleanup(owner,target(),snapshot,()=>{called++;}));
    assert.equal(called,0);
  }
});

test('wrong filesystem/database marker and redirected target stop before cleanup', () => {
  const cases = [
    [{ ...owner, database: 'other' }, target(), evidence()],
    [owner, target(), { ...evidence(), markerValue: 'other' }],
    [owner, { ...target(), db: 'other' }, evidence()],
    [owner, { ...target(), dir: '/private/tmp/other-data' }, evidence()],
    [owner, { ...target(), tcp: '127.0.0.1' }, evidence()],
  ];
  for (const [fileMarker, targetRow, snapshot] of cases) {
    let called = 0;
    assert.throws(() => cleanup(fileMarker, targetRow, snapshot, () => { called++; }));
    assert.equal(called, 0);
  }
});

test('unknown schema or table stops before cleanup', () => {
  for (const snapshot of [
    { ...evidence(), schemas: ['m1b', 'public', 'other'] },
    { ...evidence(), tables: [...evidence().tables, 'unexpected'] },
  ]) {
    let called = 0;
    assert.throws(() => cleanup(owner, target(), snapshot, () => { called++; }));
    assert.equal(called, 0);
  }
});

test('incomplete ledger, missing tables, unrecorded exchange tables and public tables stop before cleanup', () => {
  const cases = [
    { ...evidence(), ledger: evidence().ledger.slice(0,4) },
    { ...evidence(), tables: evidence().tables.filter(name => name !== 'auth_challenges') },
    { ...evidence(), tables: evidence().tables.filter(name => name !== 'aggregates') },
    { ...evidence(), publicTables: ['unexpected'] },
  ];
  for (const snapshot of cases) {
    let called=0;
    assert.throws(() => cleanup(owner,target(),snapshot,() => {called++;}));
    assert.equal(called,0);
  }
});

test('wrong port, alternate socket or enabled TCP listener stops before cleanup', () => {
  for (const row of [{ ...target(),port:55440 },{ ...target(),sockets:'/private/tmp/other' },{ ...target(),listeners:'localhost' }]) {
    let called=0;
    assert.throws(() => cleanup(owner,row,evidence(),() => {called++;}));
    assert.equal(called,0);
  }
});

test('missing data and symlinked paths cannot reach cleanup', () => {
  const base=realpathSync(mkdtempSync('/private/tmp/fitquest-m1c4b-guard-'));
  try {
    symlinkSync(base,`${base}/redirect`);
    for (const path of [`${base}/missing-data`,`${base}/redirect`]) {
      let called=0;
      assert.throws(() => {assertPath(path);called++;});
      assert.equal(called,0);
    }
  } finally {rmSync(base,{recursive:true});}
});
