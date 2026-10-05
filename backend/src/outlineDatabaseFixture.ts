import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import { buildApp } from './app.js';
import { checkOverview } from './outlinePlanning.js';
import { checkWeek } from './weeklyPlanning.js';
import { weeklyLimits } from './weeklyPlanning.js';
import { overviewFixture,overviewWorkouts } from './outlinePlanningFixture.js';
import { trainingFixture } from './planningFixture.js';
import type { OnboardingProvider,ProviderResult } from './onboardingProvider.js';
import type { ProfileStore } from './profileStore.js';

export async function verifyOutlineDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
 const account={userId:randomUUID(),sessionId:randomUUID()};
 await owner.query('INSERT INTO auth.users(id) VALUES($1)',[account.userId]);
 await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[account.sessionId,account.userId]);
 await profiles.save(account,{firstName:'Casey',lastName:'Synthetic',height:{value:68,unit:'in'},age:30,weight:{value:150,unit:'lb'},gender:'Not specified'});
 await owner.query("INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'UTC')",[account.userId,JSON.stringify(trainingFixture)]);
 await owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000000,evaluation_cap_micro=250000,app_enabled=true');
 const store=planningStore(pool);let calls=0,distributed=true;
 const wireInputs:any[]=[];
 const normal=async(body:string):Promise<ProviderResult>=>{
  const wire=JSON.parse(body),input=JSON.parse(wire.input);wireInputs.push(wire);
  return {proposal:wire.text.format.name==='training_overview'?overviewFixture(input.dates,distributed):overviewWorkouts(input),usage:{input:100,output:500,cached:0,cacheWrite:0}};
 };
 let respond=normal;
 const provider:OnboardingProvider={mode:'test',model:'mock-outline',capMicro:7000000,prepare:()=>{throw Error()},cost:u=>Math.ceil(u.input*.125+u.output*.5),call:async body=>{calls++;return respond(body)}};
 const service=planningService(store,provider,'test');
 const app=buildApp(false,{store:profiles,verifyAccount:async token=>token==='outline'?account:null,planning:service});t.after(()=>app.close());
 const latest=async()=>{const s=await store.read(account);return s.plans.find(p=>p.summaryRevision===s.summary.revision)!};
 const fresh=async()=>{const s=await store.read(account);await store.edit(account,s.summary.revision,trainingFixture,'UTC');await store.ensurePlan(account,s.summary.revision+1);return latest()};
 const generate=async(target='outline',retryAttempt:string|null=null)=>{const p=await latest();return service.generate(account,{planId:p.id,summaryRevision:p.summaryRevision,target,retryAttempt,...(target==='week'?{planRevision:p.planRevision,confirmOutline:true}:{})},async()=>true)};
 const confirm=(p:any)=>({planId:p.id,summaryRevision:p.summaryRevision,target:'week',retryAttempt:null,planRevision:p.planRevision,confirmOutline:true});
 await t.test('outline-first persists two-call happy path, duplicate confirmations and free reopen for single/distributed athletes',async()=>{
  for(distributed of [false,true]){
   await fresh();const before=calls;await generate();let p=await latest();assert.equal(p.outlineFirst,true);assert.equal(p.planRevision,1);assert.equal(p.confirmedOutlineRevision,null);assert.equal(p.days.length,0);assert.equal(calls,before+1);
   assert.equal(p.outline.days[0].sessions.length,distributed?2:1);assert.deepEqual((await planningStore(pool).read(account)).plans.find(q=>q.id===p.id).outline,p.outline);
   await assert.rejects(service.accept(account,{planId:p.id,summaryRevision:p.summaryRevision,planRevision:1}),{code:'review_unavailable'});
   const route=await app.inject({method:'POST',url:'/training/generate',headers:{authorization:'Bearer outline'},payload:{planId:p.id,summaryRevision:p.summaryRevision,target:'week',retryAttempt:null}});assert.equal(route.statusCode,409);assert.equal(route.json().code,'outline_confirmation_required');
   await assert.rejects(service.generate(account,{...confirm(p),target:p.dates[0]},async()=>true),{code:'outline_confirmation_required'});
   const approved=structuredClone(p.outline);
   await Promise.all([service.generate(account,confirm(p),async()=>true),service.generate(account,confirm(p),async()=>true)]);
   p=await latest();assert.equal(calls,before+2);assert.equal(p.days.length,7);assert.equal(p.reviewState,'accepted');assert.equal(p.confirmedOutlineRevision,1);assert.deepEqual(p.outline.days,approved.days);
   const budget=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
   await generate('week');await store.read(account);await service.accept(account,{planId:p.id,summaryRevision:p.summaryRevision,planRevision:1});assert.equal(calls,before+2);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,budget);
   const wire=wireInputs.at(-1);assert.deepEqual(JSON.parse(wire.input).outline,approved);assert.equal(JSON.parse(wire.input).approvedOutlineRevision,1);assert.equal(wire.text.format.name,'training_week');
  }
 });
 await t.test('outline clarification resumes privately; a revised failed outline gets a fresh revision-bound detail receipt',async()=>{
  respond=normal;await fresh();await generate();const old=await latest();
  respond=async body=>{const input=JSON.parse(JSON.parse(body).input);return {proposal:{outline:{clarification:{question:'Should the first day stay unchanged or become shorter?',reason:'The keep instruction conflicts with shortening that day.'},arrangementNote:null,days:input.dates.map((date:string)=>({date,sessions:[]}))},scope:null,reply:'Your outline is unchanged while we resolve the first day.'},usage:{input:100,output:100,cached:0,cacheWrite:0}}};
  await service.review(account,{planId:old.id,summaryRevision:old.summaryRevision,planRevision:1,feedback:'Keep the first day unchanged and shorten it.',retryAttempt:null},async()=>true);
  let p=await latest();assert.equal(p.planRevision,2);assert.deepEqual(p.outline,old.outline);assert(p.reviewQuestion);assert.equal(p.days.length,0);await assert.rejects(service.generate(account,confirm(p),async()=>true),{code:'review_unavailable'});
  respond=async body=>{const input=JSON.parse(JSON.parse(body).input),outline=overviewFixture(input.dates);assert.match(input.review.context.feedback,/Keep the first day/);outline.days[0]!.sessions[0]!.estimatedMinutes=15;return {proposal:{outline,scope:[{date:input.dates[0],changeSessions:[0],evidence:'Actually shorten the first day morning'}],reply:'The morning session is shorter; the other sessions remain.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
  await service.review(account,{planId:p.id,summaryRevision:p.summaryRevision,planRevision:2,feedback:'Actually shorten the first day morning.',retryAttempt:null},async()=>true);p=await latest();assert.equal(p.planRevision,3);assert.equal(p.reviewQuestion,null);
  respond=async()=>({failure:'provider_error'});await generate('week');assert.equal((await latest()).jobs.find((j:any)=>j.target==='details:3').status,'failed');
  respond=async body=>{const input=JSON.parse(JSON.parse(body).input),outline=overviewFixture(input.dates);outline.days[0]!.sessions[0]!.estimatedMinutes=15;outline.days[3]!.sessions[0]!.estimatedMinutes=15;return {proposal:{outline,scope:[{date:input.dates[3],changeSessions:[0],evidence:'Shorten the fourth day'}],reply:'The fourth day is shorter; the rest remains unchanged.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
  await service.review(account,{planId:p.id,summaryRevision:p.summaryRevision,planRevision:3,feedback:'Shorten the fourth day.',retryAttempt:null},async()=>true);p=await latest();assert.equal(p.planRevision,4);assert.equal(p.confirmedOutlineRevision,null);assert(!p.jobs.some((j:any)=>j.target==='details:3'));
  respond=normal;await generate('week');assert.equal((await latest()).days.length,7);
 });
 await t.test('detail timeout and late usage preserve the approved outline and independent uncertain accounting',async()=>{
  respond=normal;await fresh();await generate();const p=await latest(),before=calls;
  let late!:(value:ProviderResult)=>void;respond=()=>new Promise(resolve=>{late=resolve});
  const original=weeklyLimits.timeoutMs;(weeklyLimits as {timeoutMs:number}).timeoutMs=5;
  try{await generate('week')}finally{(weeklyLimits as {timeoutMs:number}).timeoutMs=original;}
  const failed=await latest(),job=failed.jobs.find((j:any)=>j.target==='details:1');assert.equal(job.status,'failed');assert.deepEqual(failed.outline,p.outline);assert.equal(failed.days.length,0);assert.equal(calls,before+1);
  assert.equal((await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE id=$1',[job.attemptId])).rows[0].state,'uncertain');
  late({proposal:{},usage:{input:100,output:100,cached:0,cacheWrite:0}});
  for(let i=0;i<20;i++){if((await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE id=$1',[job.attemptId])).rows[0].state==='settled')break;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal((await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE id=$1',[job.attemptId])).rows[0].state,'settled');assert.equal((await latest()).days.length,0);respond=normal;
 });
 await t.test('detail publication is atomic at COMMIT and rejects a changed athlete profile while retaining costs',async()=>{
  respond=normal;await fresh();await generate();const p=await latest();
  await owner.query(`CREATE FUNCTION fitquest.test_outline_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic commit failure'; END $$;
    CREATE CONSTRAINT TRIGGER test_outline_commit AFTER INSERT ON fitquest.training_days DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fitquest.test_outline_commit()`);
  try{await assert.rejects(generate('week'),/synthetic commit failure/)}finally{await owner.query('DROP TRIGGER test_outline_commit ON fitquest.training_days; DROP FUNCTION fitquest.test_outline_commit()');}
  const failed=await latest();assert.equal(failed.days.length,0);assert.deepEqual(failed.outline,p.outline);assert.equal(failed.reviewState,'draft');
  await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1 AND plan_id=$2",[account.userId,p.id]);
  const job=(await latest()).jobs.find((j:any)=>j.target==='details:1');await generate('week',job.attemptId);assert.equal((await latest()).days.length,7);
  await fresh();await generate();const current=await latest(),work=(await store.claim(account,confirm(current),provider))!;
  await owner.query('UPDATE fitquest.profiles SET updated_at=now() WHERE user_id=$1',[account.userId]);await store.settle(account,work.attempt,100);await store.finish(account,work,checkWeek(overviewWorkouts(work.input),work.input));
  assert.equal((await latest()).days.length,0);assert.equal((await owner.query('SELECT actual_micro FROM fitquest.onboarding_attempts WHERE id=$1',[work.attempt])).rows[0].actual_micro,'100');
 });
 await t.test('outline conversational revision and clarification preserve kept work, require current revision and generate no exercises',async()=>{
  await fresh();await generate();const old=await latest(),count=calls;
  const feedback='Keep the first day unchanged. Shorten the fourth day.';
  respond=async body=>{const input=JSON.parse(JSON.parse(body).input);assert.equal(input.catalog,undefined);const next=overviewFixture(input.dates);next.days[3]!.sessions[0]!.estimatedMinutes=15;return {proposal:{outline:next,reply:'The fourth day is shorter; the first day is unchanged.',scope:[{date:input.dates[3],changeSessions:[0],evidence:'Shorten the fourth day'}]},usage:{input:100,output:500,cached:0,cacheWrite:0}}};
  const req={planId:old.id,summaryRevision:old.summaryRevision,planRevision:old.planRevision,feedback,retryAttempt:null};
  await service.review(account,req,async()=>true);await service.review(account,req,async()=>true);const revised=await latest();assert.equal(calls,count+1);assert.equal(revised.days.length,0);assert.equal(revised.planRevision,2);assert.deepEqual(revised.outline.days[0],old.outline.days[0]);
  await assert.rejects(service.generate(account,confirm(old),async()=>true),{code:'plan_changed'});
  respond=normal;await generate('week');assert.equal(calls,count+2);assert.equal((await latest()).days.length,7);
 });
 await t.test('failed/partial/conflicting details retain approved outline; only exact explicit retry spends again',async()=>{
  for(const kind of ['failure','partial','conflict']){
   await fresh();respond=normal;await generate();const p=await latest(),count=calls;
   respond=async body=>{if(kind==='failure')return {failure:'provider_error'};const input=JSON.parse(JSON.parse(body).input),value=overviewWorkouts(input);if(kind==='partial')value.days.pop();else Object.assign(value,{clarification:{question:'Can we revise the unsupported session?',reason:'The catalog lacks work using the required equipment.'},goalDecisions:[],days:input.dates.map((date:string)=>({date,sessions:[]}))});return {proposal:value,usage:{input:100,output:500,cached:0,cacheWrite:0}}};
   await generate('week');let failed=await latest();assert.deepEqual(failed.outline,p.outline);assert.equal(failed.days.length,0);assert.equal(failed.reviewState,'draft');assert.equal(failed.confirmedOutlineRevision,1);
   if(kind==='conflict')assert.match(failed.reviewNote,/equipment/);
   await generate('week');await store.read(account);assert.equal(calls,count+1);
   const job=failed.jobs.find((j:any)=>j.target==='details:1');respond=normal;await generate('week',job.attemptId);assert.equal(calls,count+2);assert.equal((await latest()).days.length,7);
  }
 });
 await t.test('interrupted details preserve reservation; late results cannot overwrite retry or changed outline',async()=>{
  await fresh();await generate();const p=await latest();const works=await Promise.all([store.claim(account,confirm(p),provider),store.claim(account,confirm(p),provider)]),work=works.find(Boolean)!;assert.equal(works.filter(Boolean).length,1);
  await owner.query("UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1 AND plan_id=$2",[account.userId,p.id]);
  const failed=await latest();assert.equal(failed.days.length,0);assert.deepEqual(failed.outline,p.outline);
  assert.equal((await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE id=$1',[work.attempt])).rows[0].state,'uncertain');
  await generate('week',work.attempt);const complete=await latest();
  await store.settle(account,work.attempt,100);await store.finish(account,work,checkWeek(overviewWorkouts(work.input),work.input));assert.deepEqual((await latest()).days,complete.days);
  await fresh();await generate();const current=await latest(),stale=(await store.claim(account,confirm(current),provider))!;
  await owner.query('UPDATE fitquest.training_plans SET review_revision=review_revision+1,confirmed_outline_revision=NULL WHERE user_id=$1 AND id=$2',[account.userId,current.id]);
  await store.settle(account,stale.attempt,100);await store.finish(account,stale,checkWeek(overviewWorkouts(stale.input),stale.input));assert.equal((await latest()).days.length,0);
 });
 await t.test('new plan reads remain owner scoped and explicit outline creation fails closed without AI',async()=>{
  await fresh();const p=await latest();const disabled=planningService(store,undefined,'test');await disabled.generate(account,{planId:p.id,summaryRevision:p.summaryRevision,target:'outline',retryAttempt:null},async()=>true);const failed=await latest();assert.equal(failed.outline,null);assert.equal(failed.jobs[0].error,'ai_disabled');
  const other={userId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  assert(!(await store.read(other)).plans.some(q=>q.id===p.id));await assert.rejects(service.generate(other,{planId:p.id,summaryRevision:p.summaryRevision,target:'outline',retryAttempt:null},async()=>true),{code:'not_found'});
 });
 await t.test('edited legacy goal prose can outline first and recover missing detail goal identities without overwriting that outline',async()=>{
  respond=normal;const s=await store.read(account),document=trainingFixture.map(f=>f.category==='goals'?{category:f.category,text:'Comfortable walks and strength practice.',origin:f.origin}:f);
  await store.edit(account,s.summary.revision,document,'UTC');await store.ensurePlan(account,s.summary.revision+1);await generate();const p=await latest(),before=calls;
  await generate('week');const failed=await latest();assert.equal(calls,before);assert.deepEqual(failed.outline,p.outline);assert.equal(failed.jobs.find((j:any)=>j.target==='details:1').error,'summary_needs_correction');
  const conversation=await postgresOnboardingStore(pool).create(account,'UTC',{planId:p.id,summaryRevision:p.summaryRevision,target:'outline'});
  assert('context' in conversation);assert.deepEqual(conversation.context.planningIssue,['summary_needs_correction']);assert.deepEqual(conversation.context.trainingSummary,document);assert.deepEqual((await latest()).outline,p.outline);
 });
 await t.test('HTTP outline keep-the-rest saves only permitted changes, rejects a forged remainder edit, and retries without duplicate charges',async()=>{
  respond=normal;distributed=true;await fresh();await generate();const original=await latest();
  const reviewRequest=(p:any,feedback:string,retryAttempt:string|null=null)=>({planId:p.id,summaryRevision:p.summaryRevision,planRevision:p.planRevision,feedback,retryAttempt});
  const send=(payload:object)=>app.inject({method:'POST',url:'/training/review',headers:{authorization:'Bearer outline'},payload});
  const output=(body:string)=>{const input=JSON.parse(JSON.parse(body).input);assert.equal(input.preservation.unresolved,false);return {input,outline:{days:input.review.outline.days,arrangementNote:input.review.outline.arrangementNote??null,clarification:null}}};
  respond=async body=>{const {input,outline}=output(body);outline.days[3].sessions[0].estimatedMinutes=15;return {proposal:{outline,scope:[{date:input.dates[3],changeSessions:[0],evidence:'Shorten the fourth day'}],reply:'The fourth day is shorter. The rest is unchanged.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
  const request=reviewRequest(original,'Shorten the fourth day. Keep the rest unchanged.'),before=calls;
  let response=await send(request);assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'no-store');let current=await latest();assert.equal(current.planRevision,2);assert.equal(current.days.length,0);
  assert.equal(current.outline.days[3].sessions[0].estimatedMinutes,15);
  for(let i=0;i<7;i++)if(i!==3)assert.deepEqual(current.outline.days[i],original.outline.days[i]);
  const ledger=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;await send(request);await store.read(account);assert.equal(calls,before+1);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,ledger);
  const feedback='Shorten the first day morning. Keep the rest unchanged.',second=reviewRequest(current,feedback),saved=structuredClone(current.outline);
  let alterRemainder=true;
  respond=async body=>{const {input,outline}=output(body);outline.days[0].sessions[0].estimatedMinutes=15;if(alterRemainder)outline.days[0].sessions[1].estimatedMinutes=15;return {proposal:{outline,scope:[{date:input.dates[0],changeSessions:alterRemainder?[0,1]:[0],evidence:'Shorten the first day morning'}],reply:'The morning session is shorter; other work is unchanged.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
  response=await send(second);assert.equal(response.statusCode,200);current=await latest();assert.equal(current.planRevision,2);assert.deepEqual(current.outline,saved);assert.equal(current.jobs.find((j:any)=>j.target==='review:2').error,'saved_day_changed');
  const failedCallCount=calls;await send(second);assert.equal(calls,failedCallCount);
  alterRemainder=false;const retry={...second,retryAttempt:current.jobs.find((j:any)=>j.target==='review:2').attemptId};await send(retry);await send(retry);current=await latest();assert.equal(calls,failedCallCount+1);assert.equal(current.planRevision,3);assert.deepEqual(current.outline.days[0].sessions[1],saved.days[0].sessions[1]);assert.equal(current.days.length,0);
 });
 await t.test('HTTP outline remainder protections survive clarification receipts and allow a session addition without changing saved work',async()=>{
  respond=normal;await fresh();await generate();let current=await latest();const original=structuredClone(current.outline);
  const send=(p:any,feedback:string)=>app.inject({method:'POST',url:'/training/review',headers:{authorization:'Bearer outline'},payload:{planId:p.id,summaryRevision:p.summaryRevision,planRevision:p.planRevision,feedback,retryAttempt:null}});
  const feedback='Shorten the fourth day. Keep the rest unchanged.',before=calls;
  respond=async body=>{const input=JSON.parse(JSON.parse(body).input);return {proposal:{outline:{days:input.dates.map((date:string)=>({date,sessions:[]})),arrangementNote:null,clarification:{question:'How many minutes should the fourth day last?',reason:'A target duration will make the requested change precise.'}},scope:null,reply:'Your outline is unchanged while you choose a duration.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
  await send(current,feedback);await send(current,feedback);assert.equal(calls,before+1);current=await latest();assert.equal(current.planRevision,2);assert.deepEqual(current.outline,original);assert(current.reviewQuestion);
  respond=async body=>{const input=JSON.parse(JSON.parse(body).input);assert.equal(input.preservation.unresolved,false);assert.equal(input.review.context.feedback,feedback);const outline={days:input.review.outline.days,arrangementNote:null,clarification:null};outline.days[3].sessions[0].estimatedMinutes=15;return {proposal:{outline,scope:[{date:input.dates[3],changeSessions:[0],evidence:'Shorten the fourth day'}],reply:'The fourth day is 15 minutes. The rest stays unchanged.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
  await send(current,'15 minutes.');await send(current,'15 minutes.');assert.equal(calls,before+2);current=await latest();assert.equal(current.planRevision,3);assert.equal(current.reviewQuestion,null);for(let i=0;i<7;i++)if(i!==3)assert.deepEqual(current.outline.days[i],original.days[i]);
  const saved=structuredClone(current.outline);
  respond=async body=>{const input=JSON.parse(JSON.parse(body).input);assert.equal(input.preservation.unresolved,false);const outline={days:input.review.outline.days,arrangementNote:null,clarification:null};outline.days[0].sessions.splice(1,0,{focus:'Easy mobility',timing:'midday',estimatedMinutes:10});return {proposal:{outline,scope:[{date:input.dates[0],changeSessions:[],evidence:'Add a midday session on the first day'}],reply:'A midday session is added; the existing sessions are unchanged.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
  const addition='Add a midday session on the first day. Keep the rest unchanged.';await send(current,addition);await send(current,addition);assert.equal(calls,before+3);current=await latest();assert.equal(current.planRevision,4);assert.equal(current.outline.days[0].sessions.length,3);assert.deepEqual(current.outline.days[0].sessions[0],saved.days[0].sessions[0]);assert.deepEqual(current.outline.days[0].sessions[2],saved.days[0].sessions[1]);for(let i=1;i<7;i++)assert.deepEqual(current.outline.days[i],saved.days[i]);assert.equal(current.days.length,0);respond=normal;
 });
 await t.test('HTTP add-minutes session/workout edits survive explicit retry; true timed additions preserve work and duplicate accounting',async()=>{
  const send=(payload:object)=>app.inject({method:'POST',url:'/training/review',headers:{authorization:'Bearer outline'},payload});
  for(const noun of ['session','workout']){
   respond=normal;distributed=true;await fresh();await generate();const original=await latest(),before=calls;
   const day=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(`${original.dates[0]}T12:00:00Z`)),evidence=`Add 5 minutes to the ${day} morning ${noun}`;
   const request={planId:original.id,summaryRevision:original.summaryRevision,planRevision:original.planRevision,feedback:`${evidence}. Keep the rest unchanged.`,retryAttempt:null as string|null};
   let forged=true;
   respond=async body=>{const input=JSON.parse(JSON.parse(body).input);assert.equal(input.preservation.unresolved,false);const outline={days:input.review.outline.days,arrangementNote:null,clarification:null};outline.days[0].sessions[0].estimatedMinutes=25;if(forged)outline.days[0].sessions[1].estimatedMinutes=25;return {proposal:{outline,scope:[{date:input.dates[0],changeSessions:forged?[0,1]:[0],evidence}],reply:'The morning session is five minutes longer; the rest is unchanged.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
   let response=await send(request);assert.equal(response.statusCode,200);let current=await latest();assert.equal(current.planRevision,1);assert.deepEqual(current.outline,original.outline);const job=current.jobs.find((j:any)=>j.target==='review:1');assert.equal(job.error,'saved_day_changed');
   const failedLedger=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;await send(request);assert.equal(calls,before+1);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,failedLedger);
   forged=false;const retry={...request,retryAttempt:job.attemptId};response=await send(retry);assert.equal(response.statusCode,200);current=await latest();assert.equal(current.planRevision,2);assert.equal(current.reviewQuestion,null);assert.equal(current.outline.days[0].sessions[0].estimatedMinutes,25);assert.deepEqual(current.outline.days[0].sessions[1],original.outline.days[0].sessions[1]);assert.deepEqual(current.outline.days.slice(1),original.outline.days.slice(1));
   const completedLedger=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;await send(retry);await store.read(account);assert.equal(calls,before+2);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,completedLedger);
   const kept=structuredClone(current.outline),additionEvidence=`Add a 10-minute midday ${noun} on ${day}`,addition={...request,planRevision:current.planRevision,feedback:`${additionEvidence}. Keep the rest unchanged.`};
   respond=async body=>{const input=JSON.parse(JSON.parse(body).input);assert.equal(input.preservation.unresolved,false);const outline={days:input.review.outline.days,arrangementNote:null,clarification:null};outline.days[0].sessions.splice(1,0,{focus:'Mobility practice',timing:'midday',estimatedMinutes:10});return {proposal:{outline,scope:[{date:input.dates[0],changeSessions:[],evidence:additionEvidence}],reply:'A ten-minute midday session is added. Existing sessions are unchanged.'},usage:{input:100,output:200,cached:0,cacheWrite:0}}};
   response=await send(addition);assert.equal(response.statusCode,200);current=await latest();assert.equal(current.planRevision,3);assert.equal(current.outline.days[0].sessions.length,3);assert.deepEqual(current.outline.days[0].sessions[0],kept.days[0].sessions[0]);assert.deepEqual(current.outline.days[0].sessions[2],kept.days[0].sessions[1]);assert.deepEqual(current.outline.days.slice(1),kept.days.slice(1));assert.equal(current.days.length,0);
   const additionLedger=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;await send(addition);assert.equal(calls,before+3);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,additionLedger);
  }
  respond=normal;
 });
}
