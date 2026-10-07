import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { completeFixture,syntheticAnswers } from './completePlanFixture.js';
import { encodeCompleteWire } from './completePlanWire.js';
import { checkComplete } from './completePlanning.js';
import { intakeSummary } from './fixedIntake.js';
import { CompleteValidationError,safeValidationDiagnostic,schemaPosition } from './planDiagnostics.js';
import { planningService } from './planning.js';
import type { PlanningStore,PlanningWork } from './planningStore.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import { recordPlanDiagnostic } from './planDiagnosticStore.js';

const dates=Array.from({length:7},(_,i)=>`2026-10-${String(5+i).padStart(2,'0')}`);
const input:PlanningWork['input']={kind:'week',schemaVersion:'complete-week-v1',dates,summary:intakeSummary({version:1,answers:syntheticAnswers}),profile:{age:30,heightInches:68,weightLb:155}};
const raw=()=>encodeCompleteWire({result:{kind:'plan',plan:completeFixture(dates)}}) as any;
function failure(value:any,context=input){try{checkComplete(value,context);assert.fail('expected rejection')}catch(e){assert(e instanceof CompleteValidationError);return e;}}
test('lookup, tracking, equipment and load preserve public codes with bounded activity locations',()=>{
 let w=raw();w.result.days[1].sessions[0].blocks[0].exercises[0].activityId='FQ-ACT-99999';
 let e=failure(w);assert.equal(e.code,'catalog_coverage');assert.deepEqual(e.diagnostic,{version:1,stage:'catalog',rule:'lookup',day:1,session:0,block:0,exercise:0,activityId:'FQ-ACT-99999',actualKind:'duration'});
 w=raw();Object.assign(w.result.days[0].sessions[0].blocks[0].exercises[0],{activityId:'FQ-ACT-00167',targetKind:'repetitions',targetMin:5,targetMax:5});
 e=failure(w);assert.equal(e.code,'catalog_coverage');assert.equal(e.diagnostic.rule,'tracking');assert.equal(e.diagnostic.actualKind,'repetitions');assert(e.diagnostic.allowedKinds?.includes('count'));assert(!e.diagnostic.allowedKinds?.includes('repetitions'));
 w.result.days[0].sessions[0].blocks[0].exercises[0].targetKind='count';assert.equal(checkComplete(w,input).result.kind,'plan');
 w=raw();Object.assign(w.result.days[0].sessions[0].blocks[0].exercises[0],{activityId:'FQ-ACT-00046',targetKind:'repetitions',targetMin:8,targetMax:12});
 e=failure(w,{...input,summary:intakeSummary({version:1,answers:syntheticAnswers.map((v,i)=>i===2?'No equipment':v)})});assert.equal(e.diagnostic.rule,'equipment');assert.equal(e.code,'catalog_coverage');
 w=raw();Object.assign(w.result.days[0].sessions[0].blocks[0].exercises[0],{loadValue:10,loadUnit:'kg'});e=failure(w);assert.equal(e.diagnostic.rule,'load');assert.equal(e.code,'invalid_plan:load');
});
test('active recovery, schema, conversion and structural failures retain exact safe positions',()=>{
 let w=raw(),b=w.result.days[0].sessions[1].blocks[0];Object.assign(b,{recoveryPlacement:'after_each_round',recoveryActivity:{...b.exercises[0],activityId:'FQ-ACT-99999'}});
 let e=failure(w);assert.equal(e.diagnostic.recovery,true);assert.equal(e.diagnostic.session,1);assert.equal(e.diagnostic.exercise,undefined);
 w=raw();w.result.days[1].sessions[0].blocks[0].exercises[0].activityId='PRIVATE-SECRET-HEALTH';e=failure(w);assert.equal(e.diagnostic.stage,'schema');assert.equal(e.diagnostic.day,1);assert.equal(e.diagnostic.exercise,0);assert(!JSON.stringify(e.diagnostic).includes('PRIVATE'));
 w=raw();w.result.days[1].sessions[0].blocks[0].exercises[0].rpeMax=null;e=failure(w);assert.equal(e.diagnostic.stage,'conversion');assert.equal(e.diagnostic.rule,'pair');assert.equal(e.diagnostic.day,1);assert.equal(e.diagnostic.exercise,0);
 w=raw();w.result.days[1].sessions[0].blocks[0].exercises[0].distanceUnit='mi';e=failure(w);assert.equal(e.diagnostic.rule,'unit');
 w=raw();w.result.days[1].sessions[0].blocks[0].recoveryPlacement=null;e=failure(w);assert.equal(e.diagnostic.rule,'recovery');assert.equal(e.diagnostic.recovery,true);
 w=raw();w.result.days[1].sessions[0].blocks[0].exercises[0].targetMin=90;w.result.days[1].sessions[0].blocks[0].exercises[0].targetMax=60;e=failure(w);assert.equal(e.diagnostic.stage,'structure');assert.equal(e.diagnostic.rule,'exercise');assert.equal(e.diagnostic.day,1);
 w=raw();w.result.days[1].sessions[0].blocks[0].rounds=1;e=failure(w);assert.equal(e.diagnostic.stage,'structure');assert.equal(e.diagnostic.rule,'recovery');
 w=raw();w.result.days[1].sessions[0].durationMinutes.min=100;e=failure(w);assert.equal(e.diagnostic.rule,'overview');assert.equal(e.diagnostic.day,1);assert.equal(e.diagnostic.session,0);
});
test('sanitization rejects hostile values and drops arbitrary keys, paths and validator details',()=>{
 const secret='secret-key PRIVATE health and equipment';
 assert.equal(safeValidationDiagnostic({stage:secret,rule:secret}),undefined);
 const safe=safeValidationDiagnostic({stage:'catalog',rule:'tracking',day:999,session:-1,block:0,exercise:0,recovery:true,activityId:secret,actualKind:secret,allowedKinds:['count',secret,'count'],prompt:secret,headers:secret,error:secret});
 assert.deepEqual(safe,{version:1,stage:'catalog',rule:'tracking',block:0,recovery:true,allowedKinds:['count']});
 assert.deepEqual(schemaPosition([{instancePath:'/result/days/1/sessions/2/blocks/3/recoveryActivity/private-secret',params:{additionalProperty:secret},message:secret} as any]),{day:1,session:2,block:3,recovery:true});
 assert.deepEqual(schemaPosition([{instancePath:'/private-secret/1',message:secret} as any]),{});
 assert(!JSON.stringify(safe).includes(secret));
});
test('diagnostic failure never masks validation, changes settlement or dispatches twice; provider failures stay distinct',async()=>{
 const a={userId:'synthetic-owner',sessionId:'synthetic-session'},events:string[]=[];let proposal=raw(),providerFailure=false,diagnostics=0;
 Object.assign(proposal.result.days[0].sessions[0].blocks[0].exercises[0],{activityId:'FQ-ACT-00167',targetKind:'repetitions',targetMin:5,targetMax:5});
 const work={attempt:'attempt-one',input,body:'{}'} as PlanningWork;
 const store={claim:async()=>work,settle:async()=>{events.push('settle')},recordValidation:async(_a:any,w:PlanningWork,d:any)=>{diagnostics++;assert.equal(w.attempt,'attempt-one');assert.equal(d.rule,'tracking');events.push('diagnostic');throw Error('private database failure')},finish:async(_a:any,_w:any,value:any,error:any)=>{events.push('finish');assert.equal(value,undefined);assert.equal(error,providerFailure?'provider_error':'catalog_coverage')},read:async()=>({summary:null,plans:[]})} as unknown as PlanningStore;
 const provider={mode:'test',capMicro:7000000,prepare(){throw Error('unused')},model:'mock',cost:()=>10,call:async()=>{events.push('dispatch');return {proposal,usage:{input:1,output:1,cached:0,cacheWrite:0},...(providerFailure?{failure:'provider_error'}:{})}}} as OnboardingProvider;
 const service=planningService(store,provider,'test');await service.generate(a,{} as any,async()=>true);assert.deepEqual(events,['dispatch','settle','diagnostic','finish']);
 events.length=0;providerFailure=true;await service.generate(a,{} as any,async()=>true);assert.deepEqual(events,['dispatch','settle','finish']);assert.equal(diagnostics,1);
});
test('persistence failures rollback independently and always release the client without private logs',async()=>{
 const a={userId:'synthetic-owner',sessionId:'synthetic-session'},work={attempt:'attempt',planId:'plan'} as PlanningWork;
 for(const fail of ['connect','BEGIN','INSERT','COMMIT']){
  const calls:string[]=[];let released=0;
  const pool={connect:async()=>{if(fail==='connect')throw Error('secret');return {query:async(sql:string)=>{calls.push(sql);if(sql.startsWith(fail))throw Error('secret')},release:()=>{released++}}}} as unknown as Pool;
  await recordPlanDiagnostic(pool,a,work,{stage:'catalog',rule:'lookup'});
  if(fail!=='connect'){assert(calls.includes('ROLLBACK'));assert.equal(released,1);}else assert.equal(released,0);
 }
});
