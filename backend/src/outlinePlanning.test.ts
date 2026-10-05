import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOverview,prepareOverview,checkOverviewReview,overviewDays } from './outlinePlanning.js';
import { checkWeek,prepareWeek } from './weeklyPlanning.js';
import { trainingFixture,fixturePrescription } from './planningFixture.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import type { PlanningInput } from './planningDomain.js';

import { overviewDates,overviewFixture,outlineInput,overviewWorkouts } from './outlinePlanningFixture.js';
const provider:OnboardingProvider={mode:'test',model:'mock',capMicro:7000000,prepare:()=>{throw Error()},call:async()=>{throw Error()},cost:u=>u.input+u.output};
test('outline request is compact and contains no catalog, exercises, prescriptions or exercise-index goal evidence',()=>{
 const input=outlineInput(),prepared=JSON.parse(prepareOverview(provider,input).body),payload=JSON.parse(prepared.input);
 assert.equal(prepared.max_output_tokens,2000);assert.equal(prepared.store,false);assert.equal(prepared.reasoning.effort,'low');
 assert.deepEqual(payload.summary,trainingFixture);assert(!('catalog' in payload));assert(!('expectedGoals' in payload));
 for(const key of ['activityIds','activities','repRange','goalDecisions','activityIndex'])assert(!JSON.stringify(prepared.text).includes(key));
 assert(prepared.instructions.length<1600);
 for(const distributed of [false,true]){const outline=checkOverview(overviewFixture(input.dates,distributed),input);assert.equal(outline.days[0]!.sessions.length,distributed?2:1);assert(outline.days.every(d=>d.sessions.every(s=>s.activityIds.length===0)));}
});
test('outline review keeps unaffected sessions, supports clarification and rejects changed kept dates',()=>{
 const input=outlineInput(),outline=checkOverview(overviewFixture(),input);input.review={feedback:'Keep Monday unchanged. Shorten Thursday.',context:null,outline,days:overviewDays(outline)};
 const next=overviewFixture();next.days[3]!.sessions[0]!.estimatedMinutes=15;
 const raw={outline:next,reply:'Thursday is shorter; Monday is unchanged.',scope:[{date:input.dates[3],changeSessions:[0],evidence:'Shorten Thursday'}]};
 assert.equal(checkOverviewReview(raw,input).week!.details.length,0);
 next.days[0]!.sessions[0]!.estimatedMinutes=15;assert.throws(()=>checkOverviewReview(raw,input),{code:'saved_day_changed'});
 const clarified={...raw,scope:null,outline:{...overviewFixture(),days:input.dates.map(date=>({date,sessions:[]})),clarification:{question:'Which Thursday session should be shorter?',reason:'The requested change needs a specific session.'}}};
 assert.equal(checkOverviewReview(clarified,input).week,null);
});
test('detail generation uses approved arrangement and catalog; conflicts and partial responses cannot replace it',()=>{
 const input:PlanningInput={...outlineInput(),kind:'week',draftReview:true,qualityVersion:2};input.outline=checkOverview(overviewFixture(),input);
 const wire=JSON.parse(prepareWeek(provider,input).body),payload=JSON.parse(wire.input);assert.deepEqual(payload.outline,input.outline);assert(payload.catalog);assert.equal(wire.text.format.name,'training_week');
 const raw=overviewWorkouts(input);assert.equal(checkWeek(raw,input).details.length,7);
 const changed=structuredClone(raw);changed.days[0]!.sessions[0]!.timing='evening';assert.throws(()=>checkWeek(changed,input),{code:'approved_outline_changed'});
 const invalid=structuredClone(raw);invalid.days[0]!.sessions[0]!.activities[0]!.id='FQ-ACT-00161';assert.throws(()=>checkWeek(invalid,input));
 const partial=structuredClone(raw);partial.days.pop();assert.throws(()=>checkWeek(partial,input));
 const conflict={...raw,goalDecisions:[],days:input.dates.map(date=>({date,sessions:[]})),clarification:{question:'May we revise the unsupported session?',reason:'The approved session requires equipment that is not available.'}};
 const checked=checkWeek(conflict,input);assert.deepEqual(checked.outline,input.outline);assert.equal(checked.details.length,0);assert.match(checked.conflict!,/equipment/);
});
test('outline keep-the-rest resolves edited days and independently rejects a changed remainder',()=>{
 for(const feedback of ['Shorten Thursday. Keep the rest unchanged.','Keep the rest unchanged. Shorten Thursday.','Shorten Thursday, and keep the rest of the week unchanged.']){
  const input=outlineInput(),outline=checkOverview(overviewFixture(),input);input.review={feedback,context:null,outline,days:overviewDays(outline)};
  const next=overviewFixture();next.days[3]!.sessions[0]!.estimatedMinutes=15;
  const response={outline:next,scope:[{date:input.dates[3]!,changeSessions:[0],evidence:'Shorten Thursday'}],reply:'Thursday is shorter. Every other session stays unchanged.'};
  const preservation=JSON.parse(JSON.parse(prepareOverview(provider,input).body).input).preservation;
  assert.equal(preservation.unresolved,false);assert.equal(preservation.days.length,6);assert(!preservation.days.includes(input.dates[3]));
  const checked=checkOverviewReview(response,input).week!.outline;
  for(const [i,day] of checked.days.entries())if(i!==3)assert.deepEqual(day,outline.days[i]);
  // Even a model that claims broad permission cannot change a kept day or add
  // work to a kept rest day using the edit quote as its supposed authority.
  const changed=structuredClone(response);changed.outline.days[0]!.sessions[0]!.estimatedMinutes=15;
  changed.scope.push({date:input.dates[0]!,changeSessions:[0],evidence:'Shorten Thursday'});
  assert.throws(()=>checkOverviewReview(changed,input),{code:'saved_day_changed'});
  const added=structuredClone(response);added.outline.days[1]!.sessions.push({focus:'New session',timing:'flexible',estimatedMinutes:10});added.scope.push({date:input.dates[1]!,changeSessions:[],evidence:'Shorten Thursday'});
  assert.throws(()=>checkOverviewReview(added,input),{code:'saved_day_changed'});
 }
});
test('outline session edits preserve the other session on the same day under remainder language',()=>{
 const input=outlineInput(),outline=checkOverview(overviewFixture(),input);input.review={feedback:'Shorten Monday morning. Keep all other sessions unchanged.',context:null,outline,days:overviewDays(outline)};
 const next=overviewFixture();next.days[0]!.sessions[0]!.estimatedMinutes=15;
 const response={outline:next,scope:[{date:input.dates[0]!,changeSessions:[0],evidence:'Shorten Monday morning'}],reply:'Monday morning is shorter. The other sessions stay unchanged.'};
 assert.equal(JSON.parse(JSON.parse(prepareOverview(provider,input).body).input).preservation.unresolved,false);
 const checked=checkOverviewReview(response,input).week!.outline;assert.deepEqual(checked.days[0]!.sessions[1],outline.days[0]!.sessions[1]);
 response.scope[0]!.changeSessions.push(1);next.days[0]!.sessions[1]!.estimatedMinutes=15;
 assert.throws(()=>checkOverviewReview(response,input),{code:'saved_day_changed'});
 // Adding time edits an existing session; it does not mean adding a new one.
 input.review.feedback='Add 5 minutes to Monday morning. Keep the rest unchanged.';
 const longer=overviewFixture();longer.days[0]!.sessions[0]!.estimatedMinutes=25;
 assert.equal(checkOverviewReview({outline:longer,scope:[{date:input.dates[0]!,changeSessions:[0],evidence:'Add 5 minutes to Monday morning'}],reply:'Monday morning is five minutes longer; other sessions stay unchanged.'},input).week!.outline.days[0]!.sessions[0]!.estimatedMinutes,25);
});
test('outline additions preserve existing sessions and other dates, including additions to a rest day',()=>{
 for(const [dayIndex,timing] of [[0,'midday'],[1,'evening']] as const){
  const day=dayIndex===0?'Monday':'Tuesday',feedback=`Add a ${timing} session on ${day}. Keep the rest unchanged.`;
  const input=outlineInput(),outline=checkOverview(overviewFixture(),input);input.review={feedback,context:null,outline,days:overviewDays(outline)};
  const next=overviewFixture();next.days[dayIndex]!.sessions.splice(dayIndex===0?1:0,0,{focus:'Easy mobility',timing,estimatedMinutes:10});
  const response={outline:next,scope:[{date:input.dates[dayIndex]!,changeSessions:[] as number[],evidence:`Add a ${timing} session on ${day}`}],reply:'The requested session was added; the existing work is unchanged.'};
  assert.equal(JSON.parse(JSON.parse(prepareOverview(provider,input).body).input).preservation.unresolved,false);
  assert.equal(checkOverviewReview(response,input).week!.outline.days[dayIndex]!.sessions.length,outline.days[dayIndex]!.sessions.length+1);
  // A later addition can release an older whole-day keep only enough to add
  // the new session; it must not release that day's original sessions.
  input.review.context={feedback:`Keep ${day} unchanged.`,question:'Which session would you like to add?'};
  assert.equal(checkOverviewReview(response,input).week!.outline.days[dayIndex]!.sessions.length,outline.days[dayIndex]!.sessions.length+1);
  const changed=structuredClone(response);changed.outline.days[0]!.sessions[0]!.estimatedMinutes=15;changed.scope.push({date:input.dates[0]!,changeSessions:[0],evidence:response.scope[0]!.evidence});
  if(dayIndex===0)changed.scope.splice(0,1);
  assert.throws(()=>checkOverviewReview(changed,input),{code:'saved_day_changed'});
 }
});
test('outline remainder locks survive clarification and unknown targets still fail closed',()=>{
 const input=outlineInput(),outline=checkOverview(overviewFixture(),input);input.review={feedback:'15 minutes.',context:{feedback:'Shorten Thursday. Keep the rest unchanged.',question:'How long should Thursday be?'},outline,days:overviewDays(outline)};
 const next=overviewFixture();next.days[3]!.sessions[0]!.estimatedMinutes=15;
 const response={outline:next,scope:[{date:input.dates[3]!,changeSessions:[0],evidence:'Shorten Thursday'}],reply:'Thursday is now 15 minutes; the remainder stays unchanged.'};
 assert.equal(checkOverviewReview(response,input).week!.outline.days[3]!.sessions[0]!.estimatedMinutes,15);
 input.review={...input.review,feedback:'Shorten the difficult one. Keep the rest unchanged.',context:null};
 assert.equal(JSON.parse(JSON.parse(prepareOverview(provider,input).body).input).preservation.unresolved,true);
 response.scope[0]!.evidence='Shorten the difficult one';assert.throws(()=>checkOverviewReview(response,input),{code:'saved_day_changed'});
});
test('adding minutes to a named session or workout edits only that session, never the kept remainder',()=>{
 for(const noun of ['session','workout']){
  const input=outlineInput(),outline=checkOverview(overviewFixture(),input),evidence=`Add 5 minutes to the Monday morning ${noun}`;
  input.review={feedback:`${evidence}. Keep the rest unchanged.`,context:null,outline,days:overviewDays(outline)};
  const next=overviewFixture();next.days[0]!.sessions[0]!.estimatedMinutes=25;
  const raw={outline:next,scope:[{date:input.dates[0]!,changeSessions:[0],evidence}],reply:'Monday morning is five minutes longer. The rest is unchanged.'};
  const locks=JSON.parse(JSON.parse(prepareOverview(provider,input).body).input).preservation;
  assert.equal(locks.unresolved,false);assert(!locks.sessions.some((s:any)=>s.date===input.dates[0]&&s.session===0));assert(locks.sessions.some((s:any)=>s.date===input.dates[0]&&s.session===1));
  const checked=checkOverviewReview(raw,input).week!.outline;assert.equal(checked.days[0]!.sessions[0]!.estimatedMinutes,25);assert.deepEqual(checked.days[0]!.sessions[1],outline.days[0]!.sessions[1]);assert.deepEqual(checked.days.slice(1),outline.days.slice(1));
  const forged=structuredClone(raw);forged.outline.days[0]!.sessions[1]!.estimatedMinutes=25;forged.scope[0]!.changeSessions.push(1);
  assert.throws(()=>checkOverviewReview(forged,input),{code:'saved_day_changed'});
 }
});
test('a duration describing a new session or workout still preserves all original sessions',()=>{
 for(const noun of ['session','workout']){
  const input=outlineInput(),outline=checkOverview(overviewFixture(),input),evidence=`Add a 10-minute midday ${noun} on Monday`;
  input.review={feedback:`${evidence}. Keep the rest unchanged.`,context:null,outline,days:overviewDays(outline)};
  const next=overviewFixture();next.days[0]!.sessions.splice(1,0,{focus:'Mobility practice',timing:'midday',estimatedMinutes:10});
  const raw={outline:next,scope:[{date:input.dates[0]!,changeSessions:[] as number[],evidence}],reply:'A ten-minute midday session is added. Existing sessions are unchanged.'};
  const checked=checkOverviewReview(raw,input).week!.outline;assert.equal(checked.days[0]!.sessions.length,3);assert.deepEqual(checked.days[0]!.sessions[0],outline.days[0]!.sessions[0]);assert.deepEqual(checked.days[0]!.sessions[2],outline.days[0]!.sessions[1]);assert.deepEqual(checked.days.slice(1),outline.days.slice(1));
  const forged=structuredClone(raw);forged.outline.days[0]!.sessions[0]!.estimatedMinutes=25;forged.scope[0]!.changeSessions.push(0);
  assert.throws(()=>checkOverviewReview(forged,input),{code:'saved_day_changed'});
 }
});
