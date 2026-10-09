import test from 'node:test';
import assert from 'node:assert/strict';
import {Ajv} from 'ajv';
import {documentPrompt,prepareDocument,checkDocument,documentSchema} from './documentPlanning.js';
import {documentOverview,validDocumentOverview,validSavedDocument} from './documentPlanContract.js';
import {rowDocumentFixture as documentFixture,documentFixture as legacyDocumentFixture} from './documentPlanFixture.js';
import {intakeSummary} from './fixedIntake.js';
import {openAIProvider} from './onboardingProvider.js';
const dates=Array.from({length:7},(_,i)=>`2026-10-${String(i+5).padStart(2,'0')}`),answers=['Build confidence & stamina','A few walks','Floor and cushions','Two short sessions when useful.\n20–30 minutes each.','None'];
const input={kind:'week' as const,schemaVersion:'document-week-v2' as const,dates,summary:intakeSummary({version:1,answers}),profile:{age:30,heightInches:68,weightLb:155}};
const expected=`I want you to come up with a workout plan for me. My goals are: ${answers[0]}. My current activity is: ${answers[1]}. My available equipment is: ${answers[2]}. My training preferences are: ${answers[3]}. My limitations are: ${answers[4]}.

I want you to build a plan for the week to help me achieve my goals. First give the high level plan, then after that, create a workout/exercise list for each session. For the high level plan, return a list with days of the week until Sunday, with each day's session(s) underneath it, the goal for each session and the rough time to complete the session.

The week is Monday, 2026-10-05, through Sunday, 2026-10-11, inclusive.

Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and ordered exercises. Rest days have empty session lists. Each exercise row has a free-text exercise name and a concise free-text prescription. Preserve essential sets, reps, load, time, distance, units, intervals, recovery, per-side/per-round meaning, effort and superset or mixed-work relationships as applicable. Keep essential execution and safety instructions in the relevant prescription. Use plain text, not Markdown, for rows. Do not repeat session goals or introductions in rows. Omit unrequested general weekly commentary; never attach a weekly approach to the first or any other session. Return only the provided display schema.`;
test('document request uses exact concise context and small display schema, no catalog or exercise contract, and low reasoning',()=>{
 const provider={model:'gpt-6.1-sol',mode:'test' as const,capMicro:7000000,cost:()=>19,prepare(){throw Error('No intake')},call:async()=>{throw Error('No live calls')}};const p=prepareDocument(provider,input),r=JSON.parse(p.body);assert.equal(documentPrompt(answers,dates),expected);assert.equal(r.input,expected);assert.deepEqual(r.reasoning,{effort:'low'});assert.equal(r.model,'gpt-6.1-sol');assert.equal(p.reserveMicro,19);assert.deepEqual(Object.keys(documentSchema.properties),['days']);assert(Buffer.byteLength(JSON.stringify(documentSchema))<2100);assert(!/catalog|FQ-ACT|activityId|recoveryRest|loadInstruction|targetKind|blocks/.test(p.body));assert.equal(r.max_output_tokens,48000);
 const revised=JSON.parse(prepareDocument(provider,{...input,documentReview:{feedback:'Change Tuesday; keep Monday.',plan:documentFixture(dates)}}).body);assert(revised.input.startsWith(expected));assert(revised.input.includes('Change Tuesday; keep Monday.'));assert(revised.input.endsWith(JSON.stringify(documentFixture(dates))));assert.deepEqual(revised.reasoning,{effort:'low'});
});
test('document validates only display structure, dates and bounds; arbitrary activity prose survives unchanged',()=>{
 const p=documentFixture(dates);assert(new Ajv({strict:true}).compile(documentSchema)(p));assert.deepEqual(checkDocument(p,input),p);const overview=documentOverview(p);assert(validDocumentOverview(overview,dates));assert.equal(overview.days[0]!.sessions.length,2);assert.equal(overview.days[2]!.sessions.length,0);assert(!JSON.stringify(overview).includes('workoutMarkdown'));assert(!JSON.stringify(overview).includes('Crab reach'));
 p.days[0]!.sessions[0]!.exercises=[{exercise:'Arbitrary readable activity',prescription:'Free-form sets, pauses and load descriptions.'}];assert.equal(checkDocument(p,input),p);
 for(const mutate of [(p:any)=>p.days.pop(),(p:any)=>p.days.reverse(),(p:any)=>p.days[0].date='2026-10-99',(p:any)=>p.days[0].sessions[0].durationMinutes={min:40,max:20},(p:any)=>p.days[0].sessions[0].exercises[0].prescription=' ',(p:any)=>p.days[0].sessions[0].exercises[0].prescription='x'.repeat(1801),(p:any)=>p.days[0].sessions[0].blocks=[]]){const bad=documentFixture(dates);mutate(bad);assert.throws(()=>checkDocument(bad,input),{code:'invalid_document'});}
 const leaked=structuredClone(overview) as any;leaked.days[0].sessions[0].workoutMarkdown='private details';assert.equal(validDocumentOverview(leaked,dates),false);
});
test('real provider adapter dispatches the document wire once per initial/revision; handles refusal/incomplete without retries',async()=>{
 let calls=0,mode='completed';const p=openAIProvider({key:'synthetic-key',model:'gpt-6.1-sol',capMicro:7000000,inputRate:2,cachedRate:.1,cacheWriteRate:2.5,outputRate:10},async(_url,options)=>{calls++;const request=JSON.parse(String(options!.body));assert.equal(request.model,'gpt-6.1-sol');assert.equal(request.text.format.name,'document_week_v2');assert.deepEqual(request.reasoning,{effort:'low'});return new Response(JSON.stringify({status:mode==='incomplete'?'incomplete':'completed',usage:{input_tokens:100,output_tokens:2500},output:[{type:'message',content:[mode==='refused'?{type:'refusal',refusal:'Synthetic refusal'}:{type:'output_text',text:JSON.stringify(documentFixture(dates))}]}]}));});
 for(const source of [input,{...input,documentReview:{plan:documentFixture(dates),feedback:'Change Tuesday.'}}]){const prepared=prepareDocument(p,source),n=calls;const result=await p.call(prepared.body,new AbortController().signal);assert.equal(calls,n+1);assert.deepEqual(checkDocument(result.proposal,source),documentFixture(dates));assert.equal(prepared.reserveMicro,p.cost({input:Buffer.byteLength(prepared.body),output:48000,cached:0,cacheWrite:0}));}
 for(const failure of ['refused','incomplete']){mode=failure;const n=calls,result=await p.call(prepareDocument(p,input).body,new AbortController().signal);assert.equal(result.failure,failure);assert.equal(result.usage?.output,2500);assert.equal(calls,n+1);}
});

test('formatting is the only prompt change; coaching prefix and legacy work remain exact in explicit revisions',()=>{
 const oldFormatting="Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and the complete workout in workoutMarkdown. Rest days have empty session lists. Write clear, readable workout prescriptions with explicit units and recovery in Markdown. Use headings and lists where helpful. Return only the provided display schema.";
 const before=expected.slice(0,expected.lastIndexOf('\n\n')+2)+oldFormatting;
 assert.equal(documentPrompt(answers,dates).split('\n\n').slice(0,3).join('\n\n'),before.split('\n\n').slice(0,3).join('\n\n'));
 const legacy=legacyDocumentFixture(dates);legacy.days[0]!.sessions[0]!.workoutMarkdown='## Weekly approach\nKeep all specific prescribed work.\n'+legacy.days[0]!.sessions[0]!.workoutMarkdown;
 assert(validSavedDocument(legacy,dates,'document-week-v1'));assert(!validSavedDocument(legacy,dates,'document-week-v2'));assert(validSavedDocument(documentFixture(dates),dates,'document-week-v2'));assert(!validSavedDocument(documentFixture(dates),dates,'document-week-v1'));
 const provider={model:'gpt-6.1-sol',mode:'test' as const,capMicro:7000000,cost:()=>19,prepare(){throw Error('No intake')},call:async()=>{throw Error('No live calls')}};
 const revision=JSON.parse(prepareDocument(provider,{...input,documentReview:{plan:legacy,feedback:'Keep the exercises, remove the general weekly introduction.'}}).body);
 assert(revision.input.startsWith(expected));assert(revision.input.endsWith(JSON.stringify(legacy)));
 const rowSchema=(documentSchema.properties.days as any).items.properties.sessions.items.properties.exercises;
 assert.deepEqual(Object.keys(rowSchema.items.properties),['exercise','prescription']);assert.equal(rowSchema.items.additionalProperties,false);assert.deepEqual(rowSchema.items.required,['exercise','prescription']);
 const rows=documentFixture(dates).days[0]!.sessions[0]!.exercises;
 assert(rows.some(r=>r.prescription.includes('20 lb per hand')));assert(rows.some(r=>r.prescription.includes('200 m')));assert(rows.some(r=>r.prescription.includes('after each pair')));assert(rows.some(r=>r.prescription.includes('per side')));assert(rows.some(r=>r.prescription.includes('active recovery')));
 assert(!JSON.stringify(rows).includes('Weekly approach'));assert(!JSON.stringify(documentOverview(documentFixture(dates))).includes('prescription'));
});
