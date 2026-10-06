import test from 'node:test';
import assert from 'node:assert/strict';
import { planDates } from './trainingSummary.js';
import { checkOverview,prepareOverview,checkOverviewReview,overviewDays } from './outlinePlanning.js';
import { checkWeek,prepareWeek } from './weeklyPlanning.js';
import { outlineInput,overviewFixture,overviewWorkouts } from './outlinePlanningFixture.js';
import { applyProposal,emptyContext,recapTopic } from './onboardingDomain.js';
import { renderOnboardingReply } from './onboardingReply.js';
import type { OnboardingProvider } from './onboardingProvider.js';
const provider:OnboardingProvider={mode:'test',model:'mock',capMicro:7000000,prepare:()=>{throw Error()},call:async()=>{throw Error()},cost:u=>u.input+u.output};

test('each request weekday yields exact bounded outline/detail dates, rejects omission/addition and does not request a compressed week',()=>{
 for(let weekday=0;weekday<7;weekday++){
  const dates=planDates('UTC',new Date(Date.UTC(2026,9,4+weekday,12))),i=outlineInput(dates);
  // A partial week gets a modest first-day walk and strength, then recovery;
  // synthetic expected proposal only, never a production template.
  const raw=overviewFixture(dates);for(const day of raw.days.slice(1))day.sessions=[];
  i.outline=checkOverview(raw,i);i.kind='week';i.qualityVersion=2;i.draftReview=true;
  const week=overviewWorkouts(i);week.goalDecisions[1]!.evidence=[{date:dates[0],sessionIndex:1,activityIndex:0}];
  assert.equal(checkWeek(week,i).details.length,dates.length);
  assert.throws(()=>checkOverview({...raw,days:[...raw.days,{date:'2026-11-01',sessions:[]}]},i));
  assert.throws(()=>checkWeek({...week,days:week.days.slice(1)},i));
  assert.deepEqual(JSON.parse(JSON.parse(prepareWeek(provider,i).body).input).dates,dates);
  assert.match(JSON.parse(prepareOverview(provider,i).body).instructions,/never compress a full week's volume/);
 }
});
test('mixed goals plus available slots and a per-session cap allow coach-chosen separate purposeful sessions without inventing a preference',()=>{
 const i=outlineInput();i.summary=i.summary.map(f=>f.category==='availability'?{...f,text:'Morning and evening are available. At most 25 minutes per session.',origin:'user_report'}:f);
 const sources=Object.fromEntries(i.summary.map((f,j)=>['m'+j,f.text]));
 const proposal={trainingSummary:i.summary,reply:'Here is your retained context.',additions:[],readiness:'ready' as const,limitations:[],planningCheck:{status:'ready' as const,question:null,reason:null},nextQuestion:{topic:recapTopic,text:'Ready?',decision:'Feasibility is understood.'}};
 const context=applyProposal(emptyContext(),proposal,sources,'');assert.deepEqual(context.trainingSummary,i.summary);assert.match(renderOnboardingReply(proposal),/Morning and evening are available/);assert.doesNotMatch(renderOnboardingReply(proposal),/prefer separate/);
 const wire=JSON.parse(prepareOverview(provider,i).body);assert.deepEqual(JSON.parse(wire.input).summary,i.summary);assert.match(wire.instructions,/even without an explicit preference/);assert.match(wire.instructions,/Current habits are context/);assert.doesNotMatch(wire.instructions,/available multi-session days do not require|ideal.day question|must prefer/);
 i.outline=checkOverview(overviewFixture(i.dates,true),i);assert.deepEqual(i.outline.days[0]!.sessions.map(s=>s.focus),['Easy walking','Strength practice']);assert.deepEqual(i.outline.days[0]!.sessions.map(s=>s.timing),['morning','evening']);
 assert(i.outline.days[0]!.sessions.reduce((n,s)=>n+s.estimatedMinutes!,0)>25); // Cap is per session, not daily.
 i.review={feedback:'Shorten Monday morning. Keep all other sessions unchanged.',context:null,outline:i.outline,days:overviewDays(i.outline)};
 const raw=overviewFixture(i.dates,true);raw.days[0]!.sessions[0]!.estimatedMinutes=15;
 const reviewed=checkOverviewReview({outline:raw,scope:[{date:i.dates[0],changeSessions:[0],evidence:'Shorten Monday morning'}],reply:'Morning walking is shorter; evening strength stays unchanged.'},i).week!.outline;
 const detailed={...i,review:undefined,outline:reviewed,kind:'week' as const,draftReview:true,qualityVersion:2 as const};
 assert.deepEqual(checkWeek(overviewWorkouts(detailed),detailed).details[0]!.sessions.map(s=>s.timing),['morning','evening']);
 for(const text of ['I prefer one session each day. At most 25 minutes per session.','At most 25 minutes total per day.']){
  const constrained={...i,review:undefined,summary:i.summary.map(f=>f.category==='availability'?{...f,text}:f)};
  const single=checkOverview(overviewFixture(i.dates,false),constrained);assert.equal(single.days[0]!.sessions.length,1);
  if(text.includes('total'))assert.throws(()=>checkOverview(overviewFixture(i.dates,true),constrained),{code:'time_limit'});
 }
});
