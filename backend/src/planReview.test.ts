import type { PlanningInput } from './planningDomain.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReview,prepareReview,protectedDates } from './planReview.js';
import { reviewScope } from './planReviewScope.js';
import { reviewInput,reviewWeek,revisedWeek,reviewFeedback } from './planReviewFixture.js';
import { checkWeek } from './weeklyPlanning.js';
import { checkDurations,explicitTimeLimits,minimumMinutes } from './planningDuration.js';
import { openAIProvider,serializeInput } from './onboardingProvider.js';
const base=checkWeek(reviewWeek(),reviewInput);
const input:PlanningInput&{review:NonNullable<PlanningInput['review']>}={...reviewInput,review:{feedback:reviewFeedback,context:null,outline:base.outline,days:base.details}};
const output=()=>({week:revisedWeek(),changedDates:[input.dates[1]!],reply:'Monday is unchanged. Tuesday now has two shorter sessions, with introductory speed work replacing some walking.',lastingPreference:null});
test('review uses the same seven dates, changes actual Tuesday work, keeps Monday and all unaffected work, and accounts for every goal',()=>{
  const checked=checkReview(output(),input);assert.ok(checked.week);
  assert.deepEqual(checked.week.details[0],base.details[0]);assert.deepEqual(checked.week.details.slice(2),base.details.slice(2));
  assert.equal(checked.week.details[1]!.sessions.length,2);assert.equal(checked.week.details[1]!.sessions[1]!.activities[0]!.id,'FQ-ACT-00145');
  assert.equal(checked.week.outline.goalDecisions!.length,3);assert.deepEqual(checked.week.details.map(d=>d.date),input.dates);
  assert.deepEqual(protectedDates(reviewFeedback,input.dates),[input.dates[0]]);
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
test('independent keep/change instructions have the same scope with commas, semicolons and conjunctions',()=>{
  const expected=reviewScope(input.review,input.dates);
  for(const separator of [';',',',', and',' and']){
    const feedback=reviewFeedback.replace(';',separator),review={...input.review,feedback};
    assert.deepEqual(reviewScope(review,input.dates),expected,feedback);
    assert.ok(checkReview(output(),{...input,review}).week,feedback);
    const forbidden=output();forbidden.week.days[0]!.sessions[0]!.activities[0]!.amount=300;forbidden.changedDates.unshift(input.dates[0]!);
    assert.throws(()=>checkReview(forbidden,{...input,review}),{code:'saved_day_changed'},feedback);
  }
});
test('commas and conjunctions inside day lists preserve all keep and change targets',()=>{
  const feedback='Keep Monday, Wednesday and Friday exactly as they are, split Tuesday, Thursday and Saturday into shorter sessions.';
  const review={...input.review,feedback},scope=reviewScope(review,input.dates);
  assert.deepEqual(scope.protectedDays,[input.dates[0],input.dates[2],input.dates[4]]);
  assert.deepEqual(scope.changes?.map(s=>s.date),[input.dates[1],input.dates[3],input.dates[5]]);
  assert.ok(checkReview(output(),{...input,review}).week);
  const forbidden=output();forbidden.week.days[2]!.sessions=structuredClone(forbidden.week.days[0]!.sessions);forbidden.changedDates.push(input.dates[2]!);
  assert.throws(()=>checkReview(forbidden,{...input,review}),{code:'saved_day_changed'});
});
test('a kept named day does not restrict a request to change the rest of the week',()=>{
  for(const feedback of ['Keep Monday exactly as it is; split the rest of the week into shorter sessions and give speed work a place.','Keep Monday exactly as it is; the rest of the week would suit me better with smaller sessions and some speed work.']){
    const checked=checkReview(output(),{...input,review:{...input.review,feedback}});
    assert.deepEqual(checked.week!.details[0],base.details[0]);assert.equal(checked.week!.details[1]!.sessions.length,2);
  }
});
test('clarification mentions cannot revoke a keep, but explicit later consent can change that work',()=>{
  const context={feedback:reviewFeedback,question:'Which sessions should be split?'};
  const followup={...input,review:{...input.review,context,feedback:'Tuesday only; Monday is still good.'}};
  assert.ok(checkReview(output(),followup).week);
  const unauthorized=output();unauthorized.week.days[0]!.sessions[0]!.activities[0]!.amount=300;unauthorized.changedDates.unshift(input.dates[0]!);
  assert.throws(()=>checkReview(unauthorized,followup),{code:'saved_day_changed'});
  const consent={...followup,review:{...followup.review,feedback:'Actually shorten Monday too; split Tuesday as requested.'}};
  const changed=checkReview(unauthorized,consent);
  assert.equal(changed.week!.details[0]!.sessions[0]!.activities[0]!.amount,300);
  const continued={...consent,review:{...consent.review,context:{feedback:reviewFeedback+'\n'+consent.review.feedback,question:'Would the shorter walk fit?'},feedback:'Yes, that shorter walk fits.'}};
  assert.ok(checkReview(unauthorized,continued).week);
  const noConsent={...followup,review:{...followup.review,feedback:"Don't shorten Monday; split Tuesday only."}};
  assert.throws(()=>checkReview(unauthorized,noConsent),{code:'saved_day_changed'});
});
test('session-level keeps permit changes to another session on the same day and preserve kept prescriptions/focus',()=>{
  const savedWeek=revisedWeek(),saved=checkWeek(savedWeek,input);
  const sessionInput={...input,review:{feedback:'Keep Tuesday morning exactly as it is and shorten Tuesday evening.',context:null,outline:saved.outline,days:saved.details}};
  const response={...output(),week:structuredClone(savedWeek)};
  response.week.days[1]!.sessions[1]!.activities[0]!.sets=2;
  for(const separator of [' and ', ', ', ', and ', '; ']){
    const feedback=sessionInput.review.feedback.replace(' and ',separator);
    assert.ok(checkReview(response,{...sessionInput,review:{...sessionInput.review,feedback}}).week);
  }
  const forbidden=structuredClone(response);forbidden.week.days[1]!.sessions[0]!.activities[0]!.amount=200;
  assert.throws(()=>checkReview(forbidden,sessionInput),{code:'saved_day_changed'});
  const previousWholeDay={...sessionInput,review:{...sessionInput.review,context:{feedback:'Keep Tuesday exactly as it is.',question:'Which session may change?'},feedback:'Shorten Tuesday evening only.'}};
  assert.ok(checkReview(response,previousWholeDay).week);
  assert.throws(()=>checkReview(forbidden,previousWholeDay),{code:'saved_day_changed'});
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
    const raw=output();raw.changedDates=[];raw.week.goalDecisions=[];raw.week.days.forEach(d=>d.sessions=[]);raw.week.clarification={question:'Should Monday stay unchanged, or may its workload change?',reason:'Those instructions require different prescriptions.'};
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
