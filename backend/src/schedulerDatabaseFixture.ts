import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {TestContext} from 'node:test';
import type {Pool} from 'pg';
import type {ProfileStore} from './profileStore.js';
import {planningStore} from './planningStore.js';
import {planningService} from './planning.js';
import {planDates} from './trainingSummary.js';
import {intakeSummary} from './fixedIntake.js';
import {journalDocumentFixture} from './documentPlanFixture.js';
import {planningConsentVersion,planningConsentScope} from './planningConsent.js';
import {historyConsentVersion,historyConsentScope} from './progressConsent.js';
import {weeklyScheduleVersion} from './weeklyScheduleContract.js';
import {scheduledDates} from './weeklySchedule.js';
import {trainingTestResetStatements} from './trainingTestReset.js';
import type {OnboardingProvider} from './onboardingProvider.js';
export async function verifySchedulerDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
 let now=new Date('2026-10-10T16:00:00Z');const clock=()=>now,store=planningStore(pool,false,clock),bg=planningStore(pool,true,clock);
 const dates=planDates('America/New_York',now),permission={version:weeklyScheduleVersion,enabled:true,expectedRevision:0};
 async function fresh(){now=new Date('2026-10-10T16:00:00Z');const a={userId:randomUUID(),sessionId:randomUUID()};await owner.query('INSERT INTO auth.users VALUES($1)',[a.userId]);await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[a.sessionId,a.userId]);await profiles.save(a,{firstName:'Synthetic',lastName:'Scheduler',age:30,height:{value:68,unit:'in'},weight:{value:155,unit:'lb'},gender:'Unspecified'});await owner.query("INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'America/New_York')",[a.userId,JSON.stringify(intakeSummary({version:1,answers:['Strength','Walking','Dumbbells','Flexible','None']}))]);const p=(await store.ensurePlan(a,1)).plans[0];await owner.query('UPDATE fitquest.training_plans SET dates=$2,document_plan=$3,review_revision=1 WHERE user_id=$1',[a.userId,JSON.stringify(dates),JSON.stringify(journalDocumentFixture(dates))]);await store.accept(a,{planId:p.id,summaryRevision:1,planRevision:1});await store.consent(a,{version:planningConsentVersion,scope:planningConsentScope,granted:true,expectedRevision:0});await store.historyConsent(a,{version:historyConsentVersion,scope:historyConsentScope,granted:true,expectedRevision:0});return a}
 function mock(failure=false){const bodies:string[]=[];const p:OnboardingProvider={mode:'test',model:'gpt-6.1-sol',capMicro:7000000,prepare(){throw Error('unexpected extra request')},cost:u=>u.input+u.output?10:0,call:async b=>{bodies.push(b);return failure?{failure:'provider_error'}:{proposal:journalDocumentFixture(scheduledDates('America/New_York','2026-10-10T16:00:00Z',now)!),usage:{input:10,output:10,cached:0,cacheWrite:0}}}};return {bodies,p,service:planningService(bg,p,'test')}}
 const due=()=>{now=new Date('2026-10-12T01:00:00Z')};
 await t.test('explicit enrollment, closed-app dispatch without a session, concurrent dedupe and free date-correct acceptance',async()=>{
  const a=await fresh(),m=mock();assert.equal((await store.read(a)).schedule,null);await m.service.scheduled(a);assert.equal(m.bodies.length,0);await store.schedule(a,permission);await m.service.scheduled(a);assert.equal(m.bodies.length,0);due();await owner.query('DELETE FROM auth.sessions WHERE id=$1',[a.sessionId]);
  await Promise.all([m.service.scheduled(a),m.service.scheduled(a)]);assert.equal(m.bodies.length,1);let s=await bg.read(a);const next=s.plans.find(p=>p.weekStart==='2026-10-12')!;assert(next.completeReady);assert.equal(next.documentPlan,null);assert.equal(next.reviewState,'draft');assert.equal((await bg.nutrition(a,'2026-10-12')).target,null);await m.service.scheduled(a);assert.equal(m.bodies.length,1);
  await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[a.sessionId,a.userId]);const old=await store.nutrition(a,'2026-10-11');await store.accept(a,{planId:next.id,summaryRevision:1,planRevision:1});assert.deepEqual(await store.nutrition(a,'2026-10-11'),old);assert.equal((await store.nutrition(a,'2026-10-12')).target!.planId,next.id);assert.equal(m.bodies.length,1);
  const q=JSON.parse(m.bodies[0]!);assert.equal(q.model,'gpt-6.1-sol');assert.deepEqual(q.reasoning,{effort:'low'});assert.equal(q.text.format.name,'document_week_v4');assert(q.input.includes('saved profile; measurement date unknown'));
 });
 await t.test('pause and history withdrawal fence claimed work; no auto enrollment, cross-account controls or session bypass',async()=>{
  const a=await fresh(),m=mock();await store.schedule(a,permission);due();const w=await bg.claimScheduled(a,m.p);assert(w);await store.schedule(a,{...permission,enabled:false,expectedRevision:1});let called=false;assert.equal(await bg.canDispatch(a,w,()=>{called=true}),false);assert(!called);await bg.settle(a,w.attempt,0);await bg.finish(a,w,undefined,'planning_consent_required');await m.service.scheduled(a);assert.equal(m.bodies.length,0);
  await assert.rejects(store.claimScheduled(a,m.p),{code:'not_allowed'});await assert.rejects(store.schedule({...a,sessionId:randomUUID()},{...permission,expectedRevision:2}),{code:'session_ended'});
  const b=await fresh();await store.schedule(b,permission);due();const wb=await bg.claimScheduled(b,m.p);assert(wb);await store.historyConsent(b,{version:historyConsentVersion,scope:historyConsentScope,granted:false,expectedRevision:1});assert.equal(await bg.canDispatch(b,wb),false);await bg.settle(b,wb.attempt,0);await bg.finish(b,wb,undefined,'planning_consent_required');
 });
 await t.test('restart recovers only provably undispatched reservations and never automatically retries uncertain or failed calls',async()=>{
  const a=await fresh(),m=mock();await store.schedule(a,permission);due();const abandoned=await bg.claimScheduled(a,m.p);assert(abandoned);await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1",[a.userId]);await m.service.scheduled(a);assert.equal(m.bodies.length,1);assert.equal((await owner.query('SELECT actual_micro FROM fitquest.onboarding_attempts WHERE id=$1',[abandoned.attempt])).rows[0].actual_micro,'0');
  const b=await fresh(),uncertain=mock();await store.schedule(b,permission);due();const begun=await bg.claimScheduled(b,uncertain.p);assert(begun);assert(await bg.canDispatch(b,begun));await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1",[b.userId]);await uncertain.service.scheduled(b);await uncertain.service.scheduled(b);assert.equal(uncertain.bodies.length,0);const job=(await bg.read(b)).plans.find(p=>p.weekStart)!.jobs[0];assert.equal(job.error,'interrupted');
  const c=await fresh(),failed=mock(true);await store.schedule(c,permission);due();await failed.service.scheduled(c);await failed.service.scheduled(c);assert.equal(failed.bodies.length,1);
 });
 await t.test('downtime skips obsolete backlog, late history does not buy another plan, and a manual target week wins',async()=>{
  const a=await fresh(),m=mock();await store.schedule(a,permission);now=new Date('2026-10-27T16:00:00Z');await m.service.scheduled(a);let s=await bg.read(a);assert.deepEqual(s.plans.filter(p=>p.weekStart).map(p=>p.weekStart),['2026-10-26']);await m.service.scheduled(a);assert.equal(m.bodies.length,1);
  const b=await fresh(),manual=mock();await store.schedule(b,permission);const saved=await store.ensureNextWeek(b,{operationId:randomUUID(),changes:'Manual changes'},now);due();await manual.service.scheduled(b);assert.equal(manual.bodies.length,0);assert.equal((await store.read(b)).plans.find(p=>p.weekStart)!.id,saved.nextPlanId);
 });
 await t.test('caps block scheduled calls, private RLS holds, and training reset preserves enrollment without regenerating',async()=>{
  const a=await fresh(),m=mock();await store.schedule(a,permission);const saved=(await store.read(a)).schedule;await owner.query('UPDATE fitquest.ai_budget SET app_enabled=false');due();await m.service.scheduled(a);assert.equal(m.bodies.length,0);await owner.query('UPDATE fitquest.ai_budget SET app_enabled=true');await m.service.scheduled(a);assert.equal(m.bodies.length,0);
  await owner.query('BEGIN');await owner.query('SET CONSTRAINTS ALL DEFERRED');for(const sql of trainingTestResetStatements)await owner.query(sql,[a.userId]);await owner.query('COMMIT');const after=(await bg.read(a)).schedule;assert.equal(after.enabled,saved.enabled);assert.equal(after.revision,saved.revision);await m.service.scheduled(a);assert.equal(m.bodies.length,0);
  for(const role of ['anon','authenticated','service_role']){assert.equal((await owner.query("SELECT has_table_privilege($1,'fitquest.weekly_schedules','SELECT') ok",[role])).rows[0].ok,false);assert.equal((await owner.query("SELECT has_function_privilege($1,'fitquest.weekly_schedule_accounts(uuid)','EXECUTE') ok",[role])).rows[0].ok,false)}
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('fitquest.user_id',$1,true)",[a.userId]);assert.equal((await client.query('SELECT count(*)::int n FROM fitquest.weekly_schedules')).rows[0].n,1);await client.query('ROLLBACK')}finally{client.release()}
 });
}
