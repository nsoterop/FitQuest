import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from './profileStore.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { onboardingService } from './onboarding.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import { completeFixture,syntheticAnswers } from './completePlanFixture.js';
import { encodeCompleteWire } from './completePlanWire.js';
import { planOverview } from './completePlanContract.js';
export async function verifyCompleteDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
 const a={userId:randomUUID(),sessionId:randomUUID()},b={userId:randomUUID(),sessionId:randomUUID()};
 for(const x of [a,b]){await owner.query('INSERT INTO auth.users(id) VALUES($1)',[x.userId]);await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[x.sessionId,x.userId]);await profiles.save(x,{firstName:'Synthetic',lastName:'Complete',age:30,height:{value:68,unit:'in'},weight:{value:155,unit:'lb'},gender:'Unspecified'});}
 let calls=0,mode='valid',changed=false;let savedBody='';
 const provider:OnboardingProvider={mode:'test',model:'mock-complete',capMicro:7000000,prepare(){throw Error('No intake calls')},cost:()=>10,call:async body=>{calls++;savedBody=body;const req=JSON.parse(body);assert.equal(req.text.format.name,'complete_week');const start=/Monday (\d{4}-\d{2}-\d{2}) through Sunday/.exec(req.input)![1]!;const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(start+'T12:00Z')+i*86400000).toISOString().slice(0,10));
  const plan=completeFixture(dates);if(changed)plan.days[1]!.sessions[0]!.durationMinutes={min:15,max:20};
  return {...(['refused','incomplete','provider_error'].includes(mode)?{failure:mode as 'refused'}:{proposal:mode==='unavailable'?{result:{kind:'unavailable',reason:'Synthetic catalog gap prevents the requested update.'}}:mode==='invalid'?{result:{kind:'plan'}}:encodeCompleteWire({result:{kind:'plan',plan}})}),usage:{input:10,output:10,cached:0,cacheWrite:0}};
 }};
 const store=planningStore(pool),service=planningService(store,provider,'test'),intake=onboardingService(postgresOnboardingStore(pool),provider,'test');let plan:any;
 const budget=async()=>(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
 const saved=async()=>(await owner.query('SELECT complete_plan,review_revision,review_state,accepted_at FROM fitquest.training_plans WHERE user_id=$1',[a.userId])).rows[0];
 await t.test('new five-answer completion remains free and versions a pristine complete-week plan',async()=>{
  const before=await budget();let c=await intake.create(a,'America/New_York',1);
  for(const [index,value]of syntheticAnswers.entries()){const next=await intake.command(a,c.id,{kind:'edit',topic:`intake:${index}`,itemId:null,value,operationId:randomUUID(),expectedRevision:c.revision},async()=>true);assert(!('deleted'in next));c=next;}
  await intake.command(a,c.id,{kind:'confirm',reviewedRevision:c.revision,expectedRevision:c.revision,operationId:randomUUID()},async()=>true);
  assert.equal(calls,0);assert.deepEqual(await budget(),before);plan=(await store.read(a)).plans[0];assert.equal(plan.schemaVersion,'complete-week-v1');assert.equal(plan.outlineFirst,false);assert.equal(plan.completeReady,false);assert.equal(plan.dates.length,7);
 });
 await t.test('refusal, incomplete, unavailable and invalid initial output are distinct; only explicit retries dispatch',async()=>{
  const r={summaryRevision:plan.summaryRevision,planId:plan.id,target:'week',retryAttempt:null as string|null};
  for(const kind of ['refused','incomplete','unavailable','invalid']){mode=kind;const n=calls;await service.generate(a,r,async()=>true);plan=(await store.read(a)).plans[0];assert.equal(calls,n+1);assert.equal(plan.completeReady,false);assert.equal((await saved()).complete_plan,null);assert.equal(plan.jobs[0].error,kind==='unavailable'?'plan_unavailable':kind==='invalid'?'invalid_plan:week_schema':kind);await service.generate(a,r,async()=>true);assert.equal(calls,n+1);r.retryAttempt=plan.jobs[0].attemptId;}
  mode='valid';const n=calls;await Promise.all([service.generate(a,r,async()=>true),service.generate(a,r,async()=>true)]);plan=(await store.read(a)).plans[0];assert.equal(calls,n+1);assert.equal(plan.completeReady,true);assert.equal(plan.completePlan,null);assert.deepEqual(plan.activityNames,{});assert.equal(plan.reviewState,'draft');assert.equal(plan.planRevision,1);assert(!JSON.stringify(plan).includes('activityId'));assert.deepEqual(plan.overview,planOverview((await saved()).complete_plan));assert.equal((await saved()).complete_plan.days.length,7);assert(syntheticAnswers.every(answer=>JSON.parse(savedBody).input.includes(answer)));
  await assert.rejects(service.generate(b,r,async()=>true),{code:'summary_required'});assert.equal((await store.read(b)).plans.length,0);
 });
 await t.test('acceptance is concurrent/idempotent, revision checked, free and reveals the exact saved object',async()=>{
  const r={planId:plan.id,summaryRevision:plan.summaryRevision,planRevision:plan.planRevision};const before=await budget(),n=calls,canonical=(await saved()).complete_plan;
  await assert.rejects(store.accept(b,r),{code:'not_found'});await assert.rejects(store.accept(a,{...r,planRevision:0}),{code:'plan_changed'});
  await Promise.all([store.accept(a,r),store.accept(a,r)]);plan=(await store.read(a)).plans[0];assert.equal(plan.reviewState,'accepted');assert.deepEqual(plan.completePlan,canonical);assert(plan.acceptedAt);const stamp=plan.acceptedAt;
  await store.accept(a,r);plan=(await store.read(a)).plans[0];assert.deepEqual(plan.acceptedAt,stamp);assert.equal(calls,n);assert.deepEqual(await budget(),before);
  await assert.rejects(service.generate(a,{...r,target:'week',confirmOutline:true,retryAttempt:null},async()=>true),{code:'review_unavailable'});assert.equal(calls,n);
 });
 await t.test('failed complete revisions preserve usable work; successful revisions hide details until free acceptance',async()=>{
  const r={planId:plan.id,summaryRevision:plan.summaryRevision,planRevision:plan.planRevision,feedback:'Make Tuesday shorter. Keep Monday unchanged.',retryAttempt:null as string|null};const old=await saved();mode='invalid';await service.review(a,r,async()=>true);assert.deepEqual(await saved(),old);plan=(await store.read(a)).plans[0];const job=plan.jobs.find((j:any)=>j.target==='review:1');r.retryAttempt=job.attemptId;
  mode='unavailable';await service.review(a,r,async()=>true);assert.deepEqual(await saved(),old);plan=(await store.read(a)).plans[0];r.retryAttempt=plan.jobs.find((j:any)=>j.target==='review:1').attemptId;
  mode='valid';changed=true;const n=calls;await Promise.all([service.review(a,r,async()=>true),service.review(a,r,async()=>true)]);assert.equal(calls,n+1);plan=(await store.read(a)).plans[0];assert.equal(plan.planRevision,2);assert.equal(plan.reviewState,'draft');assert.equal(plan.completePlan,null);assert.equal(plan.acceptedAt,null);assert.deepEqual(plan.overview.days[0],planOverview(old.complete_plan).days[0]);
  await service.review(a,r,async()=>true);assert.equal(calls,n+1);await assert.rejects(store.accept(a,{...r,planRevision:1}),{code:'plan_changed'});
  const before=await budget();await store.accept(a,{...r,planRevision:2});await store.read(a);assert.deepEqual(await budget(),before);assert.equal(calls,n+1);
 });
 await t.test('deferred publication failure rolls back the complete object, revision and generation receipt together',async()=>{
  const old=await saved();await owner.query(`CREATE FUNCTION fitquest.fail_complete_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic commit failure'; END $$; CREATE CONSTRAINT TRIGGER fail_complete_test AFTER UPDATE ON fitquest.training_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.user_id='${a.userId}'::uuid AND NEW.review_revision>2) EXECUTE FUNCTION fitquest.fail_complete_test();`);
  try{await assert.rejects(service.review(a,{planId:plan.id,summaryRevision:plan.summaryRevision,planRevision:2,feedback:'Keep the entire week unchanged.',retryAttempt:null},async()=>true));assert.deepEqual(await saved(),old);}finally{await owner.query('DROP TRIGGER fail_complete_test ON fitquest.training_plans; DROP FUNCTION fitquest.fail_complete_test()');}
  const attempts=(await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE user_id=$1',[a.userId])).rows;assert(attempts.length>0&&attempts.every(r=>r.state==='settled'));
 });
}
