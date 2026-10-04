import type { PlanningInput } from './planningDomain.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReview,prepareReview } from './planReview.js';
import { fixtureScope,reviewInput,reviewWeek,revisedWeek,reviewFeedback } from './planReviewFixture.js';
import { checkWeek } from './weeklyPlanning.js';
import { reviewProtections } from './reviewProtection.js';
import { checkDurations,explicitTimeLimits,minimumMinutes } from './planningDuration.js';
import { openAIProvider,serializeInput } from './onboardingProvider.js';
const base=checkWeek(reviewWeek(),reviewInput);
const input:PlanningInput&{review:NonNullable<PlanningInput['review']>}={...reviewInput,review:{feedback:reviewFeedback,context:null,outline:base.outline,days:base.details}};
const output=()=>({scope:fixtureScope(input) as ReturnType<typeof fixtureScope>|null,week:revisedWeek(),changedDates:[input.dates[1]!],reply:'Monday is unchanged. Tuesday now has two shorter sessions, with introductory speed work replacing some walking.',lastingPreference:null});
test('review uses the same seven dates, changes actual Tuesday work, keeps Monday and all unaffected work, and accounts for every goal',()=>{
  const checked=checkReview(output(),input);assert.ok(checked.week);
  assert.deepEqual(checked.week.details[0],base.details[0]);assert.deepEqual(checked.week.details.slice(2),base.details.slice(2));
  assert.equal(checked.week.details[1]!.sessions.length,2);assert.equal(checked.week.details[1]!.sessions[1]!.activities[0]!.id,'FQ-ACT-00145');
  assert.equal(checked.week.outline.goalDecisions!.length,3);assert.deepEqual(checked.week.details.map(d=>d.date),input.dates);
});
test('review rejects rewritten kept work, unlisted changed dates, missing goals and dates moved to another week',()=>{
  const kept=output();kept.week.days[0]!.sessions[0]!.activities[0]!.amount=500;kept.changedDates.unshift(input.dates[0]!);
  assert.throws(()=>checkReview(kept,input),{code:'saved_day_changed'});
  const other=output();other.week.days[2]!.sessions=structuredClone(other.week.days[0]!.sessions);assert.throws(()=>checkReview(other,input),{code:'saved_day_changed'});
  const goals=output();goals.week.goalDecisions!.pop();assert.throws(()=>checkReview(goals,input),{code:'invalid_plan'});
  const moved=output();moved.week.days[0]!.date='2026-11-01';assert.throws(()=>checkReview(moved,input),{code:'invalid_plan'});
  const labels=output();labels.week=reviewWeek();labels.week.days[1]!.sessions[0]!.focus='Two shorter sessions';assert.throws(()=>checkReview(labels,input),{code:'invalid_plan'});
  const unrelated=output();unrelated.week.days[2]!.sessions=structuredClone(unrelated.week.days[0]!.sessions);unrelated.changedDates.push(input.dates[2]!);assert.throws(()=>checkReview(unrelated,input),{code:'saved_day_changed'});
});
test('serialized revision schema omits unsupported keywords but local uniqueness and date checks remain strict',()=>{
  const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5});
  const wire=JSON.parse(prepareReview(provider,input).body);
  assert.doesNotMatch(JSON.stringify(wire.text.format.schema),/uniqueItems/);
  assert.ok(wire.text.format.schema.required.includes('scope'));
  for(const mutate of [(raw:ReturnType<typeof output>)=>raw.changedDates.push(raw.changedDates[0]!),(raw:ReturnType<typeof output>)=>raw.scope![0]!.changeSessions.push(0),(raw:ReturnType<typeof output>)=>{raw.scope!.push(structuredClone(raw.scope![0]!))},(raw:ReturnType<typeof output>)=>raw.changedDates.push('2026-12-01')]){
    const raw=output();mutate(raw);assert.throws(()=>checkReview(raw,input),{code:'invalid_plan'});
  }
});
test('source-grounded interpretations handle punctuation and clear keep-as-change language without lexical overrides',()=>{
  for(const feedback of ['Keep Monday exactly as it is, split Tuesday into shorter sessions.','Keep Monday exactly as it is; split Tuesday into shorter sessions.','Keep Monday exactly as it is and split Tuesday into shorter sessions.','Keep Tuesday manageable by splitting its work; Monday stays unchanged.',"Do not leave Tuesday unchanged: split it. Keep Monday unchanged."]){
    const request={...input,review:{...input.review,feedback}},raw=output();raw.scope=fixtureScope(request);
    assert.ok(checkReview(raw,request).week);
    raw.week.days[0]!.sessions[0]!.activities[0]!.amount=300;raw.changedDates.unshift(input.dates[0]!);
    assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
  }
  const raw=output();raw.scope![0]!.evidence='Invented permission';assert.throws(()=>checkReview(raw,input),{code:'invalid_feedback'});
});
test('session scope keeps unchanged work exactly and clarification context supports only its bounded interpretation',()=>{
  const savedWeek=revisedWeek(),saved=checkWeek(savedWeek,input);
  const request={...input,review:{feedback:'Shorten Tuesday evening only.',context:{feedback:'Keep Monday and Tuesday morning exactly as they are.',question:'Which work may change?'},outline:saved.outline,days:saved.details}};
  const raw={...output(),scope:fixtureScope(request),week:structuredClone(savedWeek)};
  raw.scope[0]!.changeSessions=[1];raw.week.days[1]!.sessions[1]!.activities[0]!.sets=2;
  assert.ok(checkReview(raw,request).week);
  raw.week.days[1]!.sessions[0]!.activities[0]!.amount=200;assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
});
test('maximum review retains the full catalog and 315 saved prescriptions inside the existing request limit',()=>{
  const maximum=structuredClone(input),day=maximum.review.days[1]!,session=day.sessions[0]!;
  maximum.review.days=maximum.dates.map(date=>({date,coverage:[],sessions:Array.from({length:3},()=>({...session,activities:Array.from({length:15},()=>({...session.activities[0]!,sets:20,amount:50000,restSeconds:600}))}))}));
  maximum.review.outline.days=maximum.dates.map(date=>({date,sessions:Array.from({length:3},()=>({focus:'Purposeful session label'.padEnd(64,'x'),activityIds:['FQ-ACT-00148']}))}));
  maximum.review.feedback='x'.repeat(2000);maximum.review.context={feedback:'y'.repeat(4000),question:'What change matters most?'};
  const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.125,cachedRate:.0125,cacheWriteRate:0,outputRate:.5});
  const prepared=prepareReview(provider,maximum),payload=JSON.parse(JSON.parse(prepared.body).input);
  assert.equal(payload.catalog.rows.length,251);assert.equal(payload.review.days.flatMap((d:any)=>d.sessions.flatMap((s:any)=>s.activities)).length,315);assert.ok(Buffer.byteLength(prepared.body)<=450000);
});
test('ambiguous/conflicting feedback produces one question with no replacement prescriptions',()=>{
  for(const feedback of ['Make it more suitable.','Keep Monday exactly as it is, but halve all its work.']){
    const raw=output();raw.scope=null;raw.changedDates=[];raw.week.goalDecisions=[];raw.week.days.forEach(d=>d.sessions=[]);raw.week.clarification={question:'Should Monday stay unchanged, or may its workload change?',reason:'Those instructions require different prescriptions.'};
    const result=checkReview(raw,{...input,review:{...input.review,feedback}});assert.equal(result.week,null);assert.equal(result.question,raw.week.clarification.question);
  }
});
test('estimates respect measurable time/rest and explicit per-session versus daily limits',()=>{
  assert.deepEqual(explicitTimeLimits(input.summary),{session:20,day:30});
  assert.equal(minimumMinutes(base.details[0]!.sessions[0]!),10);
  for(const mode of ['floor','session','day']){
    const raw=output();if(mode==='floor')raw.week.days[0]!.sessions[0]!.estimatedMinutes=5;
    if(mode==='session')raw.week.days[1]!.sessions[0]!.estimatedMinutes=21;
    if(mode==='day'){raw.week.days[1]!.sessions[0]!.estimatedMinutes=20;raw.week.days[1]!.sessions[1]!.estimatedMinutes=20}
    assert.throws(()=>checkReview(raw,input),{code:'time_limit'});
  }
});
test('weekday/weekend caps stay date-scoped and a valid 45-minute Saturday is not capped at 30',()=>{
  const summary=structuredClone(input.summary);
  summary[1]!.text='I can train 30 minutes per day on weekdays and 60 minutes per day on weekends. I have no session-distribution preference.';
  assert.deepEqual(explicitTimeLimits(summary),{session:null,day:null});
  assert.deepEqual(explicitTimeLimits(summary,'2026-10-05'),{session:null,day:30});
  assert.deepEqual(explicitTimeLimits(summary,'2026-10-10'),{session:null,day:60});
  const request={...input,summary},week=reviewWeek(request);
  week.days[5]!.sessions=[{...structuredClone(week.days[0]!.sessions[0]!),estimatedMinutes:45}];
  assert.doesNotThrow(()=>checkWeek(week,request));
  week.days[5]!.sessions[0]!.estimatedMinutes=61;assert.throws(()=>checkWeek(week,request),{code:'time_limit'});
  week.days[5]!.sessions[0]!.estimatedMinutes=45;week.days[0]!.sessions[0]!.estimatedMinutes=31;
  assert.throws(()=>checkWeek(week,request),{code:'time_limit'});
});
test('minimums, preferences and activity-qualified durations are not global maximums',()=>{
  const summary=structuredClone(input.summary);
  summary[1]!.text='I want at least 20 minutes per day, and can train for up to 45 minutes per day.';
  assert.deepEqual(explicitTimeLimits(summary),{session:null,day:45});
  const request={...input,summary},week=reviewWeek(request);week.days[0]!.sessions[0]!.estimatedMinutes=40;
  assert.doesNotThrow(()=>checkWeek(week,request));
  week.days[0]!.sessions[0]!.estimatedMinutes=46;assert.throws(()=>checkWeek(week,request),{code:'time_limit'});
  for(const text of ['I prefer 20 minutes per day.','20 minutes per day for walking; 45 minutes per day for strength.','At least 20 minutes per day.','30 minutes per day, only on weekdays.','30 minutes per day and only for walking.','If I feel well, 30 minutes per day.']){
    summary[1]!.text=text;assert.deepEqual(explicitTimeLimits(summary),{session:null,day:null});
  }
});
test('applicable per-session and total-day upper bounds remain distinct from measurable work/rest floors',()=>{
  const summary=structuredClone(input.summary);summary[1]!.text='Up to 20 minutes per session; up to 30 minutes per day.';
  const days=structuredClone(base.details);days[0]!.sessions=[{...days[0]!.sessions[0]!,estimatedMinutes:16},{...days[0]!.sessions[0]!,estimatedMinutes:15}];
  assert.throws(()=>checkDurations(days,summary),{code:'time_limit'});
  days[0]!.sessions[0]!.estimatedMinutes=15;assert.doesNotThrow(()=>checkDurations(days,summary));
  days[0]!.sessions=[{...days[0]!.sessions[0]!,estimatedMinutes:21}];assert.throws(()=>checkDurations(days,summary),{code:'time_limit'});
  summary[1]!.text='I prefer 5 minutes per day.';days[0]!.sessions[0]!.estimatedMinutes=5;
  assert.throws(()=>checkDurations(days,summary),{code:'time_limit'});
});
test('one-off feedback is separate from explicitly grounded future preferences and model context stays bounded',()=>{
  const raw=output();assert.equal(checkReview(raw,input).lastingPreference,null);
  raw.lastingPreference='Always use mornings.' as never;assert.throws(()=>checkReview(raw,input),{code:'invalid_feedback'});
  const preference='Going forward I prefer shorter morning sessions.';
  raw.lastingPreference=preference as never;
  assert.equal(checkReview(raw,{...input,review:{...input.review,feedback:reviewFeedback+' '+preference}}).lastingPreference,preference);
  const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.125,cachedRate:.0125,cacheWriteRate:0,outputRate:.5});
  const prepared=prepareReview(provider,input),body=JSON.parse(prepared.body),payload=JSON.parse(body.input);
  assert.deepEqual(payload.dates,input.dates);assert.equal(body.text.format.name,'training_week');assert.match(body.instructions,/previous usable plan will remain intact/);assert.match(body.instructions,/yes, but/);assert.equal(payload.review.days.length,7);
  assert.ok(Buffer.byteLength(prepared.body)<=450000);assert.ok(prepared.reserveMicro>0);
});

test('model scope cannot convert an explicit whole-day keep into edit permission',()=>{
 for(const separator of [';',',',', and',' and']){
  const request={...input,review:{...input.review,feedback:reviewFeedback.replace(';',separator)}},raw=output();raw.scope=fixtureScope(request);
  raw.week.days[0]!.sessions[0]!.activities[0]!.amount=300;raw.changedDates.unshift(input.dates[0]!);
  raw.scope!.unshift({date:input.dates[0]!,changeSessions:[0],evidence:'Keep Monday exactly as it is'});
  assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
 }
});
test('actual replace-X keep-the-rest feedback rejects altered, removed, reordered or duplicated unrelated exercises inside an editable session',async()=>{
 const {coachingRecords}=await import('./coachingLiveFixture.js');const record=coachingRecords.find(r=>r.stage==='review-repair')!;
 assert.ok(checkReview(structuredClone(record.raw),record.input).week);
 for(const mutate of [(s:any)=>s.activities[0].sets=1,(s:any)=>s.activities.splice(0,1),(s:any)=>[s.activities[0],s.activities[2]]=[s.activities[2],s.activities[0]],(s:any)=>s.activities.push(structuredClone(s.activities[0]))]){
  const raw=structuredClone(record.raw);mutate(raw.week.days[0].sessions[1]);assert.throws(()=>checkReview(raw,record.input),{code:'saved_day_changed'});
 }
 // Even a fabricated broader scope with a real keep quote cannot release the rows.
 const raw=structuredClone(record.raw);raw.scope[0].evidence='Keep all other strength exercises unchanged';raw.week.days[0].sessions[1].activities[0].sets=1;
 assert.throws(()=>checkReview(raw,record.input),{code:'saved_day_changed'});
});
test('latest keeps defeat older edit evidence; clear later overrides release only the named work',()=>{
 const original=reviewWeek(),changed=structuredClone(original);changed.days[0]!.sessions[0]!.activities[0]!.amount=300;
 const latestKeep={...input,review:{...input.review,context:{feedback:'Shorten Monday.',question:'How much shorter?'},feedback:'Keep Monday exactly as it is.'}};
 const raw={...output(),week:changed,changedDates:[input.dates[0]!],scope:[{date:input.dates[0]!,changeSessions:[0],evidence:'Shorten Monday.'}]};
 assert.throws(()=>checkReview(raw,latestKeep),{code:'saved_day_changed'});
 const override={...input,review:{...input.review,context:{feedback:'Keep Monday exactly as it is.',question:'What should change?'},feedback:'Actually shorten Monday.'}};
 raw.scope[0]!.evidence='Actually shorten Monday.';assert.ok(checkReview(raw,override).week);
 const conflict={...input,review:{...input.review,feedback:'Keep Monday exactly as it is; halve Monday.'}};
 raw.scope[0]!.evidence='halve Monday';assert.throws(()=>checkReview(raw,conflict),{code:'saved_day_changed'});
 const corrected={...conflict,review:{...conflict.review,feedback:'Keep Monday exactly as it is; actually halve Monday.'}};
 raw.scope[0]!.evidence='actually halve Monday';assert.ok(checkReview(raw,corrected).week);
});
test('explicit session override of an older day keep still protects the other session from wrong model scope',()=>{
 const week=revisedWeek(),saved=checkWeek(week,input),request={...input,review:{feedback:'Shorten Tuesday evening only.',context:{feedback:'Keep Tuesday exactly as it is.',question:'Which session can change?'},outline:saved.outline,days:saved.details}};
 const raw={...output(),week:structuredClone(week),scope:[{date:input.dates[1]!,changeSessions:[0,1],evidence:'Shorten Tuesday evening only.'}]};
 raw.week.days[1]!.sessions[1]!.activities[0]!.sets=2;assert.ok(checkReview(raw,request).week);
 raw.week.days[1]!.sessions[0]!.activities[0]!.amount=200;assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
});
test('unresolved explicit keep cannot be overridden by model interpretation; clarification still preserves the plan',()=>{
 const request={...input,review:{...input.review,feedback:'Keep the important bit unchanged; split Tuesday.'}},raw=output();raw.scope=fixtureScope(request);
 assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
 raw.scope=null;raw.changedDates=[];raw.week.goalDecisions=[];raw.week.days.forEach(d=>d.sessions=[]);raw.week.clarification={question:'Which work do you want to keep unchanged?',reason:'The important bit does not identify the work to preserve.'};
 assert.equal(checkReview(raw,request).week,null);
});
test('a concrete clarification answer resolves one unidentified keep while all established keeps survive',()=>{
 const context={feedback:'Keep the important bit unchanged; split Tuesday.',question:'Which work do you want to keep unchanged?'};
 const request={...input,review:{...input.review,context,feedback:'Keep Monday exactly as it is; split Tuesday into shorter sessions.'}};
 assert.equal(reviewProtections(request.review,request.dates).unresolved,false);
 const raw=output();raw.scope=fixtureScope(request);assert.ok(checkReview(raw,request).week);
 const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5});
 assert.equal(JSON.parse(JSON.parse(prepareReview(provider,request).body).input).preservation.unresolved,false);
 // A resolved answer must also remain resolved when retained in another turn.
 const continued={...request,review:{...request.review,context:{...context,feedback:context.feedback+'\n'+request.review.feedback},feedback:'Split Tuesday into shorter sessions.'}};
 raw.scope=fixtureScope(continued);assert.ok(checkReview(raw,continued).week);
 // Resolving the unknown exercise target retains the independently kept day.
 request.review.context.feedback='Keep Monday unchanged. '+context.feedback;
 request.review.feedback='Keep FQ-ACT-00003 unchanged; split Tuesday into shorter sessions.';
 raw.scope=fixtureScope(request);assert.ok(checkReview(raw,request).week);
 raw.week.days[1]!.sessions[1]!.activities[1]!.amount=4;
 assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
 const malicious=output();malicious.scope=fixtureScope(request);malicious.scope.unshift({date:input.dates[0]!,changeSessions:[0],evidence:'Keep Monday unchanged'});
 malicious.week.days[0]!.sessions[0]!.activities[0]!.amount=300;malicious.changedDates.unshift(input.dates[0]!);
 assert.throws(()=>checkReview(malicious,request),{code:'saved_day_changed'});
});
test('unrelated answers and still-ambiguous protections fail closed; a named edit resolves a pending keep-the-rest target',()=>{
 for(const feedback of ['The weather is good.','Split Tuesday into shorter sessions.','Monday looks good.','Keep the important bit unchanged; split Tuesday.']){
  const request={...input,review:{...input.review,context:{feedback:'Keep the important bit unchanged; split Tuesday.',question:'Which work should stay unchanged?'},feedback}},raw=output();
  raw.scope=[{date:input.dates[1]!,changeSessions:[0],evidence:'split Tuesday'}];
  assert.equal(reviewProtections(request.review,request.dates).unresolved,true);
  assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
 }
 const multiple={...input.review,context:{feedback:'Keep the important bit unchanged; keep my favourite work unchanged; split Tuesday.',question:'Which work should stay unchanged?'},feedback:'Keep Monday unchanged; split Tuesday.'};
 assert.equal(reviewProtections(multiple,input.dates).unresolved,true);
 const remainder={...input.review,context:{feedback:'Replace the awkward exercise; keep all other exercises unchanged.',question:'Which exercise should change?'},feedback:'Replace FQ-ACT-00003.'};
 const locks=reviewProtections(remainder,input.dates);assert.equal(locks.unresolved,false);assert.equal(locks.activities.length,2);assert.ok(locks.activities.every(r=>r.id==='FQ-ACT-00148'));
 assert.equal(reviewProtections({...remainder,feedback:'Keep Monday unchanged.'},input.dates).unresolved,true);
});
test('short preservation answers resolve saved targets without granting edit authority',()=>{
 const context={feedback:'Keep Wednesday unchanged. Keep the important bit unchanged; split Tuesday.',question:'Which work do you want to keep unchanged?'};
 for(const feedback of ['Monday.','The Monday walk.','I mean Monday.','Monday morning.','Hands-elevated push-up.']){
  const request={...input,review:{...input.review,context,feedback}},raw=output();
  raw.scope=[{date:input.dates[1]!,changeSessions:[0],evidence:'split Tuesday'}];
  const locks=reviewProtections(request.review,input.dates);assert.equal(locks.unresolved,false,feedback);assert.ok(locks.days.includes(input.dates[2]!));
  assert.ok(checkReview(raw,request).week,feedback);
  const exercise=feedback==='Hands-elevated push-up.';
  if(exercise){assert.equal(locks.activities[0]!.id,'FQ-ACT-00003');raw.week.days[1]!.sessions[1]!.activities[1]!.amount=4}
  else{
   raw.week.days[0]!.sessions[0]!.activities[0]!.amount=300;raw.changedDates.unshift(input.dates[0]!);
   raw.scope.unshift({date:input.dates[0]!,changeSessions:[0],evidence:feedback});
  }
  assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'},feedback);
  const continued={...request,review:{...request.review,context:{feedback:context.feedback+'\n'+feedback,question:'How should Tuesday change?'},feedback:'Split Tuesday into shorter sessions.'}};
  assert.equal(reviewProtections(continued.review,input.dates).unresolved,false,feedback);
 }
 const request={...input,review:{...input.review,context,feedback:'Monday.'}};
 const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5});
 const locks=JSON.parse(JSON.parse(prepareReview(provider,request).body).input).preservation;
 assert.equal(locks.unresolved,false);assert.ok(locks.days.includes(input.dates[0]!));
});
test('short answer recovery requires a preservation question and one unambiguous saved target',()=>{
 const context={feedback:'Keep the important bit unchanged; split Tuesday.',question:'Which work do you want to keep unchanged?'};
 for(const feedback of ['Monday looks good.','Not Monday.','Monday or Tuesday.','The weather is good.','Walking.','Wednesday walk.','I mean the important bit.']){
  const request={...input,review:{...input.review,context,feedback}},raw=output();raw.scope=[{date:input.dates[1]!,changeSessions:[0],evidence:'split Tuesday'}];
  assert.equal(reviewProtections(request.review,input.dates).unresolved,true,feedback);
  assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'},feedback);
 }
 assert.equal(reviewProtections({...input.review,context:{...context,question:'Which day should change?'},feedback:'Monday.'},input.dates).unresolved,true);
 assert.equal(reviewProtections({...input.review,context:{...context,feedback:'Keep the important bit unchanged; keep my favourite work unchanged; split Tuesday.'},feedback:'Monday.'},input.dates).unresolved,true);
});
test('a short named-session answer protects that saved session while the requested other session can change',()=>{
 const week=revisedWeek(),saved=checkWeek(week,input);
 const request={...input,review:{outline:saved.outline,days:saved.details,context:{feedback:'Keep Monday unchanged. Keep the important bit unchanged; shorten Tuesday evening.',question:'Which session do you want to keep unchanged?'},feedback:'Tuesday morning.'}};
 const locks=reviewProtections(request.review,input.dates);assert.equal(locks.unresolved,false);assert.ok(locks.sessions.some(s=>s.date===input.dates[1]&&s.session===0));assert.ok(!locks.days.includes(input.dates[1]!));
 const raw={...output(),week:structuredClone(week),scope:[{date:input.dates[1]!,changeSessions:[0,1],evidence:'shorten Tuesday evening'}]};
 raw.week.days[1]!.sessions[1]!.activities[0]!.sets=2;assert.ok(checkReview(raw,request).week);
 raw.week.days[1]!.sessions[0]!.activities[0]!.amount=200;assert.throws(()=>checkReview(raw,request),{code:'saved_day_changed'});
});
