import test from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';
import { completeFixture,syntheticAnswers } from './completePlanFixture.js';
import { completeResponseSchema,encodeCompleteWire,decodeCompleteWire } from './completePlanWire.js';
import { checkComplete,completePrompt,prepareComplete } from './completePlanning.js';
import { planOverview,recoveryCount,distanceMeters } from './completePlanContract.js';
import { intakeSummary } from './fixedIntake.js';
import { planDates } from './trainingSummary.js';
import type { PlanningInput } from './planningDomain.js';
import type { OnboardingProvider } from './onboardingProvider.js';
const dates=planDates('America/New_York',new Date('2026-10-07T12:00:00Z'));
const input:PlanningInput={kind:'week',schemaVersion:'complete-week-v1',dates,summary:intakeSummary({version:1,answers:syntheticAnswers}),profile:{age:30,heightInches:68,weightLb:155}};
const provider={model:'mock',cost:()=>10} as unknown as OnboardingProvider;
const wire=(p=completeFixture(dates))=>encodeCompleteWire({result:{kind:'plan',plan:p}});
test('strict complete wire uses required object properties, compatible keywords and at most ten container levels including active recovery',()=>{
 const root=completeResponseSchema as any;let max=0;const forbidden=['allOf','not','if','then','else','uniqueItems'];
 function visit(s:any,depth=0){if(s.$ref)return visit(root.$defs[s.$ref.split('/').at(-1)],depth);assert(!forbidden.some(k=>k in s));
  const d=depth+(s.type==='object'||s.type==='array'?1:0);max=Math.max(max,d);
  if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));Object.values(s.properties).forEach(v=>visit(v,d));}
  if(s.items)visit(s.items,d);if(s.anyOf)s.anyOf.forEach((v:any)=>visit(v,d));}
 visit(root);assert.equal(max,10);assert.equal(root.type,'object');assert.equal(root.anyOf,undefined);
 const valid=new Ajv({strict:true}).compile(root);assert(valid(wire()));const bad=wire() as any;bad.result.days[0].sessions[0].blocks[0].exercises[0].extra='private';assert(!valid(bad));
});
test('complete prompt faithfully contains only the approved answers, dates and eligible catalog; full-week reservation',()=>{
 const body=JSON.parse(prepareComplete(provider,input).body);assert.equal(body.input,completePrompt(syntheticAnswers,dates));assert.equal(body.instructions,undefined);assert.equal(body.max_output_tokens,48000);assert.equal(body.reasoning.effort,'low');assert.equal(body.text.format.name,'complete_week');
 assert.match(body.input,/Monday 2026-10-05 through Sunday 2026-10-11/);assert(!body.input.includes('goalDecisions'));for(const a of syntheticAnswers)assert(body.input.includes(a));assert(!body.input.includes('FQ-ACT-00161'));
});
test('mixed multi-session, ranges, distance, per-side lifting, circuits and active/passive/instruction recovery round-trip exactly',()=>{
 const p=completeFixture(dates),s=p.days[0]!.sessions[0]!;
 const lift={activityId:'FQ-ACT-00046',target:{kind:'repetitions' as const,reps:{min:8,max:12}},perSide:true,load:{value:10,unit:'lb' as const},loadInstruction:null,effort:{rpe:null,rir:{min:2,max:3},cue:null}};
 s.blocks.push({phase:'main',optional:false,rounds:4,exercises:[lift,{...structuredClone(lift),activityId:'FQ-ACT-00047'}],recovery:{placement:'after_each_round',activity:{activityId:'FQ-ACT-00148',target:{kind:'distance',distance:{min:0.1,max:0.15},unit:'mi'},perSide:false,load:null,loadInstruction:null,effort:null},restSeconds:null,instruction:'Keep the pace easy.'}});
 s.blocks.push({phase:'cooldown',optional:true,rounds:1,exercises:[structuredClone(p.days[1]!.sessions[0]!.blocks[0]!.exercises[0]!)],recovery:{placement:'after_each_round',activity:null,restSeconds:null,instruction:'Continue once breathing settles.'}});
 assert.deepEqual(decodeCompleteWire(wire(p)),{result:{kind:'plan',plan:p}});assert.deepEqual(checkComplete(wire(p),input),{result:{kind:'plan',plan:p}});
 assert.equal(recoveryCount(s.blocks[0]!),2);assert.equal(recoveryCount(s.blocks[1]!),4);assert.equal(distanceMeters(.1,'mi'),160.9344);
 const overview=planOverview(p);assert(!JSON.stringify(overview).includes('activityId'));assert(!JSON.stringify(overview).includes('blocks'));assert.equal(overview.days[0]!.sessions.length,2);assert.deepEqual(overview.days[2]!.sessions,[]);
});
test('invalid ranges, load, tracking, IDs, empty/ambiguous recovery, dates and wire pairs cannot become complete drafts',()=>{
 for(const mutate of [
  (p:any)=>p.days[0].sessions[0].durationMinutes.min=99,
  (p:any)=>p.days[0].date=dates[1],
  (p:any)=>p.days[0].sessions[0].blocks[0].rounds=0,
  (p:any)=>p.days[0].sessions[0].blocks[0].rounds=1,
  (p:any)=>p.days[0].sessions[0].blocks[0].recovery.activity=structuredClone(p.days[0].sessions[0].blocks[0].exercises[0]),
  (p:any)=>p.days[0].sessions[0].blocks[0].recovery.restSeconds=null,
  (p:any)=>p.days[0].sessions[0].blocks[0].exercises[0].activityId='FQ-ACT-00161',
  (p:any)=>p.days[0].sessions[0].blocks[0].exercises[0].target={kind:'repetitions',reps:{min:2,max:3}},
  (p:any)=>p.days[0].sessions[0].blocks[0].exercises[0].load={value:10,unit:'kg'},
  (p:any)=>p.days[0].sessions[0].blocks[0].exercises[0].effort.rpe.max=11,
 ]){const p=completeFixture(dates);mutate(p);assert.throws(()=>checkComplete(wire(p),input));}
 const w=wire() as any;w.result.days[0].sessions[0].blocks[0].exercises[0].rpeMax=null;assert.throws(()=>checkComplete(w,input));
 const empty=completeFixture(dates);empty.days.forEach(d=>d.sessions=[]);assert.throws(()=>checkComplete(wire(empty),input));empty.catalogGaps=[{goal:'Requested facility sport',reason:'The required facility is unavailable.'}];assert.equal(checkComplete(wire(empty),input).result.kind,'plan');
 assert.deepEqual(checkComplete({result:{kind:'unavailable',reason:'The requested equipment is not available.'}},input),{result:{kind:'unavailable',reason:'The requested equipment is not available.'}});
});
test('complete revisions preserve explicit kept sessions and exact block recovery without old index-based response evidence',()=>{
 const p=completeFixture(dates),next=structuredClone(p);next.days[1]!.sessions[0]!.durationMinutes={min:10,max:15};
 const review={...input,completeReview:{plan:p,feedback:'Change Tuesday to be shorter. Keep Monday unchanged.'}};
 assert.equal(checkComplete(wire(next),review).result.kind,'plan');next.days[0]!.sessions[0]!.blocks[0]!.rounds=4;
 assert.throws(()=>checkComplete(wire(next),review),{code:'saved_day_changed'});
});

test('actual OpenAI adapter allows the complete-week limits and distinguishes refusal/truncation without a second dispatch',async()=>{
 const {openAIProvider}=await import('./onboardingProvider.js');let calls=0,status='completed',refusal=false;
 const p=openAIProvider({key:'synthetic-not-a-secret',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5},async(_url,init)=>{
  calls++;const request=JSON.parse(String(init!.body));assert.equal(request.max_output_tokens,48000);assert(new Ajv().compile(request.text.format.schema)(wire()));
  return new Response(JSON.stringify({status,usage:{input_tokens:100,output_tokens:2500},output:[{type:'message',content:[refusal?{type:'refusal',refusal:'Synthetic refusal'}:{type:'output_text',text:JSON.stringify(wire())}]}]}),{headers:{'x-request-id':'req_complete_synthetic'}});
 });
 const prepared=prepareComplete(p,input);let reply=await p.call(prepared.body,new AbortController().signal);assert.equal(calls,1);assert.equal(reply.failure,undefined);assert.equal(reply.usage!.output,2500);assert.equal(checkComplete(reply.proposal,input).result.kind,'plan');assert.equal(reply.rawText,undefined);
 status='incomplete';reply=await p.call(prepared.body,new AbortController().signal);assert.equal(reply.failure,'incomplete');assert.equal(reply.usage!.output,2500);refusal=true;status='completed';reply=await p.call(prepared.body,new AbortController().signal);assert.equal(reply.failure,'refused');assert.equal(calls,3);
});

test('catalog restrictions and numeric load conventions apply to work and active recovery alike',()=>{
 const plan=completeFixture(dates);const e=plan.days[0]!.sessions[0]!.blocks[0]!.exercises[0]!;
 e.activityId='FQ-ACT-00046';e.target={kind:'repetitions',reps:{min:8,max:12}};e.load={value:10,unit:'kg'};
 assert.equal(checkComplete(wire(plan),input).result.kind,'plan');
 const limited={...input,summary:intakeSummary({version:1,answers:syntheticAnswers.map((s,i)=>i===2?'No equipment':s)})};assert.throws(()=>checkComplete(wire(plan),limited),{code:'catalog_coverage'});
 e.activityId='FQ-ACT-00001';assert.throws(()=>checkComplete(wire(plan),input),{code:'invalid_plan:load'});
 const recovery=completeFixture(dates);recovery.days[0]!.sessions[0]!.blocks[0]!.recovery={placement:'between_rounds',activity:{...e,activityId:'FQ-ACT-00161',load:null},restSeconds:null,instruction:null};assert.throws(()=>checkComplete(wire(recovery),input),{code:'catalog_coverage'});
});
