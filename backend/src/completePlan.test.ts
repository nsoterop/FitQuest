import test from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';
import { createHash } from 'node:crypto';
import { completeSelectionCatalog as selectionCatalog } from './activityCatalog.js';
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
// Independently specified synthetic answers/template; never derived from completePrompt.
const workflowAnswers=['General strength & comfortable walking','Two easy walks; no lifting currently','Dumbbells, floor & a safe outdoor route','I prefer separate sessions.\nEach session: 20–40 minutes; three days available.','None'];
const workflowInput={...input,summary:intakeSummary({version:1,answers:workflowAnswers})};
const expectedWorkflow=`I want you to come up with an exercise plan for me.

My goals are: General strength & comfortable walking.
My current activity is: Two easy walks; no lifting currently.
My available equipment is: Dumbbells, floor & a safe outdoor route.
My training preferences are: I prefer separate sessions.
Each session: 20–40 minutes; three days available..
My limitations are: None.

Build a complete plan for Monday 2026-10-05 through Sunday 2026-10-11
to help me achieve my goals. Plan the entire week, even if some
of those days have already passed.

First, create the high-level weekly outline: each day's session(s),
with each session's name, goal, timing and approximate duration.
Choose the training structure and session distribution that best
fit my goals, availability and limitations.

Next, create the workout for every session in that outline,
including exercises or activities with appropriate sets,
repetitions, time, distance, recovery and effort targets.
Preserve the outline's days and separate sessions when adding
the workouts.

Select exercises and activities only from the supplied catalog.
Reference each selected activity by its exact catalog ID and
respect its equipment, setup and tracking requirements. You
choose the programming; the catalog supplies the available
activities, not predetermined routines.

If the catalog cannot support part of the plan, identify the
specific gap rather than inventing an exercise or catalog ID.

Finally, format the complete plan using the provided response
schema. Formatting must preserve the sessions and prescriptions,
not merge, drop, move or rewrite them. Return only the final
complete week, including all session details.

Exercise catalog:
`;
const catalogBytes=JSON.stringify({encoding:'Rows align with columns. Numeric cells index strings; string and array cells are literal.',...selectionCatalog});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function assertWorkflowRequest(body:any){
 assert.equal(body.input,expectedWorkflow+catalogBytes);
 // Representation fingerprints updated for explicit units and derived tracking metadata;
 // the independently written coaching template is unchanged; effort is now high.
 assert.equal(sha(body.input.slice(expectedWorkflow.length)),'2462711bea940228298fd6d526571542bbfb5c7f8732046ec969236dfdf1dabd');
 assert.equal(sha(JSON.stringify(body.text.format.schema)),'263b2911112487c20c34a1af56bfa57ff946d763843dbdaa22306ebaf1f21bb3');
 const {input:prompt,text,...settings}=body;
 assert.deepEqual(settings,{model:'gpt-6-luna',store:false,stream:false,truncation:'disabled',service_tier:'default',reasoning:{effort:'high'},max_output_tokens:48000});
 assert.deepEqual({...text.format,schema:undefined},{type:'json_schema',name:'complete_week_units_v2',strict:true,schema:undefined});
 assert.deepEqual(Object.keys(text),['format']);
 assert(prompt.indexOf('First, create')<prompt.indexOf('Next, create')&&prompt.indexOf('Next, create')<prompt.indexOf('Finally, format'));
}
test('workflow request exactly matches independent template and verbatim answers; coaching substance stays unchanged at high reasoning effort',()=>{
 assertWorkflowRequest(JSON.parse(prepareComplete({...provider,model:'gpt-6-luna'},workflowInput).body));
 assert.equal(completePrompt(workflowAnswers,dates),expectedWorkflow+catalogBytes);
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
  calls++;const request=JSON.parse(String(init!.body));assertWorkflowRequest(request);assert(new Ajv().compile(request.text.format.schema)(wire()));
  return new Response(JSON.stringify({status,usage:{input_tokens:100,output_tokens:2500},output:[{type:'message',content:[refusal?{type:'refusal',refusal:'Synthetic refusal'}:{type:'output_text',text:JSON.stringify(wire())}]}]}),{headers:{'x-request-id':'req_complete_synthetic'}});
 });
 const prepared=prepareComplete(p,workflowInput);let reply=await p.call(prepared.body,new AbortController().signal);assert.equal(calls,1);assert.equal(reply.failure,undefined);assert.equal(reply.usage!.output,2500);assert.equal(checkComplete(reply.proposal,input).result.kind,'plan');assert.equal(reply.rawText,undefined);
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

// Captured from the preceding low-effort release, excluding only reasoning.
test('initial and revision use high effort with otherwise byte-identical requests and bounded accounting',async()=>{
 const {openAIProvider}=await import('./onboardingProvider.js');
 const {weeklyLimits}=await import('./weeklyPlanning.js');
 assert.deepEqual(weeklyLimits,{inputBytes:450000,outputTokens:48000,responseBytes:512000,timeoutMs:180000,leaseSeconds:195});
 let calls=0;
 const p=openAIProvider({key:'synthetic-not-a-secret',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5},async(_url,init)=>{
  calls++;const body=JSON.parse(String(init!.body));assert.deepEqual(body.reasoning,{effort:'high'});assert.equal(body.model,'gpt-6-luna');
  return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:2500},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(wire())}]}]}));
 });
 const cases=[{input,hash:'08cddd444ddd5432a95157a131de2d15c3e44815930f8e0053ac851d9d6f45b5'},
  {input:{...input,completeReview:{plan:completeFixture(dates),feedback:'Change Tuesday to be shorter. Keep Monday unchanged.'}},hash:'2d1d14a1c72509d0ff30ef12ce1f6b76b11d42b755f3df3b522a80fbfa03b1d4'}];
 for(const c of cases){const prepared=prepareComplete(p,c.input),body=JSON.parse(prepared.body);assert.deepEqual(body.reasoning,{effort:'high'});delete body.reasoning;assert.equal(sha(JSON.stringify(body)),c.hash);
  assert.equal(prepared.reserveMicro,p.cost({input:Buffer.byteLength(prepared.body),output:48000,cached:0,cacheWrite:0}));
  const before=calls,reply=await p.call(prepared.body,new AbortController().signal);assert.equal(calls,before+1);assert.equal(reply.failure,undefined);assert.equal(checkComplete(reply.proposal,c.input).result.kind,'plan');
 }
});
