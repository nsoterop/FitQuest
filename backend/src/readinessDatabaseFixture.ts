import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { postgresOnboardingStore,type Conversation } from './onboardingStore.js';
import { onboardingService } from './onboarding.js';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { serializeInput,type OnboardingProvider,type ProviderResult } from './onboardingProvider.js';
import { trainingFixture,fixtureOutline,fixtureDetail } from './planningFixture.js';
import type { ModelProposal,RecoveryRequest } from './onboardingDomain.js';
import { buildApp } from './app.js';
import type { ProfileStore } from './profileStore.js';

export async function verifyReadinessDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore) {
  const alice={userId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},bob={userId:'22222222-2222-4222-8222-222222222222',sessionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  // Disposable test database only, never a hosted or evaluation ledger.
  await owner.query('UPDATE fitquest.onboarding_request_limits SET requests=0,generations=0');
  await owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000000,evaluation_cap_micro=250000,spent_micro=0,reserved_micro=0,evaluation_spent_micro=0,evaluation_reserved_micro=0,app_enabled=true');
  const store=postgresOnboardingStore(pool),plans=planningStore(pool);
  const question={question:'Does the shoulder discomfort occur only when serving overhead?',reason:'This determines which movements to avoid.'};
  const answer='Only when serving overhead. Walking and ordinary daily movements are comfortable.';
  const summary=trainingFixture.map(f=>({...f,origin:'model_inference' as const,text:f.category==='goals'?'Recreational tennis, first pull-up and walking endurance.':f.category==='limitations'?'Mild shoulder discomfort serving; provoking movements need clarification.':f.text}));
  const resolved=summary.map(f=>f.category==='limitations'?{...f,text:answer,origin:'user_report' as const}:f);
  const recap:ModelProposal={trainingSummary:resolved,planningCheck:{status:'ready',question:null,reason:null},reply:'Tennis, a first pull-up and walking; three flexible short days with floor, wall and a walking path. Mild discomfort only when serving overhead; walking and daily movements are comfortable.',additions:[],readiness:'ready_with_limits',limitations:['Not medical clearance.'],nextQuestion:{topic:'Onboarding recap',text:'Ready?',decision:'Necessary context is now preserved.'}};
  let calls=0,respond:(input:any)=>Promise<ProviderResult>;
  const usage={input:50,output:50,cached:0,cacheWrite:0};
  const provider:OnboardingProvider={mode:'test',model:'synthetic-readiness',capMicro:7000000,cost:()=>100,prepare:input=>({body:serializeInput(input,'synthetic-readiness'),reserveMicro:1000}),call:async body=>{calls++;return respond(JSON.parse(JSON.parse(body).input))}};
  const service=onboardingService(store,provider,'test'),planning=planningService(plans,provider,'test');
  const app=buildApp(false,{store:profiles,verifyAccount:async token=>token==='alice'?alice:token==='bob'?bob:null,onboarding:service,planning});t.after(()=>app.close());
  const clean=async()=>{const old=await store.create(alice);await store.remove(alice,old.id);return store.create(alice)};
  const latest=async()=>{const s=await plans.read(alice);return {s,p:s.plans.find(p=>p.summaryRevision===s.summary.revision)!}};
  const generate=async(target:string)=>{const {s,p}=await latest();return planning.generate(alice,{summaryRevision:s.summary.revision,planId:p.id,target,retryAttempt:null},async()=>true)};
  const send=async(a:Conversation,text:string)=>service.command(alice,a.id,{kind:'message',operationId:randomUUID(),expectedRevision:a.revision,text},async()=>true);
  const spent=async()=>Number((await owner.query('SELECT spent_micro FROM fitquest.ai_budget')).rows[0].spent_micro);
  let oldDays:any,oldPlan:string;
  await t.test('mixed goals and mild restriction: contradictory recap becomes one essential question, answer persists through finish and usable planning',async()=>{
    let a=await clean();const before=calls;
    respond=async input=>{
      assert.ok(input.sources.m1.includes('tennis'));
      return {proposal:{...recap,trainingSummary:summary,planningCheck:{status:'question',...question}},usage};
    };
    const initial=await send(a,'I want tennis, a first pull-up and walking endurance. Three flexible 25-minute days; a floor, wall and walking path. I walk twice a week. Mild shoulder discomfort.');assert.ok('turns' in initial);a=initial;
    assert.match(a.turns.at(-1)!.reply!,/Does the shoulder/);assert.doesNotMatch(a.turns.at(-1)!.reply!,/Looks good/);
    await assert.rejects(store.claim(alice,a.id,{kind:'confirm',operationId:randomUUID(),expectedRevision:a.revision,reviewedRevision:a.revision}),{code:'clarification_required'});
    assert.deepEqual((await store.create(alice)).context,a.context);
    respond=async input=>{assert.equal(input.sources.m2,answer);return {proposal:recap,usage}};
    const answered=await send(a,answer);assert.ok('turns' in answered);a=answered;
    assert.equal(a.turns.at(-1)?.questionTopic,'Onboarding recap');assert.equal(a.context.trainingSummary?.find(f=>f.category==='limitations')?.text,answer);
    const completed=await send(a,'Looks good');assert.ok('summarySaved' in completed);assert.equal(calls,before+2);
    for(const table of ['onboarding_conversations','onboarding_turns','onboarding_context_revisions'])assert.equal((await owner.query(`SELECT count(*)::int AS n FROM fitquest.${table} WHERE user_id=$1`,[alice.userId])).rows[0].n,0);
    const {s,p}=await latest();assert.deepEqual(s.summary.document,resolved);
    respond=async input=>{assert.equal(input.summary.find((f:any)=>f.category==='limitations').text,answer);return {proposal:input.kind==='outline'?fixtureOutline(input.dates):fixtureDetail(input.outline,input.date),usage}};
    await generate('outline');await generate(p.dates[0]);const saved=await latest();assert.equal(saved.p.outline.coverage.length,0);assert.ok(saved.p.days[0].detail.sessions.length);
    const count=calls;await generate('outline');await generate(p.dates[0]);assert.equal(calls,count);
    oldPlan=p.id;oldDays=structuredClone(saved.p.days);
  });
  const blockedPlan=async(legacy=false):Promise<RecoveryRequest>=>{
    const current=await latest();await plans.edit(alice,current.s.summary.revision,summary,'UTC');const state=await plans.read(alice);await plans.ensurePlan(alice,state.summary.revision);const {s,p}=await latest();
    if(legacy)await owner.query('UPDATE fitquest.training_plans SET outline=$3 WHERE user_id=$1 AND id=$2',[alice.userId,p.id,JSON.stringify({days:p.dates.map((date:string)=>({date,sessions:[]})),coverage:['limitations_need_clarification']})]);
    else {respond=async()=>({proposal:{days:p.dates.map((date:string)=>({date,sessions:[]})),coverage:[],clarification:question},usage});await generate('outline')}
    return {summaryRevision:s.summary.revision,planId:p.id,target:'outline'};
  };
  await t.test('new planner question reopens with no assessment charge, answer retry is durable, agreement creates a new plan without rewriting days',async()=>{
    const r=await blockedPlan(),before=calls,budget=await spent();
    const request=()=>app.inject({method:'POST',url:'/training/clarification',headers:{authorization:'Bearer alice'},payload:r});
    const [one,two]=await Promise.all([request(),request()]);assert.equal(one.statusCode,200);assert.equal(two.statusCode,200);assert.equal(one.json().id,two.json().id);assert.equal(calls,before);
    let a=(await service.clarify(alice,r,async()=>true)) as Conversation;assert.match(a.turns[0]!.reply!,/Does the shoulder/);assert.equal(calls,before);
    assert.equal((await app.inject({method:'POST',url:'/training/clarification',payload:r})).statusCode,401);
    await assert.rejects(service.clarify(bob,r,async()=>true),{code:'not_found'});
    await assert.rejects(generate((await latest()).p.dates[0]),{code:'clarification_required'});
    respond=async()=>({failure:'provider_error',usage});const failed=await send(a,answer);assert.ok('turns' in failed);a=failed;
    const reopened=await service.clarify(alice,r,async()=>true);assert.ok('turns' in reopened);assert.equal(reopened.turns.at(-1)?.message,answer);assert.equal(calls,before+1);
    respond=async input=>{
      assert.ok(Object.keys(input.sources).some(k=>k.startsWith('saved')));assert.equal(input.sources.m2,answer);
      assert.equal(input.context.recovery.summaryRevision,r.summaryRevision);return {proposal:recap,usage};
    };
    const retry={kind:'retry' as const,turnId:a.turns.at(-1)!.id,operationId:randomUUID(),expectedRevision:a.revision};
    const retried=await service.command(alice,a.id,retry,async()=>true);assert.ok('turns' in retried);a=retried;
    await service.command(alice,a.id,retry,async()=>true);assert.equal(calls,before+2);assert.equal(await spent()-budget,200);
    assert.ok('deleted' in await send(a,'Looks good'));
    const receipt=await service.clarify(alice,r,async()=>true);assert.ok('deleted' in receipt&&receipt.summarySaved);assert.equal(receipt.id,a.id);assert.equal(calls,before+2);
    const after=await latest();assert.equal(after.s.summary.revision,r.summaryRevision+1);assert.deepEqual(after.s.summary.document,resolved);assert.equal(after.p.outline,null);
    assert.deepEqual(after.s.plans.find(p=>p.id===oldPlan).days,oldDays);assert.ok(after.s.plans.find(p=>p.id===r.planId).outline.clarification);
    respond=async input=>({proposal:input.kind==='outline'?fixtureOutline(input.dates):fixtureDetail(input.outline,input.date),usage});await generate('outline');await generate(after.p.dates[0]);
    assert.ok((await latest()).p.days[0].detail.sessions.length);await assert.rejects(store.read(alice,a.id),{code:'not_found'});
  });
  await t.test('clarification reopen commits interrupted completion once and replays its exact receipt without touching other work or spending',async()=>{
    const r=await blockedPlan();let a=await service.clarify(alice,r,async()=>true);assert.ok('turns' in a);
    respond=async()=>({proposal:recap,usage});a=await send(a,answer);assert.ok('turns' in a);
    const before=await plans.read(alice),count=calls;
    const ledger=async()=>({budget:(await owner.query('SELECT * FROM fitquest.ai_budget')).rows,attempts:(await owner.query('SELECT * FROM fitquest.onboarding_attempts ORDER BY id')).rows});
    const accounting=await ledger();
    await store.claim(alice,a.id,{kind:'message',text:'Looks good',operationId:randomUUID(),expectedRevision:a.revision},provider);
    assert.equal((await store.read(alice,a.id)).turns.at(-1)?.questionTopic,'Onboarding complete');
    await assert.rejects(service.clarify(alice,{...r,target:(await latest()).p.dates[0]},async()=>true),{code:'conversation_in_progress'});
    await assert.rejects(service.clarify(alice,{...r,summaryRevision:r.summaryRevision+1},async()=>true),{code:'conversation_in_progress'});
    assert.deepEqual(await plans.read(alice),before);
    const [first,concurrent]=await Promise.all([service.clarify(alice,r,async()=>true),service.clarify(alice,r,async()=>true)]);
    assert.deepEqual(concurrent,first);assert.ok('deleted' in first&&first.summarySaved);assert.equal(first.id,a.id);
    const after=await plans.read(alice);assert.equal(after.summary.revision,r.summaryRevision+1);assert.deepEqual(after.summary.document,resolved);
    assert.equal(after.plans.length,Math.min(20,before.plans.length+1));
    for(const plan of before.plans.filter(p=>after.plans.some(x=>x.id===p.id)))assert.deepEqual(after.plans.find(p=>p.id===plan.id),plan);
    await assert.rejects(store.read(alice,a.id),{code:'not_found'});
    // Repeated/lost replies and UUID casing must identify the same request, not a fresh assessment.
    assert.deepEqual(await service.clarify(alice,{...r,planId:r.planId.toUpperCase()},async()=>true),first);
    const unfinished=await service.create(alice);
    assert.deepEqual(await service.clarify(alice,r,async()=>true),first);
    assert.equal((await store.read(alice,unfinished.id)).id,unfinished.id);
    assert.deepEqual(await plans.read(alice),after);assert.equal(calls,count);assert.deepEqual(await ledger(),accounting);
    await assert.rejects(service.clarify(bob,r,async()=>true));
    await assert.rejects(service.clarify(alice,{...r,target:(await latest()).p.dates[0]},async()=>true),{code:'summary_changed'});
    // A genuinely newer edit is not a receipt for this old recovery.
    await plans.edit(alice,after.summary.revision,resolved,'UTC');const edited=await plans.read(alice);
    await assert.rejects(service.clarify(alice,r,async()=>true),{code:'summary_changed'});
    assert.deepEqual(await plans.read(alice),edited);assert.deepEqual(await ledger(),accounting);await store.remove(alice,unfinished.id);
  });
  await t.test('clarification-entry cleanup survives a deferred summary COMMIT failure and retries without double retention',async()=>{
    const r=await blockedPlan();let a=await service.clarify(alice,r,async()=>true);assert.ok('turns' in a);
    respond=async()=>({proposal:recap,usage});a=await send(a,answer);assert.ok('turns' in a);
    await store.claim(alice,a.id,{kind:'message',text:'Looks good',operationId:randomUUID(),expectedRevision:a.revision},provider);
    const before=await plans.read(alice),count=calls,budget=await spent();
    await owner.query("CREATE FUNCTION fitquest.fail_recovery_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic recovery COMMIT failure'; END $$; CREATE CONSTRAINT TRIGGER fail_recovery_commit AFTER INSERT OR UPDATE ON fitquest.training_summaries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fitquest.fail_recovery_commit()");
    try {
      await assert.rejects(service.clarify(alice,r,async()=>true));
      assert.deepEqual(await plans.read(alice),before);assert.equal((await store.read(alice,a.id)).turns.at(-1)?.questionTopic,'Onboarding complete');
    }finally{await owner.query('DROP TRIGGER fail_recovery_commit ON fitquest.training_summaries; DROP FUNCTION fitquest.fail_recovery_commit()')}
    const receipt=await service.clarify(alice,r,async()=>true);assert.ok('deleted' in receipt&&receipt.summarySaved);
    assert.equal((await plans.read(alice)).summary.revision,r.summaryRevision+1);
    assert.deepEqual(await service.clarify(alice,r,async()=>true),receipt);assert.equal(calls,count);assert.equal(await spent(),budget);
  });
  await t.test('an unrelated next summary revision cannot impersonate completed recovery or bypass its stale guard',async()=>{
    for(const completed of [false,true]){
      const r=await blockedPlan();let id:string|undefined;
      if(completed){
        let a=await service.clarify(alice,r,async()=>true);assert.ok('turns' in a);respond=async()=>({proposal:recap,usage});a=await send(a,answer);assert.ok('turns' in a);id=a.id;
        await store.claim(alice,a.id,{kind:'message',text:'Looks good',operationId:randomUUID(),expectedRevision:a.revision},provider);
      }
      // Same next revision as a successful cleanup, but from an independent edit/new plan.
      await plans.edit(alice,r.summaryRevision,resolved,'UTC');await plans.ensurePlan(alice,r.summaryRevision+1);
      const before=await plans.read(alice),count=calls,budget=await spent();
      await assert.rejects(service.clarify(alice,r,async()=>true),{code:'summary_changed'});
      assert.deepEqual(await plans.read(alice),before);assert.equal(calls,count);assert.equal(await spent(),budget);
      if(id){assert.equal((await store.read(alice,id)).turns.at(-1)?.questionTopic,'Onboarding complete');await store.remove(alice,id)}
    }
  });
  await t.test('legacy enum-only blocked plan receives one metered tailored assessment; reopens never charge again',async()=>{
    const r=await blockedPlan(true),before=calls;
    respond=async input=>{assert.deepEqual(input.context.planningIssue,['limitations_need_clarification']);assert.equal(input.context.items.filter((x:any)=>x.source.startsWith('saved')).length,5);return {proposal:{...recap,trainingSummary:summary,planningCheck:{status:'question',...question}},usage}};
    const result=await service.clarify(alice,r,async()=>true);assert.ok('turns' in result);assert.equal(calls,before+1);assert.match(result.turns[0]!.reply!,/Does the shoulder/);
    assert.equal((await service.clarify(alice,r,async()=>true)).id,result.id);assert.equal(calls,before+1);
    // A concurrent edit makes this old recovery stale; it cannot overwrite the newer summary.
    const {s}=await latest();await plans.edit(alice,s.summary.revision,resolved,'UTC');
    await assert.rejects(send(result,answer),{code:'summary_changed'});assert.equal(calls,before+1);assert.deepEqual((await plans.read(alice)).summary.document,resolved);
    await store.remove(alice,result.id);
  });
  await t.test('an old false block can recap an already adequate saved answer without repeating a question',async()=>{
    const r=await blockedPlan(true);
    await owner.query('UPDATE fitquest.training_summaries SET document=$2 WHERE user_id=$1',[alice.userId,JSON.stringify(resolved)]);
    respond=async input=>{assert.equal(input.context.trainingSummary.find((f:any)=>f.category==='limitations').text,answer);return {proposal:recap,usage}};
    const before=calls,a=await service.clarify(alice,r,async()=>true);assert.ok('turns' in a);
    assert.equal(a.turns[0]?.questionTopic,'Onboarding recap');assert.doesNotMatch(a.turns[0]!.reply!,/Does the shoulder/);
    assert.ok('deleted' in await send(a,'Looks good'));assert.equal(calls,before+1);
  });
  await t.test('later-day clarification uses retained summary and preserves all already saved day details',async()=>{
    respond=async input=>({proposal:input.kind==='outline'?fixtureOutline(input.dates):fixtureDetail(input.outline,input.date),usage});
    await generate('outline');let {s,p}=await latest();await generate(p.dates[0]);
    const target=p.dates[3];respond=async()=>({proposal:{date:target,sessions:[],coverage:[],clarification:question},usage});await generate(target);
    ({s,p}=await latest());const days=structuredClone(p.days),before=calls;
    const a=await service.clarify(alice,{summaryRevision:s.summary.revision,planId:p.id,target},async()=>true);assert.ok('turns' in a);assert.equal(calls,before);
    respond=async()=>({proposal:recap,usage});const result=await send(a,answer);assert.ok('turns' in result);assert.ok('deleted' in await send(result,'Looks good'));
    assert.deepEqual((await plans.read(alice)).plans.find(x=>x.id===p.id).days,days);
  });
  await t.test('recovery sign-out and summary changes withhold late content but retain measured costs',async()=>{
    for(const change of ['signout','summary']){
      const r=await blockedPlan(),a=await service.clarify(alice,r,async()=>true);assert.ok('turns' in a);
      let finish!:(result:ProviderResult)=>void;respond=()=>new Promise(resolve=>{finish=resolve});let authorized=true;
      const before=await spent();const pending=service.command(alice,a.id,{kind:'message',text:answer,expectedRevision:a.revision,operationId:randomUUID()},async()=>authorized);
      while(!finish)await new Promise(resolve=>setImmediate(resolve));
      if(change==='signout')authorized=false;else await plans.edit(alice,r.summaryRevision,resolved,'UTC');
      finish({proposal:recap,usage});
      if(change==='signout')await assert.rejects(pending,{code:'session_ended'});else {const result=await pending;assert.ok('turns' in result);assert.equal(result.turns.at(-1)?.error,'summary_changed');assert.equal(result.turns.at(-1)?.reply,null)}
      assert.equal(await spent()-before,100);await store.remove(alice,a.id);
    }
  });
}
