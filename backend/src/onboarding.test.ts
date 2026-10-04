import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsRecap, recapTopic, completeTopic, applyProposal, bounded, emptyContext, type ModelInput, type ModelProposal } from './onboardingDomain.js';
import { minimizeModelInput, configuredProvider, openAIProvider, serializeInput, validateProposal } from './onboardingProvider.js';
import { onboardingService } from './onboarding.js';
import type { OnboardingStore } from './onboardingStore.js';
import { buildApp } from './app.js';
import { Writable } from 'node:stream';

const proposal:ModelProposal={planningCheck:{status:'question',question:'What have you been practicing?',reason:'Understand current exposure'},trainingSummary:null,reply:'I understand.',additions:[{topic:'Goal',value:'tennis',origin:'user_report',source:'m1',quote:'tennis and a pull-up'}],nextQuestion:{topic:'Activity',text:'What have you been practicing?',decision:'Understand current exposure'},readiness:'ready_with_limits',limitations:['Current capacity unknown']};
const input:ModelInput={context:emptyContext(),sources:{m1:'tennis and a pull-up'},recent:[{role:'user',text:'tennis and a pull-up'}],knownProfileFields:['age','height','weight','gender','first name','last name']};
test('model validation rejects forged evidence and confirmations; report values always retain original words',()=>{
  assert.deepEqual(validateProposal(proposal),proposal);
  for(const bad of [{...proposal,reply:''},{...proposal,userId:'forged'},{...proposal,additions:[{...proposal.additions[0],review:'confirmed'}]},
    {...proposal,readiness:'medical_clearance'},{...proposal,nextQuestion:{topic:'A',text:'B',decision:'C',tools:[]}}]) assert.throws(()=>validateProposal(bad));
  for(const item of [{...proposal.additions[0]!,source:'m999'},{...proposal.additions[0]!,quote:'not present'}]) assert.throws(()=>applyProposal(emptyContext(),{...proposal,additions:[item]},input.sources,new Date().toISOString()));
  const canonical=applyProposal(emptyContext(),{...proposal,additions:[{...proposal.additions[0]!,value:'highest priority'}]},input.sources,new Date().toISOString());
  assert.equal(canonical.items[0]?.value,'tennis and a pull-up');assert.equal(canonical.items[0]?.review,'unreviewed');assert.equal(canonical.items[0]?.origin,'user_report');
  assert.equal(JSON.stringify(canonical).includes('highest priority'),false);
  const inferred=applyProposal(emptyContext(),{...proposal,additions:[{...proposal.additions[0]!,origin:'model_inference',value:'May prefer sport practice'}]},input.sources,new Date().toISOString());
  assert.equal(inferred.items[0]?.origin,'model_inference');assert.equal(inferred.items[0]?.review,'unreviewed');
});
test('skipped and already-collected topics cannot be asked again; bounded context fails without dropping content',()=>{
  for(const topic of ['age','height','weight','gender','first name','last name','Schedule']) {
    const context=emptyContext();context.skipped=['Schedule'];
    assert.throws(()=>applyProposal(context,{...proposal,nextQuestion:{topic,text:'Question',decision:'Reason'}},input.sources,new Date().toISOString()));
  }
  const context=emptyContext();context.limitations=['Restriction unresolved'];
  const next=applyProposal(context,proposal,input.sources,new Date().toISOString());assert.ok(next.limitations.includes('Restriction unresolved'));
  assert.throws(()=>serializeInput({...input,sources:{m1:'a'.repeat(25000)}},'synthetic'));
  context.items=Array.from({length:81},(_,i)=>({id:`i${i}`,topic:'Goal',value:'Keep all goals',origin:'user_report',review:'unreviewed',source:'m1',quote:'Keep all goals',supersedes:null,recordedAt:new Date().toISOString()}));
  assert.throws(()=>bounded(context));assert.equal(context.items.length,81);
});
test('qualitative synthetic cases preserve original reports, uncertainties and arbitrary goals in input',()=>{
  const cases=[['tennis and my first pull-up','Current sport and pulling experience'],['longevity and coordination','Everyday capabilities'],
    ['endurance and body composition','Priorities'],['my schedule varies every week','Availability'],['unsure what this knee discomfort means','Restriction uncertainty']];
  for(const [message,topic] of cases) {
    const body=JSON.parse(serializeInput({...input,sources:{m1:message!},recent:[{role:'user',text:message!}]},'synthetic'));
    assert.ok(body.input.includes(message));
    const result=applyProposal(emptyContext(),{...proposal,additions:[{topic:topic!,value:message!,origin:'user_report',source:'m1',quote:message!}],nextQuestion:{topic:topic!,text:'Tell me what matters most here.',decision:'Resolve relevant uncertainty'}},{m1:message!},new Date().toISOString());
    assert.equal(result.items[0]?.quote,message);assert.equal(result.items[0]?.review,'unreviewed');
  }
});
test('configuration fails closed; test provider cannot be installed in production',()=>{
  assert.equal(configuredProvider({}),undefined);
  assert.equal(configuredProvider({ONBOARDING_AI_ENABLED:'true',OPENAI_API_KEY:'synthetic'}),undefined);
  assert.throws(()=>onboardingService({} as OnboardingStore,{mode:'test'} as never,'production'));
});
test('approved non-renewing configuration rejects monthly budgets, missing fields, overspend and underpriced rates',()=>{
  const env={ONBOARDING_AI_ENABLED:'true',ONBOARDING_AI_APPROVED:'true',ONBOARDING_POLICY_APPROVED:'true',OPENAI_API_KEY:'synthetic',OPENAI_MODEL:'gpt-6-luna',ONBOARDING_TOTAL_USD:'7',OPENAI_INPUT_USD_PER_M:'0.1',OPENAI_CACHED_USD_PER_M:'0.01',OPENAI_CACHE_WRITE_USD_PER_M:'0.125',OPENAI_OUTPUT_USD_PER_M:'0.5'};
  assert.equal(configuredProvider(env)?.capMicro,7000000);
  for(const key of Object.keys(env))assert.equal(configuredProvider({...env,[key]:''}),undefined,key);
  for(const change of [{ONBOARDING_AI_ENABLED:'false'},{ONBOARDING_TOTAL_USD:'7.01'},{ONBOARDING_TOTAL_USD:'Infinity'},
    {ONBOARDING_TOTAL_USD:'0.0000001'},{ONBOARDING_TOTAL_USD:'',ONBOARDING_MONTHLY_USD:'7'},
    {OPENAI_INPUT_USD_PER_M:'0.001'},{OPENAI_OUTPUT_USD_PER_M:'0.01'},{OPENAI_CACHE_WRITE_USD_PER_M:'0.1'},
    {OPENAI_MODEL:'other-model'},{OPENAI_API_KEY:'   '}])assert.equal(configuredProvider({...env,...change}),undefined);
});
test('OpenAI adapter is stateless, bounded, strict, single call and conservatively reserves cache charges',async()=>{
  let calls=0;
  const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:1000000,inputRate:0.1,cachedRate:0.01,cacheWriteRate:0.125,outputRate:0.5},async(url,init)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(init!.body as string);
    assert.equal(body.service_tier,'default');assert.deepEqual(body.reasoning,{effort:'low'});assert.equal(body.store,false);assert.equal(body.truncation,'disabled');assert.equal(body.text.format.strict,true);assert.equal(body.max_output_tokens,2000);
    assert.equal(body.tools,undefined);assert.equal(body.previous_response_id,undefined);
    return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:30,cache_write_tokens:20}},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal)}]}]}));
  });
  const prepared=provider.prepare(input);assert.ok(prepared.reserveMicro>=Buffer.byteLength(prepared.body)*0.125+1000);
  const result=await provider.call(prepared.body,new AbortController().signal);assert.deepEqual(result.proposal,proposal);assert.equal(calls,1);assert.equal(provider.cost(result.usage!),23);
});
test('provider refusal, incomplete, malformed, timeout and oversized error payload stay sanitized',async()=>{
  for(const data of [{status:'incomplete',usage:{input_tokens:1,output_tokens:1}},
    {status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private raw text'}]}]},
    {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'malformed'}]}]}]) {
    const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:1000,inputRate:1,cachedRate:1,cacheWriteRate:1,outputRate:1},async()=>new Response(JSON.stringify(data)));
    const result=await provider.call(provider.prepare(input).body,new AbortController().signal);assert.ok(result.failure);assert.equal(JSON.stringify(result).includes('private raw text'),false);
  }
  for(const fetcher of [async()=>{throw Error('private raw error')},async()=>new Response('private raw error',{status:429}),async()=>new Response('x'.repeat(65000))]) {
    const provider=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:1000,inputRate:1,cachedRate:1,cacheWriteRate:1,outputRate:1},fetcher);
    const result=await provider.call(provider.prepare(input).body,new AbortController().signal);assert.equal(result.failure,'provider_error');assert.doesNotMatch(JSON.stringify(result),/private raw error|xxxx/);assert.ok(result.diagnostic);
  }
});
test('orchestrator timeout retains uncertain reservation and settles late measured usage without late content',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let finish!:(value:object)=>void;const settlements:(number|null)[]=[];let commits=0;
  const conversation={id:'synthetic',revision:1,state:'collecting' as const,confirmedRevision:null,context:emptyContext(),turns:[],profileChanged:false};
  const store={claim:async()=>({conversation,work:{attempt:'attempt',turnId:'turn',revision:1,profileVersion:'v',body:'{}',sources:{}}}),settle:async(_a:unknown,_id:unknown,cost:number|null)=>{settlements.push(cost)},
    operation:async()=>({status:'failed'}),finish:async(_a:unknown,_id:unknown,_w:unknown,context:unknown)=>{if(context)commits++;return conversation}} as unknown as OnboardingStore;
  const provider={mode:'test' as const,model:'synthetic',call:()=>new Promise(resolve=>{finish=resolve}),cost:()=>5} as never;
  const service=onboardingService(store,provider,'test');
  const request=service.command({userId:'synthetic',sessionId:'synthetic'},'synthetic',{operationId:'synthetic',expectedRevision:0,kind:'message',text:'Goals'},async()=>true);
  await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(30000);await request;
  assert.deepEqual(settlements,[null]);assert.equal(commits,0);
  finish({proposal,usage:{input:1,output:1,cached:0,cacheWrite:0}});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(settlements,[null,5]);assert.equal(commits,0);
});
test('expanded scheduling recap exceeding the existing reply bound settles usage but cannot publish partial validated content',async()=>{
  const conversation={id:'synthetic',revision:1,state:'collecting' as const,confirmedRevision:null,context:emptyContext(),turns:[],profileChanged:false};
  let finished:unknown[]=[];const settlements:number[]=[];
  const store={claim:async()=>({conversation,work:{attempt:'attempt',turnId:'turn',revision:1,profileVersion:'v',body:'{}',sources:{}}}),
    settle:async(_a:unknown,_id:unknown,cost:number)=>{settlements.push(cost)},operation:async()=>({status:'failed'}),
    finish:async(...args:unknown[])=>{finished=args;return conversation}} as unknown as OnboardingStore;
  const summary:NonNullable<ModelProposal['trainingSummary']>=['goals','availability','equipment','experience','limitations'].map(category=>({category:category as 'goals',text:'Synthetic '.repeat(34),origin:'model_inference'}));
  summary.push({category:'availability',text:'Additional schedule '.repeat(17),origin:'model_inference'});
  const large={...proposal,reply:'Recap. '.repeat(340),additions:[],trainingSummary:summary,planningCheck:{status:'ready',question:null,reason:null},nextQuestion:{topic:recapTopic,text:'Ready?',decision:'Practical context is supplied.'}};
  validateProposal(large); // The model response fits; rendering its schedule exceeds 3000.
  const provider={mode:'test',model:'synthetic',call:async()=>({proposal:large,usage:{input:1,output:1}}),cost:()=>5} as never;
  await onboardingService(store,provider,'test').command({userId:'synthetic',sessionId:'synthetic'},'synthetic',{operationId:'synthetic',expectedRevision:0,kind:'message',text:'Goals'},async()=>true);
  assert.deepEqual(settlements,[5]);assert.equal(finished[3],undefined);assert.equal(finished[4],undefined);assert.equal(finished[5],'incomplete');assert.equal(finished[6],undefined);
});
test('private parser/provider failures do not log personal input; malformed/unauthenticated traffic is rate bounded',async t=>{
  let logs='';const stream=new Writable({write(chunk,_encoding,done){logs+=chunk.toString();done()}});
  const account={userId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  const app=buildApp({stream},{store:{sessionActive:async()=>true,save:async()=>{},read:async()=>null},verifyAccount:async()=>account,
    onboarding:{command:async()=>{throw Error('PrivateProviderMarker')}} as never});t.after(()=>app.close());
  const url='/onboarding/aaaaaaaa-1111-4111-8111-111111111111/commands';const headers={authorization:'Bearer SyntheticPrivateToken','content-type':'application/json'};
  const payload={operationId:'bbbbbbbb-1111-4111-8111-111111111111',expectedRevision:0,kind:'message',text:'PrivateAthleteMarker'};
  const failed=await app.inject({method:'POST',url,headers,payload});assert.equal(failed.statusCode,503);assert.equal(failed.body.includes('Private'),false);
  const malformed=await app.inject({method:'POST',url,headers,payload:'{"text":"PrivateAthleteMarker" broken'});assert.equal(malformed.statusCode,400);assert.equal(malformed.body.includes('Private'),false);
  assert.equal(logs.includes('PrivateAthleteMarker'),false);assert.equal(logs.includes('PrivateProviderMarker'),false);assert.equal(logs.includes('SyntheticPrivateToken'),false);
  for(let i=0;i<118;i++)await app.inject({method:'POST',url,headers,payload:{}});
  const limited=await app.inject({method:'POST',url,payload:{}});assert.equal(limited.statusCode,429);assert.equal(limited.headers['cache-control'],'no-store');
});

test('provider context omits identifying details while original reports remain intact',()=>{
  const words='Alex Example wants tennis and a pull-up; alex@example.test; Bearer private-token; sk-privateKey; eyJheader.payload.signature; 11111111-1111-4111-8111-111111111111';
  const original={...input,sources:{m1:words},recent:[{role:'user' as const,text:words}]};
  const safe=minimizeModelInput(original,['Alex','Example']);const encoded=JSON.stringify(safe);
  for(const privateValue of ['Alex','Example','alex@example.test','private-token','sk-privateKey','eyJheader.payload.signature','11111111-1111-4111-8111-111111111111'])assert.equal(encoded.includes(privateValue),false);
  assert.ok(safe.sources.m1?.includes('tennis and a pull-up'));assert.equal(original.sources.m1,words);
  assert.throws(()=>applyProposal(emptyContext(),{...proposal,additions:[{...proposal.additions[0]!,value:'[private detail removed]',quote:'[private detail removed]'}]},original.sources,new Date().toISOString()));
});

test('only explicit agreement to the last displayed recap finishes; readiness, summaries and corrections do not',()=>{
  const recap={state:'completed',questionTopic:recapTopic};
  for(const text of ['Looks good','Yes.','That’s right!'])assert.equal(acceptsRecap(recap,text),true);
  for(const text of ['Please summarize','Yes, but only one day','Looks good except my shoulder','No','Not sure','Finish onboarding'])assert.equal(acceptsRecap(recap,text),false);
  assert.equal(acceptsRecap({state:'completed',questionTopic:'Goals'},'Yes'),false);
  assert.equal(acceptsRecap({state:'pending',questionTopic:recapTopic},'Yes'),false);
  assert.throws(()=>applyProposal(emptyContext(),{...proposal,nextQuestion:{topic:completeTopic,text:'Done',decision:'Model says ready'}},input.sources,new Date().toISOString()));
});
