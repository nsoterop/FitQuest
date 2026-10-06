const legacyDates=()=>Array.from({length:7},(_,i)=>`2026-10-${String(i+4).padStart(2,'0')}`);
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWeek,type Week } from './weeklyPlanning.js';
import { fixturePrescription } from './planningFixture.js';
import type { PlanningInput } from './planningDomain.js';
import { planDates } from './trainingSummary.js';

// Invented trained runner, unrelated to production athlete context.
export const qualityInput:PlanningInput={kind:'week',qualityVersion:2,preferredUnits:'imperial',dates:legacyDates(),profile:{age:34,heightInches:69,weightLb:162},summary:[
  {category:'goals',goals:['Walking endurance'],text:'Maintain walking endurance.',origin:'user_report'},
  {category:'goals',goals:['Acceleration technique','Shoulder mobility'],text:'Improve acceleration technique and shoulder mobility.',origin:'user_report'},
  {category:'availability',text:'Prefer morning movement and separate evening mobility on two days; at most 35 minutes total per day, at most 25 per session. Flexible weekdays.',origin:'user_report'},
  {category:'equipment',text:'Flat marked track with safe run-out, suitable shoes, clear standing space.',origin:'user_report'},
  {category:'experience',text:'Regular walking, coached intermediate acceleration technique with six months of recent practice; no flying sprint experience.',origin:'user_report'},
  {category:'limitations',text:'No relevant limitations reported; not independently verified.',origin:'model_inference'}]};
export function qualityWeek():Week {
  const work={...fixturePrescription('FQ-ACT-00145','meters'),sets:4,amount:20,restSeconds:0,distanceTarget:{value:20,unit:'m' as const},effort:'moderate'};
  const walk={...fixturePrescription('FQ-ACT-00148'),amount:60,sets:3,restSeconds:0,distanceTarget:null};
  return {units:'imperial',clarification:null,coverage:[],goalDecisions:[
    {sourceIndex:0,goalIndex:0,goal:'Walking endurance',status:'addressed',reason:'A continuous comfortable walk maintains walking practice.',evidence:[{date:qualityInput.dates[3]!,sessionIndex:0,activityIndex:0}]},
    {sourceIndex:1,goalIndex:0,goal:'Acceleration technique',status:'introductory',reason:'Four controlled short accelerations use established technique and a clear track; no maximal-speed progression.',evidence:[{date:qualityInput.dates[0]!,sessionIndex:0,activityIndex:1}]},
    {sourceIndex:1,goalIndex:1,goal:'Shoulder mobility',status:'addressed',reason:'Separate evening circles provide a short mobility practice.',evidence:[{date:qualityInput.dates[0]!,sessionIndex:1,activityIndex:0}]}
  ],days:qualityInput.dates.map((date,i)=>({date,sessions:i===0?[
    {focus:'Controlled acceleration',timing:'morning',intervals:[{workIndex:1,recoveryIndex:2,recoveries:'between'}],activities:[{...walk,phase:'warmup',sets:1,amount:300},work,walk,{...walk,phase:'cooldown',sets:1,amount:180}]},
    {focus:'Shoulder mobility',timing:'evening',intervals:[],activities:[{...fixturePrescription('FQ-ACT-00112'),amount:60,restSeconds:0,distanceTarget:null}]}
  ]:i===3?[{focus:'Comfortable walking',timing:'flexible',intervals:[],activities:[{...walk,sets:1,amount:1200}]}]:[]}))};
}
test('v2 full week preserves purposeful timing, explicit paired rounds, phases and source-linked goal evidence',()=>{
  const checked=checkWeek(qualityWeek(),qualityInput);
  assert.equal(checked.details.length,7);assert.deepEqual(checked.details[0]!.sessions.map(s=>s.timing),['morning','evening']);
  assert.equal(checked.details[0]!.sessions[0]!.activities[2]!.sets,3);
  assert.deepEqual(checked.outline.goalDecisions?.map(g=>g.goal),['Walking endurance','Acceleration technique','Shoulder mobility']);
  assert.deepEqual(checked.details[0]!.sessions[0]!.activities.map(a=>a.phase),['warmup','main','main','cooldown']);
});
test('v2 rejects missing goal decisions, nonexistent/optional/recovery evidence and wrong distance or interval meaning',()=>{
  const mutations:((w:Week)=>void)[]=[w=>{delete w.goalDecisions},w=>{w.goalDecisions!.shift()},w=>{w.goalDecisions![0]!.evidence[0]!.activityIndex=14},w=>{w.days[3]!.sessions[0]!.activities[0]!.phase='optional'},w=>{w.goalDecisions![1]!.evidence[0]!.activityIndex=2},w=>{w.days[0]!.sessions[0]!.activities[1]!.amount=30},w=>{w.days[0]!.sessions[0]!.activities[2]!.sets=4},w=>{w.days[0]!.sessions[0]!.intervals![0]!.recoveryIndex=3},w=>{w.days[0]!.sessions[0]!.activities[1]!.restSeconds=30},w=>{w.days[0]!.sessions[0]!.timing=null},w=>{w.days[0]!.sessions[0]!.activities[1]!.distanceTarget=null}];
  for(const mutate of mutations){const w=qualityWeek();mutate(w);assert.throws(()=>checkWeek(w,qualityInput),{code:'invalid_plan'})}
});
test('exact mile quantities, short yards and metric targets survive canonical storage; fractional reps do not',()=>{
  for(const [unit,value,meters] of [['mi',2,3218.688],['yd',20,18.288],['km',3,3000]] as const){
    const w=qualityWeek(),a=w.days[3]!.sessions[0]!.activities[0]!;Object.assign(a,{measure:'meters',amount:meters,distanceTarget:{unit,value}});
    assert.equal(checkWeek(w,qualityInput).details[3]!.sessions[0]!.activities[0]!.amount,meters);
    a.amount=Math.round(meters+1);assert.throws(()=>checkWeek(w,qualityInput),{code:'invalid_plan'});
  }
  const w=qualityWeek();w.days[0]!.sessions[1]!.activities[0]!.amount=1.5;assert.throws(()=>checkWeek(w,qualityInput),{code:'invalid_plan'});
});
test('grounded speed deferral has no invented work; existing phases and quantities cannot be retrofitted on backfill',()=>{
  const w=qualityWeek();w.goalDecisions![1]={sourceIndex:1,goalIndex:0,goal:'Acceleration technique',status:'deferred',reason:'No acceleration instruction yet; revisit after technique instruction and safe lane access are established.',evidence:[]};
  w.days[0]!.sessions.shift();w.goalDecisions![2]!.evidence[0]!.sessionIndex=0;
  const input=structuredClone(qualityInput);input.summary[4]!.text='New to running with no sprint technique instruction.';
  assert.equal(checkWeek(w,input).outline.goalDecisions![1]!.status,'deferred');
  const original=checkWeek(qualityWeek(),qualityInput),saved=original.details[0]!;
  const legacy=structuredClone(saved);legacy.sessions.forEach(s=>{delete s.timing;delete s.intervals;s.activities.forEach(a=>delete a.distanceTarget)});
  const echo=qualityWeek();echo.days[0]!.sessions.forEach(s=>{s.timing=null;s.intervals=[];s.activities.forEach(a=>a.distanceTarget=null)});
  const result=checkWeek(echo,{...qualityInput,outline:original.outline,savedDays:[legacy]});assert.deepEqual(result.details[0]!.sessions,legacy.sessions);
  echo.days[0]!.sessions[0]!.timing='morning';assert.throws(()=>checkWeek(echo,{...qualityInput,outline:original.outline,savedDays:[legacy]}),{code:'saved_day_changed'});
});

test('maximum v2 request including six saved days retains full catalog and stays within bounded reservation',async()=>{
  const {prepareWeek,weeklyLimits}=await import('./weeklyPlanning.js');const {openAIProvider}=await import('./onboardingProvider.js');
  const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5});
  const a={...fixturePrescription('FQ-ACT-00148','meters'),amount:3218.688,distanceTarget:{value:2,unit:'mi' as const}};
  const session={focus:'Continuous walking',timing:'flexible' as const,intervals:[],activities:Array.from({length:15},()=>({...a}))};
  const week=qualityWeek();week.days=qualityInput.dates.map(date=>({date,sessions:Array.from({length:3},()=>structuredClone(session))}));
  week.goalDecisions=[{sourceIndex:0,goalIndex:0,goal:'Walking endurance',status:'addressed',reason:'Synthetic sizing case, not a real programming example.',evidence:[{date:qualityInput.dates[0]!,sessionIndex:0,activityIndex:0}]},...qualityWeek().goalDecisions!.slice(1).map(g=>({...g,status:'deferred' as const,reason:'Sizing fixture only; not a recommendation.',evidence:[]}))];
  const checked=checkWeek(week,qualityInput),prepared=prepareWeek(provider,{...qualityInput,outline:checked.outline,savedDays:checked.details.slice(0,6)});
  assert.ok(Buffer.byteLength(prepared.body)<weeklyLimits.inputBytes);assert.ok(Buffer.byteLength(JSON.stringify(week))<weeklyLimits.responseBytes);
  const payload=JSON.parse(JSON.parse(prepared.body).input);assert.equal(payload.savedDays.flatMap((d:any)=>d.sessions.flatMap((s:any)=>s.activities)).length,270);assert.equal(payload.catalog.rows.length,251);
});

test('recorded v2 prescriptions replay with offline-reviewed goal identities; no claim of a new live v3 response',async()=>{
  const {readFileSync}=await import('node:fs');
  const f=JSON.parse(readFileSync(new URL('../src/planningQualityLiveFixture.json',import.meta.url),'utf8'));
  f.planningInput.summary[0].goals=['Walking endurance','Upper-body strength','Shoulder mobility','Learning acceleration technique'];
  f.week.goalDecisions.forEach((g:any)=>{g.goalIndex=f.planningInput.summary[0].goals.indexOf(g.goal)});
  const checked=checkWeek(f.week,f.planningInput),goals=checked.outline.goalDecisions!;
  assert.equal(checked.details.length,7);assert.equal(checked.details.filter(d=>d.sessions.length).length,3);
  assert.equal(goals.length,4);assert.deepEqual(goals.map(g=>g.status),['addressed','introductory','addressed','deferred']);
  const speed=goals.find(g=>/acceleration/i.test(g.goal))!;assert.match(speed.reason,/run-out/);assert.match(speed.reason,/Revisit/);assert.deepEqual(speed.evidence,[]);
  assert.ok(checked.details.filter(d=>d.sessions.length).every(d=>d.sessions[0]!.timing==='morning'&&d.sessions.at(-1)!.timing==='evening'));
  const walks=checked.details.flatMap(d=>d.sessions.flatMap(s=>s.activities)).filter(a=>a.id==='FQ-ACT-00148');
  assert.equal(walks.length,3);assert.ok(walks.every(a=>a.amount===1609.344&&a.distanceTarget?.value===1&&a.distanceTarget.unit==='mi'));
  assert.ok(!checked.details.flatMap(d=>d.sessions.flatMap(s=>s.activities)).some(a=>['FQ-ACT-00145','FQ-ACT-00146','FQ-ACT-00147'].includes(a.id)));
});

test('single-session and flexible weeks need no fixed timing or multi-session quota; load convention checks remain intact',()=>{
  for(const availability of ['One session per day, 25 minutes total, three flexible days.','No distribution preference; 25 minutes total, three flexible days.']){
    const input={...qualityInput,summary:[qualityInput.summary[0]!,...qualityInput.summary.slice(2)]};input.summary=input.summary.map(f=>f.category==='availability'?{...f,text:availability}:f);
    const w=qualityWeek();w.days.forEach((d,i)=>{d.sessions=i===0||i===3||i===5?[{focus:'Walking',timing:'flexible',intervals:[],activities:[{...fixturePrescription('FQ-ACT-00148'),amount:1200,distanceTarget:null}]}]:[]});
    w.goalDecisions=[{sourceIndex:0,goalIndex:0,goal:'Walking endurance',status:'addressed',reason:'Three familiar short walks within the time available.',evidence:[{date:input.dates[0]!,sessionIndex:0,activityIndex:0}]}];
    assert.ok(checkWeek(w,input).details.every(d=>d.sessions.length<=1));
    w.days[0]!.sessions[0]!.activities[0]!.load='kg';w.days[0]!.sessions[0]!.activities[0]!.loadKg=10;
    assert.throws(()=>checkWeek(w,input),{code:'invalid_plan'});
  }
});

test('every individual goal identity is required: dropping, duplicating or substituting one fails, shared evidence is allowed',()=>{
  const input=structuredClone(qualityInput),week=qualityWeek();
  for(const mutate of [
    (w:Week)=>{w.goalDecisions!.splice(1,1)},
    (w:Week)=>{w.goalDecisions=w.goalDecisions!.slice(0,1)},
    (w:Week)=>{w.goalDecisions![1]=structuredClone(w.goalDecisions![2]!)},
    (w:Week)=>{w.goalDecisions![1]!.goal=w.goalDecisions![2]!.goal},
    (w:Week)=>{w.goalDecisions![1]!.goalIndex=9},
  ]){const bad=structuredClone(week);mutate(bad);assert.throws(()=>checkWeek(bad,input),{code:'invalid_plan'})}
  // No keyword taxonomy: two arbitrary goals can share a real walking prescription.
  input.summary[0]!.goals=['Join my friends on a canal stroll','Spend regular relaxed time outdoors'];
  week.goalDecisions![0]!.goal=input.summary[0]!.goals[0]!;
  week.goalDecisions!.push({...week.goalDecisions![0]!,goalIndex:1,goal:input.summary[0]!.goals[1]!});
  assert.equal(checkWeek(week,input).outline.goalDecisions!.length,4);
});

test('exact HQ compound-goal reproduction fails; legacy prose cannot define its own coverage denominator',async()=>{
  const {readFileSync}=await import('node:fs');
  const f=JSON.parse(readFileSync(new URL('../src/planningQualityLiveFixture.json',import.meta.url),'utf8'));
  for(const keep of [(g:any)=>!g.goal.includes('acceleration'),(g:any)=>g.goal==='Walking endurance']){
    const bad=structuredClone(f.week);bad.goalDecisions=bad.goalDecisions.filter(keep);
    assert.throws(()=>checkWeek(bad,f.planningInput),{code:'invalid_plan'});
  }
  // Explicit test-reviewed intake identities, not derived from the candidate week.
  const expected=['Walking endurance','Upper-body strength','Shoulder mobility','Learning acceleration technique'];
  f.planningInput.summary[0].goals=expected;
  f.week.goalDecisions.forEach((g:any)=>{g.goalIndex=expected.indexOf(g.goal)});
  assert.equal(checkWeek(f.week,f.planningInput).outline.goalDecisions!.length,4);
  f.week.goalDecisions.pop();assert.throws(()=>checkWeek(f.week,f.planningInput),{code:'invalid_plan'});
  const {prepareWeek}=await import('./weeklyPlanning.js');
  const {openAIProvider}=await import('./onboardingProvider.js');
  delete f.planningInput.summary[0].goals;
  const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5});
  assert.throws(()=>prepareWeek(provider,f.planningInput),{code:'summary_needs_correction'});
});
