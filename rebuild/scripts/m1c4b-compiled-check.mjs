import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import pg from 'pg';
import { preflight, socket, port, database } from './m1c4b-preflight.mjs';

const require = createRequire(import.meta.url);
let outbound=0;
globalThis.fetch=async () => {outbound++;throw new Error('Unexpected outbound call');};
const { CompactSign,exportJWK,generateKeyPair }=require('jose');
const { createSimulatedAppleSignInForTest }=require('../services/api/dist/simulatedAppleSignIn.js');
const { AuthSessionRepository,AuthUnauthorized }=require('../services/api/dist/authSessions.js');
const { PostgresAthleteRepository }=require('../services/api/dist/repository.js');
const { CommandSchema }=require('../packages/contracts/dist/index.js');
const target={host:socket,port,database};
const admin=new pg.Client({...target,user:os.userInfo().username});
await admin.connect();
let runtime,preauth,lookup;
try {
  await preflight(admin); // Read-only exact guard; this probe never cleans/resets/migrates the target.
  runtime=new pg.Pool({...target,user:'fitquest_m1c4b_api',max:2});
  preauth=new pg.Pool({...target,user:'fitquest_m1c4b_preauth',max:2});
  lookup=new pg.Pool({...target,user:'fitquest_m1c4b_lookup',max:2});
  const time=new Date('2026-09-29T12:00:00Z'),second=time.getTime()/1000;
  const clientId='com.example.fitquest.compiled.exchange',environment='m1c4b.synthetic.test.v1';
  const subject=`Invented-Compiled-${randomUUID()}`;
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const keys=[{...await exportJWK(publicKey),kid:'compiled-exchange-key',alg:'RS256',use:'sig'}];
  const sessions=new AuthSessionRepository(runtime,lookup,new PostgresAthleteRepository(runtime),()=>time,undefined,{},environment);
  const responses=new Map();let calls=0;
  const service=createSimulatedAppleSignInForTest({clientId,environment,jwtClockToleranceSeconds:0},{
    runtime,preauth,sessions,now:()=>time,
    fetch:async (url,options) => {
      assert.equal(url,'https://appleid.apple.com/auth/keys');assert.equal(options.redirect,'manual');
      assert.equal(preauth.totalCount,preauth.idleCount);assert.equal(runtime.totalCount,runtime.idleCount);
      return new Response(JSON.stringify({keys}));
    },
    exchange:{exchange:async input => {
      calls++;assert.equal(input.clientId,clientId);
      assert.equal(preauth.totalCount,preauth.idleCount);assert.equal(runtime.totalCount,runtime.idleCount);
      return {identityToken:responses.get(input.authorizationCode)};
    }},
  });
  const sign=async (nonce,exp,identitySubject=subject) => new CompactSign(Buffer.from(JSON.stringify({iss:'https://appleid.apple.com',aud:clientId,sub:identitySubject,nonce,iat:second,exp})))
    .setProtectedHeader({alg:'RS256',kid:'compiled-exchange-key'}).sign(privateKey);
  const request=async (identitySubject=subject) => {
    const challenge=await service.challenge();assert.ok(challenge.challengeId);
    const authorizationCode=`Invented-Compiled-Code-${randomUUID()}`;
    responses.set(authorizationCode,await sign(challenge.nonce,second+120,identitySubject));
    return {challengeId:challenge.challengeId,state:challenge.state,identityToken:await sign(challenge.nonce,second+300,identitySubject),authorizationCode};
  };
  const wire=await request();
  assert.deepEqual(await service.exchange({...wire,state:'wrong-state'}),{kind:'error',code:'AUTH_INVALID'});assert.equal(calls,0);
  const issued=await service.exchange({...wire,challengeId:wire.challengeId.toUpperCase()});assert.equal(issued.kind,'credentials');
  const bundle=issued.bundle,view=await sessions.privateAthlete(bundle.accessToken);
  await assert.rejects(view.repository.profile(bundle.accountId),AuthUnauthorized);
  assert.deepEqual(await service.exchange(wire),{kind:'error',code:'AUTH_REAUTH_REQUIRED'});assert.equal(calls,1);
  assert.equal((await sessions.activate(bundle.accessToken,bundle.sessionId,1)).kind,'active');
  assert.equal((await sessions.identity(bundle.accessToken)).kind,'active');
  const command=CommandSchema.parse({contractVersion:1,operationId:randomUUID(),kind:'profile.put',expectedRevision:0,
    payload:{displayName:'Invented compiled athlete',timeZone:'UTC',units:{load:'lb',distance:'mi'}}});
  assert.equal((await view.repository.execute(bundle.accountId,command)).state,'committed');
  const refreshed=await sessions.refresh(randomUUID(),bundle.refreshToken);assert.equal(refreshed.kind,'credentials');
  assert.equal((await sessions.activate(refreshed.bundle.accessToken,bundle.sessionId,2)).kind,'active');
  assert.equal(await sessions.revoke(bundle.revocationToken),'revoked');
  await assert.rejects(view.repository.profile(bundle.accountId),AuthUnauthorized);
  const fresh=await service.exchange(await request());assert.equal(fresh.kind,'credentials');assert.equal(fresh.bundle.accountId,bundle.accountId);
  await sessions.activate(fresh.bundle.accessToken,fresh.bundle.sessionId,1);
  const next=await sessions.privateAthlete(fresh.bundle.accessToken);
  assert.equal((await next.repository.outcome(bundle.accountId,command.operationId)).state,'committed');
  const stored=(await admin.query('SELECT row_to_json(a)::text AS value FROM m1b.auth_exchange_attempts a JOIN m1b.auth_challenges c USING(challenge_id) WHERE c.challenge_id=$1',[wire.challengeId])).rows;
  assert.equal(stored.length,1);
  for (const secret of [wire.identityToken,wire.authorizationCode,bundle.accessToken,bundle.refreshToken,bundle.revocationToken]) assert.ok(!stored[0].value.includes(secret));
  const disabledSubject=`Invented-Compiled-Disabled-${randomUUID()}`;
  const disabled=await service.exchange(await request(disabledSubject));assert.equal(disabled.kind,'credentials');
  assert.equal((await sessions.activate(disabled.bundle.accessToken,disabled.bundle.sessionId,1)).kind,'active');
  await admin.query("UPDATE m1b.accounts SET status='disabled' WHERE account_id=$1",[disabled.bundle.accountId]);
  const denied=await request(disabledSubject),beforeCalls=calls;
  const counts=async () => (await admin.query(`SELECT
    (SELECT count(*)::int FROM m1b.auth_exchange_attempts) AS attempts,
    (SELECT count(*)::int FROM m1b.session_families) AS families,
    (SELECT count(*)::int FROM m1b.credential_generations) AS generations,
    (SELECT count(*)::int FROM m1b.revocation_capabilities) AS capabilities`)).rows[0];
  const beforeCounts=await counts();
  assert.deepEqual(await service.exchange(denied),{kind:'error',code:'AUTH_INVALID'});
  assert.equal(calls,beforeCalls);assert.deepEqual(await counts(),beforeCounts);
  assert.equal((await admin.query('SELECT 1 FROM m1b.auth_exchange_attempts WHERE challenge_id=$1',[denied.challengeId])).rowCount,0);
  assert.equal((await sessions.identity(fresh.bundle.accessToken)).kind,'active');
  assert.equal((await next.repository.profile(fresh.bundle.accountId)).revision,1);
  assert.equal((await sessions.identity(disabled.bundle.accessToken)).kind,'revoked');
  await preflight(admin);assert.equal(outbound,0);
  console.log(`Compiled exchange, pending issuance, session lifecycle and disabled-account denial passed on Node ${process.versions.node}; zero outbound calls, no cleanup.`);
} finally {
  await Promise.all([runtime?.end(),preauth?.end(),lookup?.end()]);await admin.end();
}
