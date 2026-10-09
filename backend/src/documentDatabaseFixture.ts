import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {TestContext} from 'node:test';
import type {Pool} from 'pg';
import type {ProfileStore} from './profileStore.js';
import type {OnboardingProvider} from './onboardingProvider.js';
import {planningStore} from './planningStore.js';
import {planningService} from './planning.js';
import {intakeSummary} from './fixedIntake.js';
import {syntheticAnswers} from './completePlanFixture.js';
import {rowDocumentFixture as documentFixture,documentFixture as legacyDocumentFixture} from './documentPlanFixture.js';
import {documentOverview} from './documentPlanContract.js';
export async function verifyDocumentDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
 async function fresh(){
  const a={userId:randomUUID(),sessionId:randomUUID()};await owner.query('INSERT INTO auth.users(id) VALUES($1)',[a.userId]);await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[a.sessionId,a.userId]);
  await profiles.save(a,{firstName:'Synthetic',lastName:'Documents',age:30,height:{value:68,unit:'in'},weight:{value:155,unit:'lb'},gender:'Unspecified'});
  await owner.query("INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'America/New_York')",[a.userId,JSON.stringify(intakeSummary({version:1,answers:syntheticAnswers}))]);
  const store=planningStore(pool),plan=(await store.ensurePlan(a,1)).plans[0]!;assert.equal(plan.schemaVersion,'document-week-v2');
  const r={summaryRevision:1,planId:plan.id,target:'week',retryAttempt:null as string|null},document=documentFixture(plan.dates),bodies:string[]=[];
  let mode='valid',changed=false;
  const provider:OnboardingProvider={mode:'test',model:'gpt-6.1-sol',capMicro:7000000,prepare(){throw Error('No intake calls')},cost:()=>10,call:async body=>{
   bodies.push(body);const req=JSON.parse(body);assert.deepEqual(req.reasoning,{effort:'low'});assert.equal(req.text.format.name,'document_week_v2');assert(!req.input.includes('catalog'));assert(syntheticAnswers.every(answer=>req.input.includes(answer)));
   const result=structuredClone(document);if(changed)result.days[1]!.sessions[0]!.exercises=[{exercise:'Gentle floor flow',prescription:'10 minutes.'}];
   return {...(['refused','incomplete','provider_error'].includes(mode)?{failure:mode as 'refused'}:{proposal:mode==='invalid'?{days:[]} : result}),...(mode==='provider_error'?{}:{usage:{input:10,output:10,cached:0,cacheWrite:0}})};
  }};
  const read=async()=>(await store.read(a)).plans[0]!;
  const saved=async()=>(await owner.query('SELECT document_plan,document_history,review_revision,review_state,accepted_at FROM fitquest.training_plans WHERE user_id=$1',[a.userId])).rows[0];
  const attempts=async()=>(await owner.query('SELECT * FROM fitquest.onboarding_attempts WHERE user_id=$1 ORDER BY created_at,id',[a.userId])).rows;
  return{a,r,plan,document,bodies,provider,store,read,saved,attempts,service:planningService(store,provider,'test'),setMode:(v:string,change=false)=>{mode=v;changed=change}};
 }
 await t.test('new document success has one accounted dispatch, preserves all sessions and hides prose; acceptance/reopen are free and idempotent',async()=>{
  const f=await fresh();assert.equal((await f.store.read(f.a)).onboarded,false);assert.equal(f.bodies.length,0);await Promise.all([f.service.generate(f.a,f.r,async()=>true),f.service.generate(f.a,f.r,async()=>true)]);assert.equal(f.bodies.length,1);let p=await f.read();assert.equal(p.completeReady,true);assert.equal(p.documentPlan,null);assert(!JSON.stringify(p).includes('Crab reach'));assert(!JSON.stringify(p).includes('exercises'));assert(!JSON.stringify(p).includes('prescription'));assert.deepEqual(p.documentOverview,documentOverview(f.document));assert.deepEqual((await f.saved()).document_plan,f.document);
  const attempts=await f.attempts();assert.equal(attempts.length,1);assert.equal(attempts[0].state,'settled');assert.equal(Number(attempts[0].actual_micro),10);assert.equal(attempts[0].schema_version,'document-week-v2');
  const v={summaryRevision:1,planId:f.plan.id,planRevision:1};await assert.rejects(f.store.accept(f.a,{...v,planRevision:0}),{code:'plan_changed'});await Promise.all([f.store.accept(f.a,v),f.store.accept(f.a,v)]);p=await f.read();assert.deepEqual(p.documentPlan,f.document);assert.equal((await f.store.read(f.a)).onboarded,true);assert.equal(p.acceptedDocument,null);assert.equal(p.reviewState,'accepted');assert.equal((await f.saved()).document_history.length,1);assert(!JSON.stringify(p).includes('document_history'));await f.service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,1);assert.deepEqual(await f.attempts(),attempts);
 });
 await t.test('document refusals/incomplete/schema failures remain distinct and explicit; uncertain charges and private diagnostics survive retries',async()=>{
  const f=await fresh();for(const mode of ['refused','incomplete','invalid','provider_error']){f.setMode(mode);const n=f.bodies.length;await f.service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,n+1);let p=await f.read();assert.equal(p.jobs[0].error,mode==='invalid'?'invalid_document':mode);assert.equal(p.completeReady,false);assert.equal(p.documentPlan,null);await f.service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,n+1);f.r.retryAttempt=p.jobs[0].attemptId;}
  const before=await f.attempts();assert.equal(before.filter(a=>a.state==='uncertain').length,1);f.setMode('valid');await f.service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,5);assert.deepEqual((await f.attempts()).slice(0,4),before);
  const ds=(await owner.query('SELECT diagnostic,catalog_version,schema_version FROM fitquest.plan_validation_diagnostics WHERE user_id=$1',[f.a.userId])).rows;assert.equal(ds.length,1);assert.equal(ds[0].schema_version,'document-week-v2');assert.equal(ds[0].catalog_version,'not-applicable');assert.equal(ds[0].diagnostic.rule,'shape');assert(!JSON.stringify(ds).includes('Crab'));
 });
 await t.test('one-request revisions preserve accepted work on failure and accepted history after success; exact-revision acceptance and duplicates are free',async()=>{
  const f=await fresh();await f.service.generate(f.a,f.r,async()=>true);const v={summaryRevision:1,planId:f.plan.id,planRevision:1};await f.store.accept(f.a,v);const old=await f.saved(),review={...v,feedback:'Revise Tuesday only; keep the rest.',retryAttempt:null as string|null};
  f.setMode('invalid',true);await f.service.review(f.a,review,async()=>true);assert.equal(f.bodies.length,2);assert.deepEqual(await f.saved(),old);assert.deepEqual((await f.read()).documentPlan,f.document);review.retryAttempt=(await f.read()).jobs.find((j:any)=>j.target==='review:1').attemptId;
  f.setMode('valid',true);await Promise.all([f.service.review(f.a,review,async()=>true),f.service.review(f.a,review,async()=>true)]);assert.equal(f.bodies.length,3);const pending=await f.read();assert.equal(pending.planRevision,2);assert.equal(pending.documentPlan,null);assert.equal(pending.acceptedAt,null);assert.equal((await f.store.read(f.a)).onboarded,true);assert.deepEqual(pending.acceptedDocument,old.document_history[0]);assert.deepEqual((await f.saved()).document_history,old.document_history);assert.equal((await f.saved()).document_plan.days[0].sessions.length,2);
  await f.service.review(f.a,review,async()=>true);assert.equal(f.bodies.length,3);await assert.rejects(f.store.accept(f.a,v),{code:'plan_changed'});const attempts=await f.attempts();await f.store.accept(f.a,{...v,planRevision:2});await f.store.accept(f.a,{...v,planRevision:2});const history=(await f.saved()).document_history;assert.equal(history.length,2);assert.deepEqual(history[0],old.document_history[0]);assert.deepEqual(history[1].plan,(await f.read()).documentPlan);assert.deepEqual(await f.attempts(),attempts);
 });
 await t.test('document ownership, stale profile/revision, lease recovery and late publication never replace usable accepted work',async()=>{
  const f=await fresh(),other=await fresh();assert.equal((await other.store.read(other.a)).onboarded,false);await f.service.generate(f.a,f.r,async()=>true);const v={summaryRevision:1,planId:f.plan.id,planRevision:1};await f.store.accept(f.a,v);const old=await f.saved();await assert.rejects(other.service.generate(other.a,f.r,async()=>true),{code:'not_found'});await assert.rejects(other.store.accept(other.a,v),{code:'not_found'});
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[other.a.userId]);assert.equal((await c.query('SELECT document_plan,document_history FROM fitquest.training_plans WHERE user_id=$1',[f.a.userId])).rowCount,0);await c.query('ROLLBACK')}finally{c.release()}
  const review={...v,feedback:'Change Tuesday.',retryAttempt:null as string|null};const work=await f.store.claimReview(f.a,review,f.provider);assert(work);await f.store.settle(f.a,work.attempt,10);await owner.query("UPDATE fitquest.profiles SET updated_at=updated_at+interval '1 second' WHERE user_id=$1",[f.a.userId]);await f.store.finish(f.a,work,f.document);assert.deepEqual(await f.saved(),old);
  review.retryAttempt=work.attempt;const newer=await f.store.claimReview(f.a,review,f.provider);assert(newer);await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1 AND status='pending'",[f.a.userId]);await planningStore(pool).read(f.a);assert.equal((await f.attempts()).find(a=>a.id===newer.attempt).state,'uncertain');await f.store.settle(f.a,newer.attempt,7);await f.store.finish(f.a,newer,f.document);assert.deepEqual(await f.saved(),old);
  review.retryAttempt=newer.attempt;const stale=await f.store.claimReview(f.a,review,f.provider);assert(stale);await f.store.settle(f.a,stale.attempt,10);await owner.query('UPDATE fitquest.training_plans SET review_revision=2 WHERE user_id=$1',[f.a.userId]);await f.store.finish(f.a,stale,f.document);assert.deepEqual((await f.saved()).document_plan,old.document_plan);assert.deepEqual((await f.saved()).document_history,old.document_history);
 });
 await t.test('document headroom and signout prevent extra calls, and failed database publication preserves prior accepted snapshots',async()=>{
  const f=await fresh();f.provider.capMicro=1;await f.service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,0);assert.equal((await f.read()).jobs[0].error,'budget_exhausted');assert.equal((await f.attempts())[0].state,'not_dispatched');f.r.retryAttempt=(await f.read()).jobs[0].attemptId;f.provider.capMicro=7000000;
  await assert.rejects(f.service.generate(f.a,f.r,async()=>false),{code:'session_ended'});assert.equal(f.bodies.length,1);assert.equal((await f.saved()).document_plan,null);assert.equal((await f.attempts())[1].state,'settled');
  const good=await fresh();await good.service.generate(good.a,good.r,async()=>true);const v={summaryRevision:1,planId:good.plan.id,planRevision:1};await good.store.accept(good.a,v);const old=await good.saved();
  await owner.query(`CREATE FUNCTION fitquest.fail_document_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic commit failure'; END $$; CREATE CONSTRAINT TRIGGER fail_document_test AFTER UPDATE ON fitquest.training_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.user_id='${good.a.userId}'::uuid AND NEW.review_revision>1) EXECUTE FUNCTION fitquest.fail_document_test();`);
  try{await assert.rejects(good.service.review(good.a,{...v,feedback:'Update Tuesday.',retryAttempt:null},async()=>true));assert.deepEqual(await good.saved(),old);assert.equal(good.bodies.length,2);assert((await good.attempts()).every(a=>a.state==='settled'));}finally{await owner.query('DROP TRIGGER fail_document_test ON fitquest.training_plans; DROP FUNCTION fitquest.fail_document_test()');}
 });
 await t.test('legacy Markdown reads and acceptance stay free; explicit revision publishes rows atomically and preserves untagged accepted history',async()=>{
  const f=await fresh(),legacy=legacyDocumentFixture(f.plan.dates);
  legacy.days[0]!.sessions[0]!.workoutMarkdown='## General weekly approach\nSynthetic historical note.\n'+legacy.days[0]!.sessions[0]!.workoutMarkdown;
  await owner.query("UPDATE fitquest.training_plans SET schema_version='document-week-v1',document_plan=$2,review_revision=1 WHERE user_id=$1",[f.a.userId,JSON.stringify(legacy)]);
  let p=await f.read();assert.equal(p.schemaVersion,'document-week-v1');assert.equal(p.documentPlan,null);assert(!JSON.stringify(p).includes('General weekly approach'));const v={summaryRevision:1,planId:f.plan.id,planRevision:1};
  await f.store.accept(f.a,v);assert.equal(f.bodies.length,0);assert.deepEqual((await f.read()).documentPlan,legacy);assert.equal((await f.saved()).document_history[0].schemaVersion,'document-week-v1');
  // Emulate an already-saved v1 snapshot from before version metadata existed.
  await owner.query("UPDATE fitquest.training_plans SET document_history=jsonb_build_array((document_history->0)-'schemaVersion') WHERE user_id=$1",[f.a.userId]);
  const old=await f.saved(),review={...v,feedback:'Keep the prescribed work; concise rows without the weekly introduction.',retryAttempt:null as string|null};
  f.setMode('invalid');await f.service.review(f.a,review,async()=>true);assert.deepEqual(await f.saved(),old);assert.equal((await f.read()).schemaVersion,'document-week-v1');assert.equal(f.bodies.length,1);assert.deepEqual(JSON.parse(JSON.parse(f.bodies[0]!).input.split('\nSaved week:\n')[1]),legacy);
  review.retryAttempt=(await f.read()).jobs[0].attemptId;f.setMode('valid');await f.service.review(f.a,review,async()=>true);assert.equal(f.bodies.length,2);p=await f.read();assert.equal(p.schemaVersion,'document-week-v2');assert.equal(p.documentPlan,null);assert.deepEqual(p.acceptedDocument,old.document_history[0]);assert.equal((await f.store.read(f.a)).onboarded,true);assert(!JSON.stringify(p.documentOverview).includes('exercises'));
  await f.service.review(f.a,review,async()=>true);assert.equal(f.bodies.length,2);await f.store.accept(f.a,{...v,planRevision:2});assert.deepEqual((await f.read()).documentPlan,f.document);assert.equal((await f.saved()).document_history[1].schemaVersion,'document-week-v2');assert.deepEqual((await f.saved()).document_history[0],old.document_history[0]);
 });

}
