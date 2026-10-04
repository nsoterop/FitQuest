import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from './profileStore.js';
import type { OnboardingProvider,ProviderResult } from './onboardingProvider.js';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { buildApp } from './app.js';
import { fixtureScope,reviewSummary,reviewWeek,revisedWeek,reviewFeedback } from './planReviewFixture.js';
import { checkReview } from './planReview.js';
import { weeklyLimits } from './weeklyPlanning.js';

export async function verifyPlanReviewDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
  const alice={userId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  const bob={userId:'22222222-2222-4222-8222-222222222222',sessionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  await owner.query('UPDATE fitquest.onboarding_request_limits SET requests=0,generations=0');
  let calls=0;
  const normal=async(body:string):Promise<ProviderResult>=>{
    const input=JSON.parse(JSON.parse(body).input);
    return {proposal:input.review?{scope:fixtureScope(input),week:revisedWeek(input),changedDates:[input.dates[1]],reply:'The first day is unchanged. The second day now has two shorter sessions with introductory acceleration.',lastingPreference:null}:reviewWeek(input),usage:{input:100,output:1000,cached:0,cacheWrite:0}};
  };
  let respond=normal;
  const provider:OnboardingProvider={mode:'test',model:'synthetic-review',capMicro:7000000,prepare:()=>{throw Error('Unexpected onboarding call')},cost:u=>Math.ceil(u.input*.125+u.output*.5),call:async body=>{calls++;return respond(body)}};
  const store=planningStore(pool),service=planningService(store,provider,'test');
  const app=buildApp(false,{store:profiles,verifyAccount:async token=>token==='alice'?alice:token==='bob'?bob:null,planning:service});t.after(()=>app.close());
  const latest=async()=>{const s=await store.read(alice);return {s,p:s.plans.find(p=>p.summaryRevision===s.summary!.revision)!}};
  const next=async()=>{
    const s=await store.read(alice);await store.edit(alice,s.summary!.revision,reviewSummary,'UTC');await store.ensurePlan(alice,s.summary!.revision+1);
    const {p}=await latest();await service.generate(alice,{summaryRevision:p.summaryRevision,planId:p.id,target:'week',retryAttempt:null},async()=>true);return latest();
  };
  const feedback=(p:any)=>`Keep ${p.dates[0]} exactly as it is; split ${p.dates[1]} into shorter sessions and give speed work a place.`;
  const request=(p:any)=>({planId:p.id,summaryRevision:p.summaryRevision,planRevision:p.planRevision,feedback:feedback(p),retryAttempt:null as string|null});
  const version=(p:any)=>({planId:p.id,summaryRevision:p.summaryRevision,planRevision:p.planRevision});
  const budget=async()=>(await owner.query('SELECT spent_micro,reserved_micro FROM fitquest.ai_budget')).rows[0];
  const expire=async(id:string)=>{await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1 AND plan_id=$2 AND status='pending'",[alice.userId,id]);await store.read(alice)};
  await t.test('initial seven-day draft, accepted exact revision and durable reopen use one initial provider dispatch',async()=>{
    const count=calls,{p}=await next();assert.equal(calls,count+1);assert.equal(p.reviewState,'draft');assert.equal(p.planRevision,1);assert.equal(p.days.length,7);
    const before=await budget(),bytes=JSON.stringify(p.days);
    await store.accept(alice,version(p));await store.accept(alice,version(p));const reopened=await planningStore(pool).read(alice);
    assert.equal(reopened.plans.find(x=>x.id===p.id).reviewState,'accepted');assert.equal(JSON.stringify(reopened.plans.find(x=>x.id===p.id).days),bytes);
    assert.equal(calls,count+1);assert.deepEqual(await budget(),before);
  });
  await t.test('same-week feedback revises actual sessions atomically; lost response/duplicate review cannot charge or apply again',async()=>{
    const {p}=await next(),before=calls,r=request(p),oldDays=structuredClone(p.days);
    const response=await app.inject({method:'POST',url:'/training/review',headers:{authorization:'Bearer alice'},payload:r});assert.equal(response.statusCode,200,response.body);assert.equal(response.headers['cache-control'],'no-store');
    const revised=(await latest()).p;assert.equal(revised.id,p.id);assert.deepEqual(revised.dates,p.dates);assert.equal(revised.planRevision,2);assert.equal(revised.days[1].detail.sessions.length,2);assert.deepEqual(revised.days[0],oldDays[0]);assert.deepEqual(revised.days.slice(2),oldDays.slice(2));
    assert.equal(revised.outline.goalDecisions.length,3);assert.equal(revised.outline.goalDecisions[2].status,'introductory');
    const settled=await budget();await service.review(alice,r,async()=>true);assert.equal(calls,before+1);assert.deepEqual(await budget(),settled);
    assert.equal((await owner.query('SELECT feedback FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3',[alice.userId,p.id,'review:1'])).rows[0].feedback,null);
    await assert.rejects(store.accept(alice,version(p)),{code:'plan_changed'});
  });
  await t.test('pending revision excludes duplicate dispatch and stale/concurrent acceptance while previous accepted work stays readable',async()=>{
    const {p}=await next();await store.accept(alice,version(p));const r=request(p),before=calls;
    let deliver!:(r:ProviderResult)=>void,sent='';respond=async body=>{sent=body;return new Promise(resolve=>{deliver=resolve})};
    const pending=service.review(alice,r,async()=>true);while(!deliver)await setImmediate();
    const visible=(await latest()).p;assert.equal(visible.reviewState,'accepted');assert.deepEqual(visible.days,p.days);
    await service.review(alice,r,async()=>true);await assert.rejects(store.accept(alice,version(p)),{code:'review_pending'});assert.equal(calls,before+1);
    deliver(await normal(sent));await pending;respond=normal;assert.equal((await latest()).p.reviewState,'draft');
  });
  await t.test('clarification preserves usable content and resumes from only the unresolved request, without onboarding resurrection',async()=>{
    const {p}=await next(),r={...request(p),feedback:'Keep the first day exactly as it is, but halve its work.'},before=calls;
    respond=async body=>{const input=JSON.parse(JSON.parse(body).input),week=reviewWeek(input);week.goalDecisions=[];week.days.forEach(d=>d.sessions=[]);week.clarification={question:'Should the first day remain unchanged or may its work change?',reason:'Keeping and halving its work conflict.'};return {proposal:{scope:null,week,changedDates:[],reply:'Your previous week is unchanged because these requests conflict.',lastingPreference:null},usage:{input:100,output:100,cached:0,cacheWrite:0}}};
    await service.review(alice,r,async()=>true);const current=(await latest()).p;assert.deepEqual(current.days,p.days);assert.equal(current.planRevision,p.planRevision+1);assert.match(current.reviewQuestion,/unchanged/);
    await service.review(alice,r,async()=>true);assert.equal(calls,before+1);await assert.rejects(store.accept(alice,version(current)),{code:'review_unavailable'});
    respond=async body=>{const input=JSON.parse(JSON.parse(body).input);assert.match(input.review.context.feedback,/halve/);return normal(body)};
    await service.review(alice,{...request(current),feedback:'Keep the first day unchanged. I mean split only the second day.'},async()=>true);
    assert.equal((await latest()).p.reviewQuestion,null);respond=normal;
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM fitquest.onboarding_conversations WHERE user_id=$1',[alice.userId])).rows[0].n,0);
  });
  await t.test('unidentified keep clarification persists, resolves on a short answer, and accepts/reopens without duplicate dispatch',async()=>{
    const {p}=await next(),before=calls,r={...request(p),feedback:`Keep ${p.dates[2]} unchanged. Keep the important bit unchanged; split ${p.dates[1]}.`};
    respond=async body=>{
      const input=JSON.parse(JSON.parse(body).input);assert.equal(input.preservation.unresolved,true);
      const week=reviewWeek(input);week.goalDecisions=[];week.days.forEach(d=>d.sessions=[]);
      week.clarification={question:'Which work do you want to keep unchanged?',reason:'The important bit does not identify the work to preserve.'};
      return {proposal:{scope:null,week,changedDates:[],reply:'The saved week is unchanged while you clarify what to keep.',lastingPreference:null},usage:{input:100,output:100,cached:0,cacheWrite:0}};
    };
    const post=async(payload:any)=>{const result=await app.inject({method:'POST',url:'/training/review',headers:{authorization:'Bearer alice'},payload});assert.equal(result.statusCode,200,result.body)};
    await post(r);const waiting=(await latest()).p;assert.deepEqual(waiting.days,p.days);assert.match(waiting.reviewQuestion,/keep unchanged/);
    const waitingBudget=await budget();await post(r);assert.equal(calls,before+1);assert.deepEqual(await budget(),waitingBudget);
    await assert.rejects(store.accept(alice,version(waiting)),{code:'review_unavailable'});
    // An unrelated answer cannot dismiss the unresolved protection or edit work.
    const unrelated={...request(waiting),feedback:'The weather is good.'};await post(unrelated);
    const stillWaiting=(await latest()).p;assert.deepEqual(stillWaiting.days,p.days);assert.ok(stillWaiting.reviewQuestion);
    await post(unrelated);assert.equal(calls,before+2);
    respond=async body=>{
      const input=JSON.parse(JSON.parse(body).input);assert.match(input.review.context.feedback,/important bit/);
      assert.equal(input.preservation.unresolved,false);assert.ok(input.preservation.days.includes(p.dates[0]));
      assert.ok(input.preservation.days.includes(p.dates[2]));
      const result=await normal(body);(result.proposal as any).scope=[{date:p.dates[1],changeSessions:[0],evidence:`split ${p.dates[1]}`}];return result;
    };
    const answer={...request(stillWaiting),feedback:`${p.dates[0]}.`};
    await post(answer);const revised=(await latest()).p;assert.equal(revised.reviewQuestion,null);assert.equal(revised.id,p.id);assert.deepEqual(revised.dates,p.dates);
    assert.deepEqual(revised.days[0],p.days[0]);assert.deepEqual(revised.days.slice(2),p.days.slice(2));assert.equal(revised.days[1].detail.sessions.length,2);
    assert.deepEqual(revised.days[1].detail.sessions[1].activities[1],p.days[1].detail.sessions[0].activities[1]);
    const settled=await budget();await post(answer);assert.equal(calls,before+3);assert.deepEqual(await budget(),settled);
    await store.accept(alice,version(revised));await store.accept(alice,version(revised));
    const reopened=(await planningStore(pool).read(alice)).plans.find(x=>x.id===p.id)!;
    assert.equal(reopened.reviewState,'accepted');assert.deepEqual(reopened.days,revised.days);assert.equal(calls,before+3);assert.deepEqual(await budget(),settled);
    const context=(await owner.query('SELECT review_context FROM fitquest.training_plans WHERE user_id=$1 AND id=$2',[alice.userId,p.id])).rows[0];assert.equal(context.review_context,null);
    respond=normal;
  });
  await t.test('invalid response and failed COMMIT leave accepted work intact; only an exact explicit retry dispatches again',async()=>{
    for(const mode of ['invalid','commit']){
      const {p}=await next();await store.accept(alice,version(p));const r=request(p),before=calls;
      if(mode==='invalid')respond=async body=>{const result=await normal(body);(result.proposal as any).week.days[0].sessions[0].activities[0].amount=1;(result.proposal as any).changedDates.push(p.dates[0]);return result};
      else await owner.query("CREATE FUNCTION fitquest.fail_review_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic review COMMIT failure'; END $$; CREATE CONSTRAINT TRIGGER fail_review_commit AFTER UPDATE ON fitquest.training_days DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fitquest.fail_review_commit()");
      try{if(mode==='commit')await assert.rejects(service.review(alice,r,async()=>true));else await service.review(alice,r,async()=>true)}finally{if(mode==='commit')await owner.query('DROP TRIGGER fail_review_commit ON fitquest.training_days; DROP FUNCTION fitquest.fail_review_commit()')}
      const kept=(await latest()).p;assert.deepEqual(kept.days,p.days);assert.equal(kept.reviewState,'accepted');assert.equal(kept.planRevision,p.planRevision);
      await service.review(alice,r,async()=>true);assert.equal(calls,before+1);await expire(p.id);respond=normal;
      const job=(await latest()).p.jobs.find((j:any)=>j.target===`review:${p.planRevision}`);
      await service.review(alice,{...r,retryAttempt:job.attemptId},async()=>true);assert.equal(calls,before+2);assert.equal((await latest()).p.planRevision,2);
    }
  });
  await t.test('timeout and late settlement cannot replace a previous draft or lose uncertain spending',async()=>{
    const {p}=await next(),r=request(p);let deliver!:(r:ProviderResult)=>void,sent='';respond=async body=>{sent=body;return new Promise(resolve=>{deliver=resolve})};
    t.mock.timers.enable({apis:['setTimeout']});
    try{const pending=service.review(alice,r,async()=>true);while(!deliver)await setImmediate();t.mock.timers.tick(weeklyLimits.timeoutMs+1);await pending;
      const failed=(await latest()).p;assert.deepEqual(failed.days,p.days);const job=failed.jobs.find((j:any)=>j.target==='review:1');assert.equal(job.error,'provider_error');
      assert.equal((await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE id=$1',[job.attemptId])).rows[0].state,'uncertain');
      deliver(await normal(sent));await setImmediate();await setImmediate();assert.deepEqual((await latest()).p.days,p.days);
    }finally{t.mock.timers.reset();respond=normal}
  });
  await t.test('summary/profile changes and sign-out reject publication, while accounting still settles independently',async()=>{
    for(const changed of ['summary','profile','session']){
      const {p}=await next(),oldProfile=(await profiles.read(alice))!,work=await store.claimReview(alice,request(p),provider);assert.ok(work);
      const value=checkReview((await normal(work.body)).proposal,work.input);
      if(changed==='summary')await store.edit(alice,p.summaryRevision,reviewSummary,'UTC');
      if(changed==='profile')await profiles.save(alice,{...oldProfile,age:oldProfile.age+1});
      if(changed==='session')await owner.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[alice.sessionId]);
      await store.settle(alice,work.attempt,100);
      if(changed==='session'){await assert.rejects(store.finish(alice,work,value),{code:'session_ended'});await owner.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[alice.sessionId])}
      else await store.finish(alice,work,value);
      assert.deepEqual((await store.read(alice)).plans.find(x=>x.id===p.id).days,p.days);
      if(changed==='profile')await profiles.save(alice,oldProfile);
      await expire(p.id);
    }
  });
  await t.test('legacy read, API ownership and private-schema grants preserve existing access boundaries',async()=>{
    const {p}=await next();await owner.query("UPDATE fitquest.training_plans SET review_state='legacy',review_revision=0 WHERE user_id=$1 AND id=$2",[alice.userId,p.id]);
    const before=calls,read=(await latest()).p;assert.deepEqual(read.days,p.days);assert.equal(read.reviewState,'legacy');assert.equal(calls,before);
    await assert.rejects(store.accept(alice,version(read)),{code:'review_unavailable'});
    for(const route of ['accept','review']){
      const payload=route==='accept'?version(p):request(p);
      assert.equal((await app.inject({method:'POST',url:`/training/${route}`,payload})).statusCode,401);
      assert.equal((await app.inject({method:'POST',url:`/training/${route}`,headers:{authorization:'Bearer bob'},payload})).statusCode,404);
      assert.equal((await app.inject({method:'POST',url:`/training/${route}`,headers:{authorization:'Bearer alice'},payload:{...payload,userId:bob.userId}})).statusCode,400);
    }
    for(const table of ['training_plans','training_days','training_summaries','training_generations']){
      assert.deepEqual((await owner.query('SELECT relrowsecurity AS rls,relforcerowsecurity AS forced FROM pg_class WHERE oid=$1::regclass',[`fitquest.${table}`])).rows[0],{rls:true,forced:true});
      for(const role of ['anon','authenticated','service_role'])assert.equal((await owner.query("SELECT has_table_privilege($1,$2,'SELECT') AS allowed",[role,`fitquest.${table}`])).rows[0].allowed,false);
    }
  });
  await t.test('future preference is saved only from explicit feedback; accepting remains free and summary replacement clears old preferences',async()=>{
    const {p}=await next(),preference='Going forward I prefer shorter morning sessions.';
    respond=async body=>{const result=await normal(body);(result.proposal as any).lastingPreference=preference;return result};
    await service.review(alice,{...request(p),feedback:feedback(p)+' '+preference},async()=>true);respond=normal;
    const result=await latest();assert.deepEqual(result.s.summary.preferences,[preference]);assert.equal(result.s.summary.revision,p.summaryRevision+1);assert.equal(result.p.id,p.id);assert.equal(result.p.summaryRevision,result.s.summary.revision);
    const before=await budget(),count=calls;await store.accept(alice,version(result.p));assert.equal(calls,count);assert.deepEqual(await budget(),before);
    const edited=structuredClone(reviewSummary);edited[1]!.text='I now prefer a single evening session, 20 minutes per session.';await store.edit(alice,result.s.summary.revision,edited,'UTC');assert.deepEqual((await store.read(alice)).summary.preferences,[]);
  });
  await t.test('review budget denial does not dispatch or replace the current draft',async()=>{
    const {p}=await next(),before=calls,original=await budget();await owner.query('UPDATE fitquest.ai_budget SET cap_micro=spent_micro+reserved_micro');
    try{await service.review(alice,request(p),async()=>true);const state=(await latest()).p;assert.equal(calls,before);assert.deepEqual(state.days,p.days);assert.equal(state.jobs.find((j:any)=>j.target==='review:1').error,'budget_exhausted');assert.deepEqual(await budget(),original)}
    finally{await owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000000')}
  });
}
