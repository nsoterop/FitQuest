import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {TestContext} from 'node:test';
import type {Pool} from 'pg';
import type {ProfileStore} from './profileStore.js';
import type {OnboardingProvider} from './onboardingProvider.js';
import {planningStore} from './planningStore.js';
import {planningService} from './planning.js';
import {intakeSummary} from './fixedIntake.js';
import {completeOutlineFixture,completeFixture,syntheticAnswers} from './completePlanFixture.js';
import {encodeCompleteWire} from './completePlanWire.js';

export async function verifyTwoStageDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
 async function fresh(){
  const a={userId:randomUUID(),sessionId:randomUUID()};
  await owner.query('INSERT INTO auth.users(id) VALUES($1)',[a.userId]);await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[a.sessionId,a.userId]);
  await profiles.save(a,{firstName:'Synthetic',lastName:'Stages',age:30,height:{value:68,unit:'in'},weight:{value:155,unit:'lb'},gender:'Unspecified'});
  await owner.query("INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'America/New_York')",[a.userId,JSON.stringify(intakeSummary({version:1,answers:syntheticAnswers}))]);
  const store=planningStore(pool),plan=(await store.ensurePlan(a,1)).plans[0]!;
  const r={summaryRevision:1,planId:plan.id,target:'week',retryAttempt:null as string|null};
  const canonical=completeFixture(plan.dates),outline=completeOutlineFixture(canonical),bodies:string[]=[];
  let failOutline=false,failWorkouts=false,unknownCost=false;
  const provider:OnboardingProvider={mode:'test',model:'gpt-6-luna',capMicro:7000000,prepare(){throw Error('No intake')},cost:()=>10,call:async body=>{
   bodies.push(body);const req=JSON.parse(body);assert.equal(req.reasoning.effort,'low');
   const usage=unknownCost?undefined:{input:10,output:10,cached:0,cacheWrite:0};
   if(!req.text)return failOutline?{failure:'refused',usage}:{rawText:outline,usage};
   assert(req.input.includes(outline));return failWorkouts?{failure:'provider_error',usage}:{proposal:encodeCompleteWire({result:{kind:'plan',plan:canonical}}),usage};
  }};
  const job=async()=>(await owner.query("SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target='week'",[a.userId,plan.id])).rows[0];
  const attempts=async()=>(await owner.query('SELECT * FROM fitquest.onboarding_attempts WHERE user_id=$1 ORDER BY created_at,id',[a.userId])).rows;
  return {a,r,store,plan,canonical,outline,bodies,provider,job,attempts,setFailure:(stage:string,uncertain=false)=>{failOutline=stage==='outline';failWorkouts=stage==='workouts';unknownCost=uncertain;}};
 }
 await t.test('two stages reserve/settle independently; failed outline never dispatches workouts; successful retry dispatches exactly two',async()=>{
  const f=await fresh();f.setFailure('outline');const service=planningService(f.store,f.provider,'test');await service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,1);assert.equal((await f.job()).complete_stage,'outline');assert.equal((await f.attempts())[0].state,'settled');
  await service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,1);
  f.r.retryAttempt=(await f.job()).attempt_id;f.setFailure('');await Promise.all([service.generate(f.a,f.r,async()=>true),service.generate(f.a,f.r,async()=>true)]);assert.equal(f.bodies.length,3);
  const attempts=await f.attempts();assert.equal(attempts.length,3);assert(attempts.every(a=>a.state==='settled'&&Number(a.actual_micro)===10));assert.equal(new Set(attempts.map(a=>a.id)).size,3);
  const j=await f.job();assert.equal(j.raw_response,f.outline);assert.notEqual(j.outline_attempt_id,j.attempt_id);assert.equal(j.complete_stage,'workouts');
  let view=(await f.store.read(f.a)).plans[0]!;assert.equal(view.completeReady,true);assert.equal(view.completePlan,null);assert(!JSON.stringify(view).includes(f.outline));assert(!('rawResponse' in view.jobs[0]));
  const version={summaryRevision:1,planId:f.plan.id,planRevision:1};await f.store.accept(f.a,version);view=(await f.store.read(f.a)).plans[0]!;assert.deepEqual(view.completePlan,f.canonical);await f.store.accept(f.a,version);assert.equal(f.bodies.length,3);assert.deepEqual(await f.attempts(),attempts);
 });
 await t.test('malformed first response fails before any workout dispatch',async()=>{
  const f=await fresh();f.provider.call=async body=>{f.bodies.push(body);return{rawText:'Synthetic malformed list without dates or sessions',usage:{input:10,output:10,cached:0,cacheWrite:0}}};
  await planningService(f.store,f.provider,'test').generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,1);const j=await f.job();assert.equal(j.complete_stage,'outline');assert.equal(j.error_code,'outline_conversion');assert.equal((await f.attempts())[0].state,'settled');assert.equal((await f.store.read(f.a)).plans[0]!.completeReady,false);
 });
 await t.test('workout failure and process restart reuse exact saved outline on explicit retry, with no automatic dispatch',async()=>{
  const f=await fresh();f.setFailure('workouts',true);await planningService(f.store,f.provider,'test').generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,2);const j=await f.job();assert.equal(j.complete_stage,'workouts');assert.equal(j.raw_response,f.outline);assert((await f.attempts()).every(a=>a.state==='uncertain'));
  const restarted=planningStore(pool),service=planningService(restarted,f.provider,'test');await service.read(f.a);await service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,2);
  f.setFailure('');f.r.retryAttempt=j.attempt_id;await service.generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,3);assert.equal(f.bodies.filter(b=>!JSON.parse(b).text).length,1);assert((await f.attempts()).filter(a=>a.id!==j.attempt_id&&a.id!==j.outline_attempt_id).every(a=>a.state==='settled'));assert.equal((await restarted.read(f.a)).plans[0]!.completeReady,true);
 });
 await t.test('independent stage-two headroom failure preserves first response for a later explicit workout-only retry',async()=>{
  const f=await fresh(),original=f.provider.call;
  f.provider.call=async(...args)=>{const r=await original(...args);f.provider.capMicro=1;return r};
  await planningService(f.store,f.provider,'test').generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,1);const j=await f.job();assert.equal(j.error_code,'budget_exhausted');assert.equal(j.complete_stage,'workouts');assert.equal(j.raw_response,f.outline);assert.equal((await f.attempts()).filter(a=>a.state==='not_dispatched').length,1);
  f.provider.capMicro=7000000;f.provider.call=original;f.r.retryAttempt=j.attempt_id;await planningService(f.store,f.provider,'test').generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,2);assert.equal(f.bodies.filter(b=>!JSON.parse(b).text).length,1);
 });
 await t.test('crash after outline checkpoint keeps stage-two reservation uncertain and resumes only workouts; stale first-stage completion cannot advance',async()=>{
  const f=await fresh(),first=await f.store.claim(f.a,f.r,f.provider);assert(first);assert.equal(first.stage,'outline');await f.store.settle(f.a,first.attempt,10);
  const second=await f.store.advanceComplete(f.a,first,f.outline,f.provider);assert(second);assert.equal(second.stage,'workouts');assert.equal(await f.store.advanceComplete(f.a,first,f.outline,f.provider),undefined);
  await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1",[f.a.userId]);
  const restarted=planningStore(pool);await restarted.read(f.a);assert.equal((await f.job()).error_code,'interrupted');assert.equal((await f.attempts()).find(a=>a.id===second.attempt).state,'uncertain');
  f.r.retryAttempt=second.attempt;await planningService(restarted,f.provider,'test').generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,1);assert(JSON.parse(f.bodies[0]!).text);assert.equal((await restarted.read(f.a)).plans[0]!.completeReady,true);
  // A late response settles its original attempt only, never the new attempt or content.
  const current=await f.job();await f.store.settle(f.a,second.attempt,7);await f.store.finish(f.a,second,{result:{kind:'plan',plan:f.canonical}});assert.deepEqual(await f.job(),current);
 });
 await t.test('stage checkpoint stays account-private and changed profile requires a new outline; stage-one signout never dispatches stage two',async()=>{
  const f=await fresh(),other=await fresh();f.setFailure('workouts');await planningService(f.store,f.provider,'test').generate(f.a,f.r,async()=>true);const j=await f.job();
  await assert.rejects(other.store.claim(other.a,f.r,other.provider),{code:'not_found'});
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[other.a.userId]);assert.equal((await c.query('SELECT raw_response FROM fitquest.training_generations WHERE user_id=$1',[f.a.userId])).rowCount,0);await c.query('ROLLBACK')}finally{c.release()}
  await owner.query("UPDATE fitquest.profiles SET updated_at=updated_at+interval '1 second' WHERE user_id=$1",[f.a.userId]);f.r.retryAttempt=j.attempt_id;f.setFailure('');await planningService(f.store,f.provider,'test').generate(f.a,f.r,async()=>true);assert.equal(f.bodies.length,4);assert.equal(f.bodies.filter(b=>!JSON.parse(b).text).length,2);
  await assert.rejects(planningService(other.store,other.provider,'test').generate(other.a,other.r,async()=>false),{code:'session_ended'});assert.equal(other.bodies.length,1);assert.equal((await other.attempts())[0].state,'settled');
 });
}
