import test from 'node:test';
import assert from 'node:assert/strict';
import { openAIProvider } from './onboardingProvider.js';
import { prepareWeek,checkWeek } from './weeklyPlanning.js';
import { reviewInput,reviewWeek } from './planReviewFixture.js';
const config={key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5};
test('HTTP diagnostics retain only bounded allowlisted fields without messages, request bodies or invented free accounting',async()=>{
  for(const [code,requestId,expected] of [['invalid_json_schema','req_abc123',{code:'invalid_json_schema',requestId:'req_abc123'}],['athlete private text','private health detail',{}]] as const){
    const p=openAIProvider(config,async()=>new Response(JSON.stringify({error:{code,message:'Private health report',param:'secret field'}}),{status:400,headers:{'x-request-id':requestId}}));
    const r=await p.call(prepareWeek(p,reviewInput).body,new AbortController().signal);
    assert.deepEqual(r,{failure:'provider_error',diagnostic:{httpStatus:400,...expected}});assert.equal(r.usage,undefined);
  }
  const p=openAIProvider(config,async()=>new Response('invalid json',{headers:{'x-request-id':'req_trace'}}));
  assert.deepEqual((await p.call(prepareWeek(p,reviewInput).body,new AbortController().signal)).diagnostic,{httpStatus:200,requestId:'req_trace',transport:'invalid_response'});
});
test('rep ranges and RIR preserve older prescriptions and reject inverted, inconsistent or non-lifting targets',()=>{
  const week=reviewWeek(),a=week.days[1]!.sessions[0]!.activities[1]!;
  a.repRange={min:8,max:12};a.amount=8;a.rir=2;
  assert.deepEqual(checkWeek(week,reviewInput).details[1]!.sessions[0]!.activities[1],a);
  for(const patch of [{repRange:{min:12,max:8}},{repRange:{min:0,max:12}},{amount:9},{rir:6},{rir:1.5},{measure:'seconds'}]){
    const bad=structuredClone(week);Object.assign(bad.days[1]!.sessions[0]!.activities[1]!,patch);assert.throws(()=>checkWeek(bad,reviewInput));
  }
  assert.ok(checkWeek(reviewWeek(),reviewInput));
});

test('focused limited-equipment synthetic case remains a small focused week, not a universal mixed or split template',async()=>{
  const {coachingCases}=await import('./coachingCases.js');const input=coachingCases.focused;
  const week={arrangementNote:null,units:'imperial',clarification:null,coverage:[],goalDecisions:[{sourceIndex:0,goalIndex:0,goal:input.summary[0]!.goals![0]!,status:'addressed',reason:'Submaximal kneeling push-ups practice the only requested strength goal.',evidence:[{date:input.dates[0],sessionIndex:0,activityIndex:0}]}],days:input.dates.map((date,i)=>({date,sessions:[0,3].includes(i)?[{focus:'Kneeling push-up practice',timing:'flexible',estimatedMinutes:10,intervals:[],activities:[{id:'FQ-ACT-00002',phase:'main',sets:3,measure:'repetitions',amount:4,repRange:{min:4,max:6},rir:3,effort:'moderate',restSeconds:60,load:'none',loadKg:null,side:'both',distanceTarget:null}]}]:[]}))};
  const checked=checkWeek(week,input);assert.equal(checked.details.filter(d=>d.sessions.length).length,2);assert.equal(checked.outline.goalDecisions!.length,1);
  for(const athlete of Object.values(coachingCases)){
    const wire=JSON.parse(prepareWeek(openAIProvider(config),athlete).body);assert.deepEqual(JSON.parse(wire.input).summary,athlete.summary);assert.equal(wire.reasoning.effort,'low');assert.equal(wire.model,'gpt-6-luna');
  }
});

test('constrained single-session synthetic week covers both goals within available days and time',async()=>{
 const {coachingCases}=await import('./coachingCases.js');const input=coachingCases.single;
 const lift={id:'FQ-ACT-00002',phase:'main',sets:2,measure:'repetitions',amount:4,repRange:{min:4,max:6},rir:3,effort:'moderate',restSeconds:60,load:'none',loadKg:null,side:'both',distanceTarget:null};
 const walk={...lift,id:'FQ-ACT-00148',sets:1,measure:'seconds',amount:600,repRange:null,rir:null,effort:'easy',restSeconds:0};
 const week={arrangementNote:null,units:'imperial',clarification:null,coverage:[],goalDecisions:input.summary[0]!.goals!.map((goal,goalIndex)=>({sourceIndex:0,goalIndex,goal,status:'addressed',reason:goalIndex?'Easy continuous walking retains comfortable time on feet.':'Conservative kneeling push-ups introduce floor-based strength.',evidence:[{date:input.dates[1],sessionIndex:0,activityIndex:goalIndex}]})),days:input.dates.map((date,i)=>({date,sessions:[1,4].includes(i)?[{focus:'Strength and easy walking',timing:'evening',estimatedMinutes:20,intervals:[],activities:[lift,walk]}]:[]}))};
 const checked=checkWeek(week,input);assert.equal(checked.details.filter(d=>d.sessions.length).length,2);assert.ok(checked.details.every(d=>d.sessions.length<=1));assert.equal(checked.outline.goalDecisions!.length,2);
});

test('observed repeated closing invitation is removed only at recap endings without changing source facts',async()=>{
 const {coachingRecords}=await import('./coachingLiveFixture.js');const {renderOnboardingReply}=await import('./onboardingReply.js');
 const record=coachingRecords.find(r=>r.stage==='onboarding-repair')!,proposal=structuredClone(record.raw),before=structuredClone(proposal);
 const rendered=renderOnboardingReply(proposal);assert.equal(rendered.includes('Please correct anything I’ve misunderstood or agree if this is right.'),false);assert.equal(rendered.split('Does that capture what matters?').length-1,1);
 assert.match(rendered,/25 minutes/);assert.match(rendered,/40 minutes/);assert.match(rendered,/morning and evening/);assert.deepEqual(proposal,before);
 const fact='Please correct anything I’ve misunderstood or agree if this is right. My schedule is now Tuesday.';
 assert.ok(renderOnboardingReply({...proposal,reply:fact}).includes(fact));
});
