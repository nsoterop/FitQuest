import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlainOutline } from './plainOutline.js';
import { intakeSummary } from './fixedIntake.js';
import { checkWeek,prepareWeek } from './weeklyPlanning.js';
import { openAIProvider } from './onboardingProvider.js';
import { plainDetailReply,checkSyntheticWire } from './plainDetailFixture.js';
import { validationFailureCode,PlanValidationError } from './planningValidation.js';
import type { PlanningInput } from './planningDomain.js';

const dates=Array.from({length:7},(_,i)=>`2026-10-${String(i+5).padStart(2,'0')}`);
const text=dates.map((date,i)=>`## ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}, ${date}\n${i===6?'Rest — no sessions.':`- Strength and walking practice with a deliberately descriptive title longer than sixty-four characters\n  Goal: Strength and comfortable walking\n  Duration: 20–30 minutes\n- Optional mobility practice\n  Goal: Gentle movement\n  Timing: Evening\n  Duration: 15–25 minutes`}`).join('\n');
const input:PlanningInput={kind:'week',outlineFirst:true,draftReview:true,qualityVersion:2,approvedOutlineRevision:1,
  dates,profile:{age:30,heightInches:68,weightLb:155},summary:intakeSummary({version:1,answers:['Strength and walking','Walking weekly','Clear floor, firm raised support and a walking route','No preference; multiple sessions are fine','None']}),outline:parsePlainOutline(text,dates)};
const config={key:'synthetic-not-a-secret',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5};

test('plain approved week passes actual provider wire, response adapter and all detail validators',async()=>{
  let calls=0;
  const provider=openAIProvider(config,async(_url,init)=>{
    calls++;const body=String(init!.body),request=JSON.parse(body),payload=JSON.parse(request.input),reply=plainDetailReply(payload);
    checkSyntheticWire(body,reply);assert.deepEqual(payload.outline,input.outline);assert.deepEqual(payload.dates,dates);
    assert.doesNotMatch(request.instructions,/Null timing is only for unchanged legacy/);
    assert.match(request.instructions,/including null when no supported time of day/);
    assert.match(request.instructions,/null for all cooldown prescriptions/);
    assert.match(request.instructions,/optional session still needs main-phase work/);
    return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]}),{headers:{'x-request-id':'req_synthetic_success'}});
  });
  const result=await provider.call(prepareWeek(provider,input).body,new AbortController().signal);
  assert.equal(calls,1);assert.deepEqual(result.diagnostic,{httpStatus:200,requestId:'req_synthetic_success'});
  const checked=checkWeek(result.proposal,input);assert.equal(checked.details.length,7);assert.deepEqual(checked.details[6]!.sessions,[]);
  assert.equal(checked.details[0]!.sessions[0]!.timing,null);assert.equal(checked.details[0]!.sessions[1]!.timing,'evening');
  assert.deepEqual(checked.outline.days,input.outline!.days);assert(checked.outline.days[0]!.sessions[1]!.plain!.optional);
  assert.equal(checked.details[0]!.sessions[0]!.activities[2]!.rir,null);
});

test('detail wire rejects cooldown/non-repetition RIR and excessive or fractional quantities before runtime checks',()=>{
  const body=prepareWeek(openAIProvider(config),input).body;
  for(const mutate of [(r:any)=>{r.days[0].sessions[0].activities[2].rir=3},(r:any)=>{r.days[0].sessions[0].activities[0].rir=2},(r:any)=>{r.days[0].sessions[0].activities[1].amount=8.5},(r:any)=>{r.days[0].sessions[0].activities[2].amount=101}]){const raw=plainDetailReply(input);mutate(raw);assert.throws(()=>checkSyntheticWire(body,raw));}
});

test('cooldown RIR, load and prescription failures are classified without weakening validation',()=>{
  for(const [check,mutate] of [
    ['rir',(r:any)=>{r.days[0].sessions[0].activities[2].rir=3}],
    ['load',(r:any)=>{r.days[0].sessions[0].activities[2].load='self_selected'}],
    ['rep_range',(r:any)=>{r.days[0].sessions[0].activities[1].repRange.max=8}],
    ['distance_conversion',(r:any)=>{r.days[0].sessions[0].activities[0].amount=805}],
    ['goal_identity',(r:any)=>{r.goalDecisions[0].goal='Private replacement text must never enter diagnostics'}],
    ['goal_evidence',(r:any)=>{r.goalDecisions[0].evidence[0].activityIndex=2}],
    ['week_dates',(r:any)=>{r.days.shift()}],
    ['week_schema',(r:any)=>{r['Private arbitrary property']='Private value'}],
  ] as const){
    const raw=plainDetailReply(input);mutate(raw);
    assert.throws(()=>checkWeek(raw,input),e=>{assert(e instanceof PlanValidationError);assert.equal(e.code,'invalid_plan');assert.equal(e.check,check);assert.match(validationFailureCode(e)!,new RegExp(`^invalid_plan:${check}(?::[0-9]+)*$`));assert(!validationFailureCode(e)!.includes('Private'));return true});
  }
  assert.equal(validationFailureCode(new Error('private body')),undefined);
  assert.equal(validationFailureCode(new PlanValidationError('load',[NaN])),'invalid_plan');
});

test('approved timing and session arrangement remain immutable; interval checks cover the plain path',()=>{
  const raw=plainDetailReply(input),s=raw.days[0]!.sessions[0]!;
  s.timing='flexible';assert.throws(()=>checkWeek(raw,input),{code:'approved_outline_changed'});s.timing=null;
  const walk={...s.activities[0]!,phase:'main' as const,measure:'seconds' as const,amount:60,sets:3,distanceTarget:null};
  s.activities=[walk,{...walk,sets:2,effort:'easy'}];s.intervals=[{workIndex:0,recoveryIndex:1,recoveries:'between'}];raw.goalDecisions![0]!.evidence[0]!.activityIndex=0;
  assert.equal(checkWeek(raw,input).details.length,7);
  s.activities[1]!.sets=3;assert.throws(()=>checkWeek(raw,input),e=>validationFailureCode(e)==='invalid_plan:interval_prescription:0:0:0');
});
