import { weeklyLiveFixture } from './weeklyLiveFixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleActivities,trackingModes } from './activityCatalog.js';
import { fixtureDetail,fixtureOutline,trainingFixture } from './planningFixture.js';
import { sevenDates } from './trainingSummary.js';
import { checkWeek,prepareWeek,weeklyLimits,type Week } from './weeklyPlanning.js';
import { openAIProvider } from './onboardingProvider.js';
import type { PlanningInput } from './planningDomain.js';
const dates=sevenDates('UTC'),outline=fixtureOutline(dates);
const input:PlanningInput={kind:'week',summary:trainingFixture,profile:{age:30,heightInches:68,weightLb:155},dates};
export function weekFixture():Week {return {clarification:null,coverage:[],days:outline.days.map(d=>({date:d.date,sessions:fixtureDetail(outline,d.date).sessions.map((s,i)=>({...s,focus:d.sessions[i]!.focus}))}))}}
const config={key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5};
test('single weekly request contains lossless full eligible catalog, finite bounds and conservative long-context reservation',()=>{
  const provider=openAIProvider(config),prepared=prepareWeek(provider,input),wire=JSON.parse(prepared.body),payload=JSON.parse(wire.input);
  assert.equal(wire.text.format.name,'training_week');assert.equal(wire.max_output_tokens,weeklyLimits.outputTokens);assert.equal(wire.truncation,'disabled');assert.equal(wire.store,false);
  assert.deepEqual(payload.catalog.rows.map((row:unknown[])=>Object.fromEntries(payload.catalog.columns.map((key:string,i:number)=>[key,row[i]]))),eligibleActivities);
  assert.equal(payload.catalog.rows.length,251);assert.equal(payload.catalog.columns.length,28);
  const bytes=Buffer.byteLength(prepared.body);assert.ok(bytes<weeklyLimits.inputBytes);assert.equal(prepared.reserveMicro,Math.ceil(bytes*.125*2+weeklyLimits.outputTokens*.5*1.5));
  assert.match(wire.instructions,/ONE response/);assert.doesNotMatch(wire.instructions,/Do not prescribe all seven days/);
  assert.throws(()=>prepareWeek(provider,{...input,previous:['x'.repeat(weeklyLimits.inputBytes)]}),{code:'planning_context_limit'});
});
test('complete weekly response validates seven dated days, mixed sessions, all prescriptions and no excluded IDs',()=>{
  const week=weekFixture(),result=checkWeek(week,input);assert.equal(result.details.length,7);assert.equal(result.details[0]!.sessions.length,2);
  assert.deepEqual(result.details[5]!.sessions[0]!.activities,week.days[5]!.sessions[0]!.activities);
  assert.equal(result.details.filter(d=>!d.sessions.length).length,4);
  for(const mutate of [(w:Week)=>w.days.pop(),(w:Week)=>{w.days[0]!.date=dates[1]!},(w:Week)=>{w.days[0]!.sessions[0]!.activities[0]!.id='FQ-ACT-00161'},(w:Week)=>{w.days[0]!.sessions[1]!.activities[0]!.measure='repetitions'}]){const bad=structuredClone(week);mutate(bad);assert.throws(()=>checkWeek(bad,input))}
  const count=eligibleActivities.find(a=>trackingModes(a).count)!;const measured=structuredClone(week);const a=measured.days[0]!.sessions[1]!.activities[0]!;a.measure='meters';a.amount=1609;
  const other=structuredClone(a);other.id=String(count['Activity ID']);other.measure='count';other.amount=10;measured.days[0]!.sessions.push({focus:'Skill practice',activities:[other]});
  assert.equal(checkWeek(measured,input).details[0]!.sessions.length,3);
});
test('weekly backfill preserves exact existing prescriptions and outline; information blocks recover without fake rest',()=>{
  const week=weekFixture(),existing={...input,outline,savedDays:[fixtureDetail(outline,dates[0]!)]};
  assert.deepEqual(checkWeek(week,existing).outline,outline);
  const changed=structuredClone(week);changed.days[0]!.sessions[0]!.activities[0]!.amount++;
  assert.throws(()=>checkWeek(changed,existing),{code:'saved_day_changed'});
  const refocused=structuredClone(week);refocused.days[0]!.sessions[0]!.focus='Different';assert.throws(()=>checkWeek(refocused,existing),{code:'invalid_plan'});
  const blocked:Week={clarification:{question:'Is a walking path available this week?',reason:'Safe walking access is necessary for this request.'},coverage:[],days:dates.map(date=>({date,sessions:[]}))};
  const fresh=checkWeek(blocked,input);assert.equal(fresh.details.length,0);assert.ok(fresh.outline.clarification);
  const backfill=checkWeek(blocked,existing);assert.equal(backfill.details.length,1);assert.equal(backfill.details[0]!.date,dates[1]);assert.deepEqual(backfill.outline,outline);
  blocked.days[0]!.sessions=week.days[0]!.sessions;assert.throws(()=>checkWeek(blocked,input),{code:'invalid_plan'});
});
test('weekly adapter accepts output above old 2000-token limit, settles incomplete usage, and rejects excess bytes/tokens',async()=>{
  let response:any;let dispatches=0;
  const provider=openAIProvider(config,async()=>{dispatches++;return new Response(JSON.stringify(response))});const prepared=prepareWeek(provider,input);
  response={status:'completed',usage:{input_tokens:70000,output_tokens:8000},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(weekFixture())}]}]};
  const success=await provider.call(prepared.body,new AbortController().signal);assert.deepEqual(success.proposal,weekFixture());assert.equal(success.usage!.output,8000);assert.equal(provider.cost(success.usage!),12750);assert.equal(dispatches,1);
  response.status='incomplete';const incomplete=await provider.call(prepared.body,new AbortController().signal);assert.equal(incomplete.failure,'incomplete');assert.equal(incomplete.usage!.output,8000);
  response.usage.output_tokens=weeklyLimits.outputTokens+1;assert.equal((await provider.call(prepared.body,new AbortController().signal)).usage,undefined);
  response={status:'completed',padding:'x'.repeat(weeklyLimits.responseBytes)};assert.deepEqual(await provider.call(prepared.body,new AbortController().signal),{failure:'provider_error'});
  const bad=JSON.parse(prepared.body);bad.max_output_tokens++;const before=dispatches;assert.deepEqual(await provider.call(JSON.stringify(bad),new AbortController().signal),{failure:'provider_error'});assert.equal(dispatches,before);
});

test('maximum seven-day/multi-session response and six saved maximum days fit explicit wire/storage bounds without trimming',()=>{
  const base=weekFixture().days[0]!.sessions[0]!.activities[0]!;
  const maximum:Week={clarification:null,coverage:[],days:dates.map(date=>({date,sessions:Array.from({length:3},()=>({focus:'Mobility practice',activities:Array.from({length:15},()=>({...base,sets:20,amount:7200,effort:'challenging',restSeconds:600}))}))}))};
  const checked=checkWeek(maximum,input);assert.equal(checked.details.flatMap(d=>d.sessions.flatMap(s=>s.activities)).length,315);
  const provider=openAIProvider(config),prepared=prepareWeek(provider,{...input,summary:Array.from({length:12},(_,i)=>({...trainingFixture[i%5]!,text:'x'.repeat(350)})),outline:checked.outline,savedDays:checked.details.slice(0,6)});
  const payload=JSON.parse(JSON.parse(prepared.body).input);assert.equal(payload.savedDays.length,6);assert.equal(payload.savedDays.flatMap((d:any)=>d.sessions.flatMap((s:any)=>s.activities)).length,270);
  assert.ok(Buffer.byteLength(prepared.body)<weeklyLimits.inputBytes);assert.ok(Buffer.byteLength(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(maximum)}]}]}))<weeklyLimits.responseBytes);
});


test('recorded one-call Luna week contains every detail, a mixed multi-session day and four rest days',()=>{
  const result=checkWeek(weeklyLiveFixture,{...input,dates:weeklyLiveFixture.days.map(d=>d.date)});
  assert.equal(result.details.length,7);assert.equal(result.details[0]!.sessions.length,2);
  assert.equal(result.details.filter(d=>!d.sessions.length).length,4);
  assert.equal(result.details.flatMap(d=>d.sessions.flatMap(s=>s.activities)).length,14);
  assert.deepEqual([...new Set(result.details.flatMap(d=>d.sessions.flatMap(s=>s.activities.map(a=>a.measure))))].sort(),['meters','repetitions','seconds']);
  assert.equal(result.outline.clarification,null);assert.deepEqual(result.outline.coverage,[]);
});
