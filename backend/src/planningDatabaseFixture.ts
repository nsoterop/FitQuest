import { eligibleActivities } from './activityCatalog.js';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import { onboardingService } from './onboarding.js';
import { trainingFixture,fixtureOutline,fixtureDetail } from './planningFixture.js';
import type { OnboardingProvider,ProviderResult } from './onboardingProvider.js';
import { buildApp } from './app.js';
import type { ProfileStore } from './profileStore.js';

export async function verifyPlanningDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore) {
  const alice={userId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},bob={userId:'22222222-2222-4222-8222-222222222222',sessionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  // Reset only disposable fixture counters/allowance, never a live ledger.
  await owner.query('UPDATE fitquest.onboarding_request_limits SET requests=0,generations=0');
  await owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000000,evaluation_cap_micro=250000,spent_micro=0,reserved_micro=0,evaluation_spent_micro=0,evaluation_reserved_micro=0,app_enabled=true');
  const store=planningStore(pool),onboard=postgresOnboardingStore(pool);
  let calls=0,respond:(body:string)=>Promise<ProviderResult>=async body=>{const input=JSON.parse(JSON.parse(body).input);return{proposal:input.kind==='outline'?fixtureOutline(input.dates):fixtureDetail(input.outline,input.date),usage:{input:50,output:50,cached:0,cacheWrite:0}}};
  const provider:OnboardingProvider={mode:'test',model:'synthetic-planning',capMicro:7000000,prepare:()=>{throw Error('Planning must prepare its own strict schema')},cost:u=>u.input+u.output,call:async body=>{calls++;return respond(body)}};
  const service=planningService(store,provider,'test');
  const app=buildApp(false,{store:profiles,verifyAccount:async token=>token==='alice'?alice:token==='bob'?bob:null,planning:service});t.after(()=>app.close());
  const req=(method:'GET'|'POST'|'PUT',url:string,payload?:object,token='alice')=>app.inject({method,url,payload,headers:{authorization:`Bearer ${token}`}});
  const state=()=>service.read(alice);
  const latest=async()=>{const s=await state();return {s,p:s.plans.find(p=>p.summaryRevision===s.summary!.revision)!}};
  const generate=async(target:string,retryAttempt:string|null=null)=>{const {s,p}=await latest();return service.generate(alice,{summaryRevision:s.summary!.revision,planId:p.id,target,retryAttempt},async()=>true)};
  const next=async()=>{const s=await state();await store.edit(alice,s.summary!.revision,trainingFixture,'America/New_York');const n=await state();await store.ensurePlan(alice,n.summary!.revision);return latest()};
  await t.test('completion commits minimal summary and dated plan before cascaded chat deletion; failed COMMIT preserves both sides',async()=>{
    const old=await onboard.create(alice);await onboard.remove(alice,old.id);const a=await onboard.create(alice,'America/New_York');
    const context={...a.context,trainingSummary:trainingFixture};
    await owner.query('UPDATE fitquest.onboarding_context_revisions SET context=$3 WHERE user_id=$1 AND conversation_id=$2',[alice.userId,a.id,JSON.stringify(context)]);
    const before=await state();const api=onboardingService(onboard,undefined,'test');
    await owner.query("CREATE FUNCTION fitquest.fail_summary_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic summary COMMIT failure'; END $$; CREATE CONSTRAINT TRIGGER fail_summary_commit AFTER INSERT OR UPDATE ON fitquest.training_summaries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fitquest.fail_summary_commit()");
    const finish={kind:'confirm' as const,operationId:randomUUID(),expectedRevision:0,reviewedRevision:0,timeZone:'Pacific/Honolulu'};
    try {await assert.rejects(api.command(alice,a.id,finish,async()=>true));assert.equal((await onboard.read(alice,a.id)).state,'confirmed');assert.deepEqual(await state(),before)}finally{await owner.query('DROP TRIGGER fail_summary_commit ON fitquest.training_summaries; DROP FUNCTION fitquest.fail_summary_commit()')}
    const done=await api.command(alice,a.id,finish,async()=>true);assert.ok('summarySaved' in done&&done.summarySaved);assert.equal(calls,0);
    const {s,p}=await latest();assert.deepEqual(s.summary.document,trainingFixture);assert.equal(p.dates.length,7);assert.equal(p.timeZone,'Pacific/Honolulu');
    await assert.rejects(onboard.read(alice,a.id),{code:'not_found'});assert.equal(JSON.stringify(s).includes('transcript'),false);
    const repeated=await store.ensurePlan(alice,s.summary.revision);assert.equal(repeated.plans.length,s.plans.length);
  });
  await t.test('private routes, forced RLS and grants isolate planning and reject supplied ownership',async()=>{
    for(const path of ['/training','/training/plans','/training/generate']){const r=await app.inject({method:path==='/training'?'GET':'POST',url:path,payload:path==='/training'?undefined:{}});assert.equal(r.statusCode,401);assert.equal(r.headers['cache-control'],'no-store')}
    const aliceIds=(await state()).plans.map(p=>p.id);assert.equal((await req('GET','/training',undefined,'bob')).json().plans.some((p:any)=>aliceIds.includes(p.id)),false);
    const {s,p}=await latest();assert.equal((await req('POST','/training/generate',{summaryRevision:s.summary.revision,planId:p.id,target:'outline',retryAttempt:null},'bob')).statusCode,409);
    assert.equal((await req('PUT','/training/summary',{revision:s.summary.revision,document:trainingFixture,timeZone:'UTC',userId:bob.userId})).statusCode,400);
    const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[bob.userId]);assert.equal((await c.query('SELECT id FROM fitquest.training_plans WHERE id=$1',[p.id])).rowCount,0);await c.query('ROLLBACK')}finally{c.release()}
    for(const table of ['training_summaries','training_plans','training_days','training_generations']){
      assert.deepEqual((await owner.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",['fitquest.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
      for(const role of ['anon','authenticated','service_role'])assert.equal((await owner.query('SELECT has_table_privilege($1,$2,\'SELECT\') AS allowed',[role,'fitquest.'+table])).rows[0].allowed,false);
    }
  });
  await t.test('outline then first-day details persist across restarts, repeated submit and lost response; rest makes no call',async()=>{
    const {p}=await latest();await generate('outline');assert.equal(calls,1);await generate('outline');assert.equal(calls,1);
    await generate(p.dates[0]);assert.equal(calls,2);const saved=await state();
    assert.deepEqual(await planningStore(pool).read(alice),saved);await generate(p.dates[0]);assert.equal(calls,2);
    assert.equal(saved.plans.find(x=>x.id===p.id).days[0].detail.sessions.length,2);
    await generate(p.dates[1]);assert.equal(calls,2);assert.equal((await latest()).p.days.find((x:any)=>x.date===p.dates[1]).detail.sessions.length,0);
    await assert.rejects(generate('2099-01-01'),{code:'invalid_date'});
    await generate(p.dates[3]);assert.equal(calls,3);assert.equal((await latest()).p.days.length,3);
  });
  await t.test('oversized outline never publishes and explicit retry can recover without replacing summary or resetting costs',async()=>{
    const {s,p}=await next(),normal=respond,before=calls;
    const ids=eligibleActivities.slice(0,25).map(a=>String(a['Activity ID']));
    respond=async()=>({proposal:{coverage:[],days:p.dates.map((date:string,i:number)=>({date,sessions:i===0?[ids.slice(0,9),ids.slice(9,17),ids.slice(17)].map(activityIds=>({focus:'Mixed practice',activityIds})):[]}))},usage:{input:50,output:50,cached:0,cacheWrite:0}});
    const spent=Number((await owner.query('SELECT spent_micro FROM fitquest.ai_budget')).rows[0].spent_micro);
    await generate('outline');const failed=await latest();
    assert.equal(failed.p.outline,null);assert.equal(failed.p.days.length,0);assert.equal(failed.p.jobs[0].error,'outline_context_limit');assert.deepEqual(failed.s.summary,s.summary);
    assert.equal(Number((await owner.query('SELECT spent_micro FROM fitquest.ai_budget')).rows[0].spent_micro)-spent,100);
    await generate('outline');assert.equal(calls,before+1);
    respond=normal;await generate('outline',failed.p.jobs[0].attemptId);assert.equal(calls,before+2);assert.ok((await latest()).p.outline);assert.equal((await latest()).p.id,p.id);
    await generate(p.dates[0]);assert.equal((await latest()).p.days.length,1);
  });
  await t.test('summary correction preserves saved days and blocks old/stale generation, while new outline uses the correction',async()=>{
    const {s,p}=await latest();const saved=structuredClone(p.days);const updated=trainingFixture.map(f=>f.category==='availability'?{...f,text:'Only one short session this week.'}:f);
    await store.edit(alice,s.summary.revision,updated,'Pacific/Honolulu');
    await assert.rejects(store.edit(alice,s.summary.revision,updated,'UTC'),{code:'summary_changed'});
    const n=await state();assert.deepEqual(n.plans.find(x=>x.id===p.id).days,saved);
    await assert.rejects(service.generate(alice,{summaryRevision:n.summary.revision,planId:p.id,target:p.dates[4],retryAttempt:null},async()=>true),{code:'summary_changed'});
    await store.ensurePlan(alice,n.summary.revision);const work=await store.claim(alice,{summaryRevision:n.summary.revision,planId:(await latest()).p.id,target:'outline',retryAttempt:null},provider);assert.ok(work);
    assert.equal(work.input.summary.find(f=>f.category==='availability')!.text,updated[1]!.text);
    await store.edit(alice,n.summary.revision,trainingFixture,'UTC');await store.settle(alice,work.attempt,100);await store.finish(alice,work,fixtureOutline(work.input.dates));
    const stale=(await state()).plans.find(x=>x.id===work.planId);assert.equal(stale.outline,null);assert.equal(stale.jobs[0].error,'summary_changed');
  });
  await t.test('failed generation requires explicit retry of exact prior attempt; concurrent and expired work cannot double-publish',async()=>{
    const {s,p}=await next(),before=calls;const normal=respond;respond=async()=>({failure:'provider_error'});
    await generate('outline');assert.equal(calls,before+1);let a=await latest();const failed=a.p.jobs[0];
    await generate('outline');assert.equal(calls,before+1);assert.equal(a.s.summary.revision,s.summary.revision);
    respond=normal;await generate('outline',failed.attemptId);assert.equal(calls,before+2);await generate('outline',failed.attemptId);assert.equal(calls,before+2);
    const claim={summaryRevision:s.summary.revision,planId:p.id,target:p.dates[0],retryAttempt:null};
    const [one,two]=await Promise.all([store.claim(alice,claim,provider),planningStore(pool).claim(alice,claim,provider)]);const work=one??two;assert.ok(work);assert.equal(Number(!!one)+Number(!!two),1);
    await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1 AND plan_id=$2 AND target=$3",[alice.userId,p.id,p.dates[0]]);
    a=await latest();assert.equal(a.p.jobs.find((j:any)=>j.target===p.dates[0]).status,'failed');
    await store.finish(alice,work,fixtureDetail(work.input.outline!,p.dates[0]));assert.equal((await latest()).p.days.length,0);
    const charged=(await owner.query('SELECT state,reserved_micro FROM fitquest.onboarding_attempts WHERE user_id=$1 AND id=$2',[alice.userId,work.attempt])).rows[0];assert.equal(charged.state,'uncertain');assert.ok(Number(charged.reserved_micro)>0);
    await generate(p.dates[0],work.attempt);await store.settle(alice,work.attempt,50);assert.equal((await latest()).p.days.length,1);
  });
  await t.test('missing config, age, budget exhaustion and invalid output fail closed; summary and accounting survive',async()=>{
    const {s,p}=await next(),request={summaryRevision:s.summary.revision,planId:p.id,target:'outline',retryAttempt:null};
    const before=calls;await planningService(store,undefined,'test').generate(alice,request,async()=>true);assert.equal(calls,before);assert.equal((await latest()).p.jobs[0].error,'ai_disabled');
    let job=(await latest()).p.jobs[0];await owner.query('UPDATE fitquest.ai_budget SET cap_micro=spent_micro+reserved_micro');
    await service.generate(alice,{...request,retryAttempt:job.attemptId},async()=>true);assert.equal(calls,before);assert.equal((await latest()).p.jobs[0].error,'budget_exhausted');
    await owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000000');job=(await latest()).p.jobs[0];
    const normal=respond;respond=async()=>({proposal:{days:[],coverage:[]},usage:{input:50,output:50,cached:0,cacheWrite:0}});
    await service.generate(alice,{...request,retryAttempt:job.attemptId},async()=>true);respond=normal;assert.equal((await latest()).p.jobs[0].error,'invalid_plan');assert.equal((await latest()).p.outline,null);assert.equal((await latest()).s.summary.revision,s.summary.revision);
    const adult=(await profiles.read(alice))!;await profiles.save(alice,{...adult,age:17});
    job=(await latest()).p.jobs[0];const beforeAge=calls;
    await service.generate(alice,{...request,retryAttempt:job.attemptId},async()=>true);assert.equal(calls,beforeAge);assert.equal((await latest()).p.jobs[0].error,'adults_only');await profiles.save(alice,adult);
    const budget=(await owner.query('SELECT cap_micro,evaluation_cap_micro FROM fitquest.ai_budget')).rows[0];assert.deepEqual(budget,{cap_micro:'7000000',evaluation_cap_micro:'250000'});
  });
  await t.test('sign-out and changed profile prevent publishing while measured usage still settles',async()=>{
    let {s,p}=await next();const before=(await owner.query('SELECT spent_micro FROM fitquest.ai_budget')).rows[0].spent_micro;
    await assert.rejects(service.generate(alice,{summaryRevision:s.summary.revision,planId:p.id,target:'outline',retryAttempt:null},async()=>false),{code:'session_ended'});
    assert.equal((await latest()).p.outline,null);assert.equal(Number((await owner.query('SELECT spent_micro FROM fitquest.ai_budget')).rows[0].spent_micro)-Number(before),100);
    ({s,p}=await next());const work=await store.claim(alice,{summaryRevision:s.summary.revision,planId:p.id,target:'outline',retryAttempt:null},provider);assert.ok(work);
    const old=(await profiles.read(alice))!;await profiles.save(alice,{...old,weight:{value:old.weight.value+1,unit:'lb'}});
    await store.settle(alice,work.attempt,100);await store.finish(alice,work,fixtureOutline(work.input.dates));assert.equal((await latest()).p.outline,null);assert.equal((await latest()).p.jobs[0].error,'summary_changed');await profiles.save(alice,old);
  });
}
