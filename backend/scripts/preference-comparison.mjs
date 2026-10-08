// One owner-authorized diagnostic batch; never imported by the application.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,open,chmod,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {prepareComplete,checkComplete} from '../dist/completePlanning.js';
import {configuredProvider,openAIProvider} from '../dist/onboardingProvider.js';
import {weeklyLimits} from '../dist/weeklyPlanning.js';
import {createPool} from '../dist/profileStore.js';
import {postgresOnboardingStore} from '../dist/onboardingStore.js';
export const batch='preference-schedule-v1';
export const order=['A1','B1','B2','A2'];
export const oldSchedule='Choose the training structure and session distribution that best\nfit my goals, availability and limitations.';
export const newSchedule="Build the weekly schedule around my goals and stated training preferences, within my availability and limitations. If I prefer multiple sessions per day, use purposeful separate sessions throughout the week where practical. Distribute an appropriate workload across those sessions; don't add unnecessary volume merely to create more sessions.";
export const baselineSha='b3c6bb37b5039964e88e4b6bd518b06d6b5a8cf13d6b59119b3a5fa52f2c06a0';
export const rubric={
 distribution:'Purposeful distinct sessions distributed across the full week AND today-onward view; a token second session on a hidden past day is insufficient. Inspect purposes, not just counts.',
 goals:'Inspect every baseline goal for suitable work or a specific grounded limitation, rather than assuming labels establish coverage.',
 limits:'Respect the reported per-session limit, equipment and actual availability. Do not interpret per-session as a daily cap or alter original preferences.',
 workload:'Inspect total weekly work, hard/easy placement, rest, overlapping stress and whether separation adds unnecessary volume.',
 prescriptions:'Run the production validator; also inspect exercise feasibility, duration/recovery arithmetic, numeric doses, per-side/per-round semantics and session time feasibility.',
 failures:'Keep all failures, refusals, timeouts and unavailable results. No retries, replacement samples or paid graders.',
 decision:'Release only if BOTH candidate samples support useful preference-following improvement over controls without obvious quality or validation regressions. Two samples each are exploratory, not proof of consistency.'
};
export const sha=s=>createHash('sha256').update(s).digest('hex');
export async function privateSave(dir,name,value){await writeFile(new URL(name,dir),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});}
export async function startOnce(dir){const h=await open(new URL(`${batch}.started`,dir),'wx',0o600);await h.close();}
export function prepareBatch(provider,input){
 // The candidate was not released; construct both frozen arms from the unchanged active prompt.
 const A=prepareComplete(provider,input),a=JSON.parse(A.body);assert.equal(a.input.split(oldSchedule).length,2);assert.equal(a.model,'gpt-6-luna');assert.deepEqual(a.reasoning,{effort:'high'});assert.equal(a.text.format.name,'complete_week_units_v2');assert.equal(a.max_output_tokens,48000);
 const b=structuredClone(a);b.input=b.input.replace(oldSchedule,newSchedule);const body=JSON.stringify(b),B={body,reserveMicro:provider.cost({input:Buffer.byteLength(body),output:48000,cached:0,cacheWrite:0})};
 const restored=structuredClone(b);restored.input=restored.input.replace(newSchedule,oldSchedule);assert.deepEqual(restored,a);
 const entries=order.map(name=>({name,...(name.startsWith('A')?A:B)}));const maximumReservedMicro=entries.reduce((n,e)=>n+e.reserveMicro,0);assert(maximumReservedMicro<=180000,'All four requests exceed batch reservation cap');
 return {entries,maximumReservedMicro,diff:{oldSchedule,newSchedule,onlyChangedField:'input scheduling sentence',settings:{model:b.model,reasoning:b.reasoning,max_output_tokens:b.max_output_tokens,service_tier:b.service_tier,store:b.store,stream:b.stream,truncation:b.truncation},schemaSha:sha(JSON.stringify(b.text)),catalogSha:sha(b.input.split('Exercise catalog:\n')[1]),requests:entries.map(e=>({name:e.name,bytes:Buffer.byteLength(e.body),sha256:sha(e.body),reserveMicro:e.reserveMicro}))}};
}
export function assertHeadroom(budget,total){assert.equal(Number(budget.cap_micro),7000000);assert.equal(Number(budget.evaluation_cap_micro),250000);assert(total<=180000);assert(total<=Number(budget.cap_micro)-Number(budget.spent_micro)-Number(budget.reserved_micro),'Insufficient lifetime headroom for all four');assert(total<=Number(budget.evaluation_cap_micro)-Number(budget.evaluation_spent_micro)-Number(budget.evaluation_reserved_micro),'Insufficient evaluation headroom for all four');}
export async function reserveBatch(pool,account,entries,cap){
 assert.deepEqual(entries.map(e=>e.name),order);assert(entries.reduce((n,e)=>n+e.reserveMicro,0)<=180000);
 const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[account.userId]);await c.query('SELECT pg_advisory_xact_lock(71629101)');
  assert.equal(Number((await c.query('SELECT count(*) FROM fitquest.onboarding_attempts WHERE user_id=$1 AND prompt_version LIKE $2',[account.userId,`${batch}-%`])).rows[0].count),0,'Batch already attempted');
  for(const e of entries){await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,'evaluation','not_dispatched','gpt-6-luna',$3,'complete-week-v1')",[account.userId,e.attempt,`${batch}-${e.name}`]);assert.equal((await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[e.attempt,e.reserveMicro,cap])).rows[0].allowed,true,'All four must fit current durable headroom');}
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export function capturedProvider(config,fetcher=fetch){
 let captured={rawResponse:'',rawText:''},sends=0;
 const provider=openAIProvider(config,async(url,options)=>{
  assert.equal(++sends,1,'No second dispatch');assert.equal(url,'https://api.openai.com/v1/responses');const req=JSON.parse(options.body);assert.deepEqual(req.reasoning,{effort:'high'});assert.equal(req.text.format.name,'complete_week_units_v2');
  const response=await fetcher(url,{...options,redirect:'error'}),chunks=[];let bytes=0;
  if(response.body){const r=response.body.getReader();while(true){const x=await r.read();if(x.done)break;bytes+=x.value.length;if(bytes>(response.ok?weeklyLimits.responseBytes:8192)){await r.cancel();captured.transport='response_limit';break}chunks.push(x.value)}}
  captured.rawResponse=Buffer.concat(chunks).toString('utf8');try{const data=JSON.parse(captured.rawResponse);captured.rawText=(data.output??[]).filter(x=>x.type==='message').flatMap(x=>x.content??[]).map(x=>x.type==='output_text'?x.text:x.type==='refusal'?x.refusal:'').join('\n');captured.responseId=data.id;}catch{}
  if(captured.transport)throw Error('bounded response limit');
  return new Response(captured.rawResponse,{status:response.status,headers:response.headers});
 });return {provider,captured:()=>captured,sends:()=>sends};
}
export async function runSample({entry,config,input,fetcher,settle,save,timeoutMs=weeklyLimits.timeoutMs}){
 const tap=capturedProvider(config,fetcher),start=performance.now();const result=await tap.provider.call(entry.body,AbortSignal.timeout(timeoutMs));if(tap.captured().transport)result.diagnostic={...result.diagnostic,transport:tap.captured().transport};
 const cost=result.usage?tap.provider.cost(result.usage):null;let saveError;try{await save('raw.json',{...tap.captured(),...result});await save('output.txt',tap.captured().rawText);}catch(e){saveError=e}
 await settle(entry.attempt,cost,result.diagnostic);if(saveError)throw saveError;
 let validation,decoded; if(!result.failure)try{decoded=checkComplete(result.proposal,input);validation={valid:true,kind:decoded.result.kind};}catch(e){validation={valid:false,code:e.code??'invalid_model_output',diagnostic:e.diagnostic};}
 if(decoded)await save('decoded.json',decoded);
 return {name:entry.name,attempt:entry.attempt,latencyMs:Math.round(performance.now()-start),sends:tap.sends(),reservedMicro:entry.reserveMicro,accountedMicro:cost,usage:result.usage,failure:result.failure,diagnostic:result.diagnostic,validation};
}
async function main(){
 const mode=process.argv[2];assert(['prepare','run'].includes(mode));const dir=new URL('../.ai-evaluation/',import.meta.url);await chmod(dir,0o700);assert.equal((await stat(dir)).mode&0o777,0o700);
 const baselineBytes=await readFile(new URL('owner-baseline-v1.json',dir),'utf8');assert.equal(sha(baselineBytes),baselineSha);const baseline=JSON.parse(baselineBytes);assert.equal(baseline.answersSha256,sha(JSON.stringify(baseline.answers)));assert.deepEqual(baseline.source.summary.map(x=>x.text),baseline.answers);
 const provider=configuredProvider({...process.env,ONBOARDING_AI_ENABLED:'true'});assert(provider);assert.equal(provider.capMicro,7000000);
 const rates=['OPENAI_INPUT_USD_PER_M','OPENAI_CACHED_USD_PER_M','OPENAI_CACHE_WRITE_USD_PER_M','OPENAI_OUTPUT_USD_PER_M'].map(k=>Number(process.env[k]));assert.deepEqual(rates,[.10,.01,.125,.50]);
 const input={kind:'week',schemaVersion:'complete-week-v1',summary:baseline.source.summary,dates:baseline.source.dates};const prepared=prepareBatch(provider,input),save=(name,value)=>privateSave(dir,`${batch}-${name}`,value);
 if(mode==='prepare'){for(const e of prepared.entries)await save(`${e.name}-request.json`,e.body);await save('request-diff.json',prepared.diff);await save('rubric.json',{...rubric,order,registeredAt:new Date().toISOString(),today:new Intl.DateTimeFormat('en-CA',{timeZone:baseline.source.time_zone??baseline.source.timeZone??'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),dates:input.dates});console.log(JSON.stringify({requests:prepared.diff.requests,maximumReservedMicro:prepared.maximumReservedMicro}));return;}
 assert.equal(process.env.FITQUEST_PREFERENCE_COMPARISON_APPROVED,'true');for(const e of prepared.entries)assert.equal(await readFile(new URL(`${batch}-${e.name}-request.json`,dir),'utf8'),e.body);
 const before=JSON.parse(await readFile(new URL(`${batch}-before.json`,dir),'utf8'));assert(Date.now()-Date.parse(before.checked_at)<300000,'Fresh ledger readback required');assertHeadroom(before.budget,prepared.maximumReservedMicro);assert.deepEqual(before.identity,{owner:1,emails:1,accounts:1});assert(Object.values(before.active).every(n=>n===0));
 const connection=new URL(process.env.DATABASE_URL);assert.equal(connection.username,'fitquest_app.wqvxddvihlobnalxpzow');assert.equal(connection.searchParams.get('sslmode'),'verify-full');assert(connection.hostname.endsWith('.supabase.com'));
 await startOnce(dir);const pool=createPool(connection.toString()),account={userId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',sessionId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},entries=prepared.entries.map(e=>({...e,attempt:randomUUID()}));
 try{await reserveBatch(pool,account,entries,provider.capMicro);await save('reservations.json',{entries:entries.map(({body,...e})=>e),maximumReservedMicro:prepared.maximumReservedMicro,at:new Date().toISOString()});const store=postgresOnboardingStore(pool),config={key:process.env.OPENAI_API_KEY,model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5};
  for(const entry of entries){console.log(JSON.stringify({starting:entry.name}));const result=await runSample({entry,config,input,settle:(id,cost,d)=>store.settle(account,id,cost,d),save:(suffix,v)=>save(`${entry.name}-${suffix}`,v)});await save(`${entry.name}-result.json`,result);console.log(JSON.stringify(result));}
  await save('completed.json',{at:new Date().toISOString(),dispatches:4});
 }finally{await pool.end()}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Comparison stopped; no automatic retry. Inspect private batch state and accounting.');process.exitCode=1;});
