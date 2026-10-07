import test from 'node:test';import assert from 'node:assert/strict';
import{preparePair,callWeekly,runVariant,formattingA,formattingB}from'./format-comparison.mjs';
import{openAIProvider}from'../dist/onboardingProvider.js';import{intakeSummary}from'../dist/fixedIntake.js';
const provider=openAIProvider({key:'mock',model:'gpt-6-luna',capMicro:7000000,inputRate:.1,cachedRate:.01,cacheWriteRate:.125,outputRate:.5});
const input={kind:'week',summary:intakeSummary({version:1,answers:['General fitness','Daily walking','Bodyweight only','Flexible','None']}),dates:Array.from({length:7},(_,i)=>`2026-10-${String(5+i).padStart(2,'0')}`)};
const pair=preparePair(provider,input);
function response(text,status='completed'){return new Response(JSON.stringify({id:'resp_synthetic',status,usage:{input_tokens:10000,output_tokens:20000,input_tokens_details:{cached_tokens:1000,cache_write_tokens:100}},output:[{type:'message',content:[{type:'output_text',text}]}]}),{headers:{'x-request-id':'req_synthetic'}})}
test('only schema enforcement and exact final-format sentence differ; catalog/settings identical',()=>{
 const a=JSON.parse(pair.A.body),b=JSON.parse(pair.B.body);assert.equal(b.text,undefined);assert.equal(a.text.format.name,'complete_week_units_v2');assert.equal(a.max_output_tokens,48000);assert.deepEqual(a.reasoning,{effort:'low'});b.text=a.text;b.input=b.input.replace(formattingB,formattingA);assert.deepEqual(a,b);assert.ok(pair.diff.maximumReservedMicro<=100000);
});
test('plain weekly request dispatches once with unchanged body and accepts >64KB text and >onboarding token limits',async()=>{
 let calls=0;const raw='test '.repeat(14000);const result=await callWeekly(pair.B.body,'mock',AbortSignal.timeout(2000),async(url,options)=>{calls++;assert.equal(options.body,pair.B.body);assert.equal(url,'https://api.openai.com/v1/responses');return response(raw)});assert.equal(calls,1);assert.equal(result.rawText,raw);assert.equal(result.failure,undefined);assert.equal(result.usage.output,20000);
});
test('both formats dispatch once, preserve raw output, save then settle before app validation',async()=>{
 for(const name of ['A','B']){let calls=0;const events=[];const raw=name==='A'?'{}':'plain result';const result=await runVariant({prepared:pair[name],key:'mock',attempt:name,provider,fetcher:async()=>{calls++;return response(raw)},save:async r=>{assert.equal(r.rawText,raw);events.push('save')},settle:async(id,cost,diagnostic)=>{assert.equal(id,name);assert.equal(cost,11250);assert.equal(diagnostic.requestId,'req_synthetic');events.push('settle')},validate:name==='A'?()=>{events.push('validate');throw Object.assign(Error(),{code:'catalog_coverage'})}:undefined});assert.equal(calls,1);assert.deepEqual(events,name==='A'?['save','settle','validate']:['save','settle']);if(name==='A')assert.equal(result.validation.code,'catalog_coverage');}
});
test('incomplete/provider failures never retry; usage settles and unknown charges remain uncertain',async()=>{
 for(const failure of ['incomplete','network']){let calls=0;let settled;const r=await runVariant({prepared:pair.B,key:'mock',attempt:'test',provider,fetcher:async()=>{calls++;if(failure==='network')throw Error('private error');return response('partial','incomplete')},save:async()=>{},settle:async(id,cost)=>{settled=cost}});assert.equal(calls,1);assert.equal(settled,failure==='network'?null:11250);assert.equal(r.failure,failure==='network'?'provider_error':'incomplete');}
});
test('private output save failure still settles measured usage without retry',async()=>{
 let calls=0,settled=false;await assert.rejects(runVariant({prepared:pair.B,key:'mock',attempt:'test',provider,fetcher:async()=>{calls++;return response('text')},save:async()=>{throw Error('disk failure')},settle:async()=>{settled=true}}),/disk failure/);assert.equal(calls,1);assert.equal(settled,true);
});
