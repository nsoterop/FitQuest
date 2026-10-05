import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { ProfileStore } from './profileStore.js';
import { coachingRecords } from './coachingLiveFixture.js';
import { distributedReport } from './coachingCases.js';
import { openAIProvider,type OnboardingProvider } from './onboardingProvider.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import { onboardingService } from './onboarding.js';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { buildApp } from './app.js';

// Recorded real replies, replayed through HTTP/services and isolated PostgreSQL.
// This fixture never connects to OpenAI or the hosted ledger.
export async function verifyCoachingDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore){
 await t.test('recorded live summary/week/revision persist atomically; rejected revision preserves draft; explicit acceptance and fresh reopen make zero calls',async()=>{
  const account={userId:randomUUID(),sessionId:randomUUID()};
  await owner.query('INSERT INTO auth.users(id) VALUES($1)',[account.userId]);await owner.query('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[account.sessionId,account.userId]);
  await profiles.save(account,{firstName:'Case',lastName:'Synthetic',age:34,height:{value:69,unit:'in'},weight:{value:162,unit:'lb'},gender:'Prefer not to say'});
  const stages=['onboarding-repair','distributed','review','review-repair'];let calls=0;
  const adapter=openAIProvider({key:'never-dispatched',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5},async()=>{throw Error('No network in recorded replay')});
  const provider:OnboardingProvider={...adapter,mode:'test',call:async body=>{
    const stage=stages[calls++],record=coachingRecords.find(r=>r.stage===stage)!;assert.ok(record,'Unexpected additional provider call');
    const wire=JSON.parse(body);if(record.stage!=='onboarding-repair'){
      const input=JSON.parse(wire.input);assert.deepEqual(input.summary,record.input.summary);assert.deepEqual(input.dates,record.input.dates);assert.doesNotMatch(JSON.stringify(wire.text.format.schema),/uniqueItems/);
      if(record.stage.startsWith('review'))assert.equal(input.review.feedback,record.input.review.feedback);
    }
    return {proposal:structuredClone(record.raw),usage:record.usage};
  }};
  const onboard=postgresOnboardingStore(pool),onboarding=onboardingService(onboard,provider,'test'),store=planningStore(pool),service=planningService(store,provider,'test');
  const app=buildApp(false,{store:profiles,verifyAccount:async token=>token==='coaching-fixture'?account:null,onboarding,planning:service});t.after(()=>app.close());
  const request=(url:string,payload?:object)=>app.inject({method:payload?'POST':'GET',url,payload,headers:{authorization:'Bearer coaching-fixture'}});
  const a=await onboard.create(account),reply=await request(`/onboarding/${a.id}/commands`,{kind:'message',text:distributedReport,operationId:randomUUID(),expectedRevision:a.revision});assert.equal(reply.statusCode,200);
  const current=reply.json();assert.equal(current.turns.at(-1).state,'completed',JSON.stringify({error:current.turns.at(-1)?.error,calls}));assert.equal(calls,1);
  const completed=await request(`/onboarding/${a.id}/commands`,{kind:'confirm',operationId:randomUUID(),expectedRevision:current.revision,reviewedRevision:current.revision});assert.equal(completed.statusCode,200);assert.equal(completed.json().deleted,true);assert.equal(calls,1);
  await assert.rejects(onboard.read(account,a.id),{code:'not_found'});
  // Replay the historical one-response release as a legacy saved plan.
  await owner.query('UPDATE fitquest.training_plans SET outline_first=false WHERE user_id=$1',[account.userId]);
  const state=await store.read(account),p=state.plans[0],initial=coachingRecords.find(r=>r.stage==='distributed')!;
  assert.deepEqual(state.summary!.document,initial.input.summary);
  // Keep recorded dates stable when this synthetic fixture runs on later calendar days.
  await owner.query('UPDATE fitquest.training_plans SET dates=$3 WHERE user_id=$1 AND id=$2',[account.userId,p.id,JSON.stringify(initial.input.dates)]);
  const generated=await request('/training/generate',{planId:p.id,summaryRevision:p.summaryRevision,target:'week',retryAttempt:null});assert.equal(generated.statusCode,200);
  let plan=generated.json().plans[0];assert.equal(plan.days.length,7);assert.equal(plan.planRevision,1);assert.equal(calls,2);const draft=structuredClone(plan.days);
  const feedback=coachingRecords.find(r=>r.stage==='review-repair')!.input.review.feedback;
  const revision={planId:p.id,summaryRevision:p.summaryRevision,planRevision:1,feedback,retryAttempt:null};
  const rejected=await request('/training/review',revision);assert.equal(rejected.statusCode,200);plan=rejected.json().plans[0];assert.deepEqual(plan.days,draft);assert.equal(plan.planRevision,1);assert.equal(plan.jobs.find((j:any)=>j.target==='review:1').status,'failed');
  const retryAttempt=plan.jobs.find((j:any)=>j.target==='review:1').attemptId;
  const revised=await request('/training/review',{...revision,retryAttempt});assert.equal(revised.statusCode,200);plan=revised.json().plans[0];assert.equal(plan.planRevision,2);assert.equal(calls,4);
  assert.deepEqual(plan.days[0].detail.sessions[0],draft[0].detail.sessions[0]);assert.deepEqual(plan.days[5],draft[5]);
  for(const index of [0,2])for(const activityIndex of [0,2,3])assert.deepEqual(plan.days[index].detail.sessions[1].activities[activityIndex],draft[index].detail.sessions[1].activities[activityIndex]);
  assert.equal(revised.json().summary.preferences.length,0);
  const before=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
  const accepted=await request('/training/accept',{planId:p.id,summaryRevision:p.summaryRevision,planRevision:2});assert.equal(accepted.statusCode,200);assert.equal(accepted.json().plans[0].reviewState,'accepted');
  const reopened=await planningService(planningStore(pool),provider,'test').read(account);assert.equal(reopened.plans[0].reviewState,'accepted');assert.deepEqual(reopened.plans[0].days,plan.days);assert.equal(calls,4);assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows,before);
 });
}
