// Synthetic isolated database checks. Never production content or paid requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from './profileStore.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import { onboardingService } from './onboarding.js';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { intakeAnswers } from './fixedIntake.js';
import { initialOutlinePrompt } from './plainOutline.js';
import { fixturePrescription } from './planningFixture.js';
import type { OnboardingProvider } from './onboardingProvider.js';
export async function verifyFixedIntakeDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
 const a={userId:randomUUID(),sessionId:randomUUID()},b={userId:randomUUID(),sessionId:randomUUID()};
 for(const account of [a,b]){await owner.query('INSERT INTO auth.users(id) VALUES($1)',[account.userId]);await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[account.sessionId,account.userId]);await profiles.save(account,{firstName:'Casey',lastName:'Synthetic',age:30,height:{value:68,unit:'in'},weight:{value:155,unit:'lb'},gender:'Unspecified'});}
 let calls=0,mode='valid',lastBody='',lastText='';const provider:OnboardingProvider={mode:'test',model:'mock-fixed',capMicro:7000000,prepare(){throw Error('Intake must never prepare AI')},cost:()=>10,call:async body=>{calls++;lastBody=body;const req=JSON.parse(body);
  if(req.text?.format.name==='training_week'){
   const i=JSON.parse(req.input);return {proposal:{clarification:null,coverage:[],arrangementNote:null,units:'imperial',goalDecisions:[{sourceIndex:0,goalIndex:0,goal:i.summary[0].text,status:'addressed',reason:'The listed sessions support the reported goals.',evidence:[{date:i.dates[0],sessionIndex:3,activityIndex:0}]}],days:i.outline.days.map((d:any)=>({date:d.date,sessions:d.sessions.map((s:any)=>({focus:s.focus,timing:s.timing,estimatedMinutes:20,intervals:[],activities:[{...fixturePrescription('FQ-ACT-00003','repetitions'),sets:2,restSeconds:30,distanceTarget:null,repRange:null,rir:null}]}))}))},usage:{input:10,output:10,cached:0,cacheWrite:0}};
  }
  if(req.text?.format.name==='plain_outline_review')return {proposal:{outlineText:mode==='bad-review'?lastText.replace('Session 1','Changed session'):lastText,scope:[],reply:'The existing sessions are unchanged.',question:null},usage:{input:10,output:10,cached:0,cacheWrite:0}};
  const dates=/(\d{4}-\d{2}-\d{2}) through (\d{4}-\d{2}-\d{2}) inclusive/.exec(req.input)!;
  const days=[];for(let ms=Date.parse(dates[1]+'T12:00:00Z');ms<=Date.parse(dates[2]+'T12:00:00Z');ms+=86400000)days.push(new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(ms)));
  lastText=days.map((d,i)=>`## ${d}\n${i===0?Array.from({length:4},(_,j)=>`- ${j===3?'Optional ':''}Session ${j+1} (15–25 min)\n  Goal: Practice goal ${j+1}`).join('\n'):![2,5].includes(i)?`- Session 1: ${i===6?'Optional ':''}Practice (15–25 min)\n  Goal: Practice steadily`:'Rest — no sessions.'}`).join('\n');
  return {rawText:mode==='invalid'?'Unparseable synthetic result':lastText,...(mode==='refused'?{failure:'refused' as const}:mode==='incomplete'?{failure:'incomplete' as const}:{}),usage:{input:10,output:10,cached:0,cacheWrite:0}};
 }};
 const store=postgresOnboardingStore(pool),intake=onboardingService(store,provider,'test'),plans=planningStore(pool),planner=planningService(plans,provider,'test');
 const answers=['Improve strength and walking. '+ 'Verbatim detail. '.repeat(35),'Walk twice weekly.','Floor, stable raised support and route.','No preference; open to multiple sessions.','None'];
 let conv=await intake.create(a,'America/New_York',1);
 await t.test('five progressive edits/resume are free; exact answers survive completion and ownership checks',async()=>{
  assert.deepEqual(conv.context.intake,{version:1,answers:[]});assert.equal(conv.intakeQuestions?.length,5);
  const budget=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
  await assert.rejects(intake.command(a,conv.id,{kind:'edit',topic:'intake:3',itemId:null,value:'No preference',operationId:randomUUID(),expectedRevision:0},async()=>true),{code:'invalid_intake'});
  for(let index=0;index<5;index++){
   const cmd={kind:'edit' as const,topic:`intake:${index}`,itemId:null,value:answers[index]!,operationId:randomUUID(),expectedRevision:conv.revision};
   const result=await intake.command(a,conv.id,cmd,async()=>true);assert(!('deleted'in result));conv=result;
   assert.deepEqual((await store.read(a,conv.id)).context.intake?.answers,answers.slice(0,index+1));assert.equal(calls,0);
   await intake.command(a,conv.id,cmd,async()=>true);assert.equal((await store.read(a,conv.id)).revision,conv.revision);
  }
  await assert.rejects(store.read(b,conv.id),{code:'not_found'});
  const edited=await intake.command(a,conv.id,{kind:'edit',topic:'intake:1',itemId:null,value:'Walking and bodyweight practice.',operationId:randomUUID(),expectedRevision:conv.revision},async()=>true);assert(!('deleted'in edited));conv=edited;answers[1]='Walking and bodyweight practice.';
  assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,budget);assert.equal((await owner.query('SELECT count(*) FROM fitquest.onboarding_attempts WHERE user_id=$1',[a.userId])).rows[0].count,'0');
  const result=await intake.command(a,conv.id,{kind:'confirm',reviewedRevision:conv.revision,expectedRevision:conv.revision,operationId:randomUUID()},async()=>true);assert('deleted'in result&&result.summarySaved);assert.equal(calls,0);
  for(const table of ['onboarding_conversations','onboarding_turns','onboarding_context_revisions','onboarding_operations'])assert.equal((await owner.query(`SELECT count(*) FROM fitquest.${table} WHERE user_id=$1`,[a.userId])).rows[0].count,'0');
  assert.deepEqual(intakeAnswers((await plans.read(a)).summary.document),answers);assert('deleted'in await intake.read(a,conv.id));
 });
 await t.test('one metered plain outline; failed conversion/refusal/incomplete recover explicitly; free reopen and duplicate protection',async()=>{
  let state=await plans.read(a),plan=state.plans[0];const r={summaryRevision:state.summary.revision,planId:plan.id,target:'outline',retryAttempt:null as string|null};
  for(const failure of ['invalid','refused','incomplete']){mode=failure;const before=calls;state=await planner.generate(a,r,async()=>true);plan=state.plans[0];assert.equal(calls,before+1);assert.equal(plan.outline,null);assert(plan.jobs[0].rawResponse);assert.equal(plan.jobs[0].status,'failed');await planner.generate(a,r,async()=>true);assert.equal(calls,before+1);r.retryAttempt=plan.jobs[0].attemptId;}
  mode='valid';const before=calls;await Promise.all([planner.generate(a,r,async()=>true),planner.generate(a,r,async()=>true)]);state=await plans.read(a);plan=state.plans[0];assert.equal(calls,before+1);assert.equal(JSON.parse(lastBody).input,initialOutlinePrompt(answers,plan.dates));assert.equal(plan.outline.originalResponse,lastText);assert.equal(plan.outline.days[0].sessions.length,4);assert.equal(plan.outline.nutrition,undefined);assert.deepEqual(plan.outline.days[0].sessions[0].plain.durationRange,{min:15,max:25});
  await planner.generate(a,r,async()=>true);assert.equal(calls,before+1);assert.equal((await plans.read(b)).plans.length,0);
  await assert.rejects(planner.generate(b,r,async()=>true));
  // Simulate a settled response rejected by the previous comma-heading adapter.
  lastText=lastText.replace(/^## (\w+)$/gm,(line,day)=>{const date=plan.dates.find((d:string)=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'))===day);return `### ${day}, ${date}`});
  await owner.query("UPDATE fitquest.training_plans SET outline=NULL,review_revision=0 WHERE user_id=$1 AND id=$2",[a.userId,plan.id]);
  await owner.query("UPDATE fitquest.training_generations SET status='failed',error_code='outline_conversion',raw_response=$3 WHERE user_id=$1 AND plan_id=$2 AND target='outline'",[a.userId,plan.id,lastText]);
  state=await plans.read(a);plan=state.plans[0];assert.equal(plan.outline,null);const repair={...r,retryAttempt:plan.jobs[0].attemptId};const beforeRepair=calls,budget=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
  await Promise.all([planner.generate(a,repair,async()=>true),planner.generate(a,repair,async()=>true)]);plan=(await plans.read(a)).plans[0];assert.equal(calls,beforeRepair);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,budget);assert.equal(plan.outline.originalResponse,lastText);assert.equal(plan.planRevision,1);assert.equal(plan.dates.length,7);assert.equal(new Date(plan.dates[0]+'T12:00:00Z').getUTCDay(),1);assert.equal(plan.outline.days.filter((d:any)=>d.sessions.length).length,5);

 });
 await t.test('plain outline review preserves content and confirmation creates every catalog session without three-session quota',async()=>{
  let plan=(await plans.read(a)).plans[0];const outline=structuredClone(plan.outline);mode='bad-review';const badReview={summaryRevision:plan.summaryRevision,planId:plan.id,planRevision:plan.planRevision,feedback:'Keep the entire week unchanged.',retryAttempt:null as string|null};await planner.review(a,badReview,async()=>true);plan=(await plans.read(a)).plans[0];assert.deepEqual(plan.outline,outline);assert.equal(plan.planRevision,1);const failed=plan.jobs.find((j:any)=>j.target==='review:1');assert.equal(failed.error,'saved_day_changed');assert(failed.rawResponse.includes('Changed session'));mode='valid';await planner.review(a,{summaryRevision:plan.summaryRevision,planId:plan.id,planRevision:plan.planRevision,feedback:'Keep the entire week unchanged.',retryAttempt:failed.attemptId},async()=>true);plan=(await plans.read(a)).plans[0];assert.deepEqual(plan.outline,outline);assert.equal(plan.planRevision,2);
  const r={summaryRevision:plan.summaryRevision,planId:plan.id,planRevision:plan.planRevision,confirmOutline:true,target:'week',retryAttempt:null};const before=calls;
  await planner.generate(a,r,async()=>true);plan=(await plans.read(a)).plans[0];assert.equal(plan.jobs.find((j:any)=>j.target==='details:2').error,null);assert.equal(plan.reviewState,'accepted');assert.equal(plan.days.length,plan.dates.length);assert.equal(plan.days[0].detail.sessions.length,4);assert.deepEqual(plan.outline, {...outline,qualityVersion:2,units:'imperial',goalDecisions:plan.outline.goalDecisions});
  const budget=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;await planner.generate(a,r,async()=>true);await plans.read(a);assert.equal(calls,before+1);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,budget);
 });
}
