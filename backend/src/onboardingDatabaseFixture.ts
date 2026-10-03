import { renderOnboardingReply } from './onboardingReply.js';
import { dialogueFixtures } from './onboardingDialogueFixture.js';
// Synthetic local-only integration fixture, called after the disposable baseline test.
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { evaluateCase, evaluateConversation, evaluationCases } from './onboardingEvaluation.js';
import { buildApp } from './app.js';
import { onboardingService } from './onboarding.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import type { ProfileStore } from './profileStore.js';
import { minimizeModelInput, openAIProvider, serializeInput, type OnboardingProvider, type ProviderResult } from './onboardingProvider.js';
import { detailedAnswers, correctedAvailability } from './onboardingConversationFixture.js';
import type { Command, ModelProposal } from './onboardingDomain.js';

export async function verifyOnboardingDatabase(t:TestContext,owner:Pool,pool:Pool,profiles:ProfileStore) {
  const migration=await readFile(new URL('../supabase/migrations/20261003030745_conversational_onboarding.sql',import.meta.url),'utf8');
  await owner.query('BEGIN');await owner.query(migration);await owner.query('COMMIT');
  // Synthetic fixture only. Real evaluation/production accounting is never initialized here.
  await owner.query('UPDATE fitquest.ai_budget SET app_enabled=true');
  const alice={userId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  const bob={userId:'22222222-2222-4222-8222-222222222222',sessionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
  await owner.query('INSERT INTO auth.users VALUES($1),($2)',[alice.userId,bob.userId]);
  await owner.query('INSERT INTO auth.sessions VALUES($1,$2,NULL),($3,$4,NULL)',[alice.sessionId,alice.userId,bob.sessionId,bob.userId]);
  const profile={firstName:'Alex',lastName:'Example',height:{value:68,unit:'in' as const},age:29,weight:{value:155.5,unit:'lb' as const},gender:'Prefer not to say'};
  await profiles.save(alice,profile);await profiles.save(bob,{...profile,firstName:'Jordan'});
  const store=postgresOnboardingStore(pool);
  let calls=0; let allowed=true;
  const proposal:ModelProposal={reply:'Thanks for explaining your goals.',additions:[],nextQuestion:{topic:'Current activity',text:'What does your current activity look like?',decision:'Avoid assuming a starting point.'},readiness:'ready_with_limits',limitations:['Starting activity remains unknown.']};
  let respond:()=>Promise<ProviderResult>=async()=>({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});
  const provider:OnboardingProvider={mode:'test',model:'synthetic-contract',capMicro:1000000,
    prepare(input){assert.equal(JSON.stringify(input).includes('Example'),false);assert.equal(JSON.stringify(input).includes(alice.userId),false);assert.equal(input.context.items.some(x=>x.origin==='profile'),false);return {body:JSON.stringify(input),reserveMicro:100}},
    call:async()=>{calls++;return respond()},cost:()=>5};
  const app=buildApp(false,{store:profiles,verifyAccount:async token=>allowed?(token==='alice'?alice:token==='bob'?bob:null):null,onboarding:onboardingService(store,provider,'test')});
  t.after(()=>app.close());
  const request=(method:'GET'|'POST'|'DELETE',url:string,payload?:object,token='alice')=>app.inject({method,url,payload,headers:{authorization:`Bearer ${token}`}});
  const create=async(token='alice')=>(await request('POST','/onboarding',{disclosureVersion:'onboarding-adults-v1'},token)).json();
  const command=(id:string,revision:number,fields:object,operationId=randomUUID())=>request('POST',`/onboarding/${id}/commands`,{operationId,expectedRevision:revision,...fields});
  const fresh=async()=>{const old=await create();await request('DELETE',`/onboarding/${old.id}`);return create()};
  await t.test('detailed multi-turn requests use compact original sources and retain edits, skips, inference and exact review',async()=>{
    let sent=0;const bodies:string[]=[];
    const adapter=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:1000000,inputRate:0.1,cachedRate:0.01,cacheWriteRate:0.125,outputRate:0.5},async(_url,init)=>{
      const body=String(init!.body);bodies.push(body);const visible=JSON.parse(JSON.parse(body).input);sent++;
      assert.equal(visible.sources.m1,minimizeModelInput({context:{items:[],skipped:[],readiness:'ready',limitations:[]},sources:{m1:detailedAnswers[0]},recent:[],knownProfileFields:[]},['Alex','Example']).sources.m1);
      assert.equal(visible.context.items.find((x:{source:string})=>x.source==='m1').valueFromSource,true);
      assert.ok(visible.recent.filter((x:{role:string})=>x.role==='user').every((x:{text?:string;source?:string})=>!x.text&&!!x.source));
      if(sent>=2){assert.equal(visible.sources.m2,minimizeModelInput({context:{items:[],skipped:[],readiness:'ready',limitations:[]},sources:{m2:detailedAnswers[1]},recent:[],knownProfileFields:[]},['Alex','Example']).sources.m2);assert.ok(visible.recent.some((x:{text?:string})=>x.text?.includes('synthetic earlier response')))}
      if(sent===3){assert.ok(visible.context.skipped.includes('Schedule'));assert.ok(Object.values(visible.sources).includes(correctedAvailability));assert.ok(visible.context.items.some((x:{origin:string})=>x.origin==='model_inference'))}
      const output={...proposal,reply:'A synthetic earlier response preserves the tennis and pull-up goals.',
        additions:sent===1?[{topic:'Possible sport preference',value:'May value recreational participation',origin:'model_inference',source:'m1',quote:'Tennis is my main priority'}]:sent===2?[{topic:'Current experience',value:'Professional tennis player',origin:'user_report',source:'m2',quote:'my tennis is recreational and inconsistent.'}]:[],nextQuestion:null};
      return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]}));
    });
    const local=buildApp(false,{store:profiles,verifyAccount:async()=>alice,onboarding:onboardingService(store,adapter,'test')});
    try{
      let a=await fresh();
      const send=async(fields:object)=>{
        const result=await local.inject({method:'POST',url:`/onboarding/${a.id}/commands`,headers:{authorization:'Bearer alice'},payload:{operationId:randomUUID(),expectedRevision:a.revision,...fields}});
        assert.equal(result.statusCode,200);a=result.json();return a;
      };
      for(const text of detailedAnswers){assert.equal(text.length,3200);await send({kind:'message',text});assert.equal(a.turns.at(-1).state,'completed')}
      assert.equal(sent,2);assert.ok(bodies.every(body=>Buffer.byteLength(body)<24000));
      assert.equal(JSON.stringify(a.context).includes('Professional tennis player'),false);
      assert.ok(a.context.items.some((x:{value:string;origin:string})=>x.origin==='user_report'&&x.value==='my tennis is recreational and inconsistent.'));
      assert.equal(JSON.parse(bodies[1]!).input.split(detailedAnswers[0].slice(0,80)).length-1,1);
      assert.ok(a.context.items.some((x:{value:string})=>x.value===detailedAnswers[0]));
      assert.ok(a.context.items.some((x:{quote:string})=>x.quote===detailedAnswers[1]));
      await send({kind:'skip',topic:'Schedule'});
      await send({kind:'edit',itemId:null,topic:'Availability correction',value:correctedAvailability});
      await send({kind:'message',text:'I am ready to review with unknowns. Keep the knee uncertainty and both goals.'});
      assert.equal(sent,3);const reviewed=structuredClone(a.context);const version=a.revision;
      await send({kind:'confirm',reviewedRevision:version});assert.equal(sent,3);assert.equal(a.confirmedRevision,version);assert.deepEqual(a.context,reviewed);
      assert.deepEqual((await postgresOnboardingStore(pool).read(alice,a.id)).context,reviewed);
    }finally{await local.close()}
  });
  await t.test('compacted provider context still rejects fabricated original sources and quotes before content commit',async()=>{
    for(const addition of [{topic:'Goal',value:'Invented',origin:'user_report',source:'m999',quote:'Tennis'},
      {topic:'Goal',value:'Invented',origin:'user_report',source:'m1',quote:'A sentence the athlete never supplied'}]){
      const a=await fresh();
      const service=onboardingService(store,{...provider,prepare(input){return{body:serializeInput(input,'synthetic'),reserveMicro:100}},call:async()=>({proposal:{...proposal,additions:[addition]},usage:{input:100,output:20,cached:0,cacheWrite:0}})},'test');
      const result=await service.command(alice,a.id,{operationId:randomUUID(),expectedRevision:0,kind:'message',text:'Tennis and a pull-up; restrictions are uncertain.'},async()=>true);
      assert.equal(result.turns[0]?.state,'failed');assert.equal(result.turns[0]?.reply,null);
      assert.equal(JSON.stringify(result.context).includes('Invented'),false);
      assert.ok(result.context.items.some(x=>x.value==='Tennis and a pull-up; restrictions are uncertain.'));
    }
  });
  await t.test('genuine request/storage bound rolls back unsaved text; shortening, editing and confirmation remain usable',async()=>{
    let dispatches=0;
    const boundedProvider:OnboardingProvider={...provider,prepare(input){return{body:serializeInput(input,'synthetic'),reserveMicro:100}},
      call:async()=>{dispatches++;return{proposal:{...proposal,reply:'A'.repeat(2300),additions:[],nextQuestion:null},usage:{input:100,output:20,cached:0,cacheWrite:0}}}};
    const service=onboardingService(store,boundedProvider,'test');let a=await fresh();
    const send=(text:string)=>service.command(alice,a.id,{operationId:randomUUID(),expectedRevision:a.revision,kind:'message',text},async()=>true);
    // Three detailed answers fit; further full-length input eventually reaches a genuine bound.
    let rejected=false;
    for(let i=0;i<8;i++){
      const before=await store.read(alice,a.id);const callsBefore=dispatches;
      try{a=await send(detailedAnswers[i%2]!)}catch(error){
        assert.equal((error as {code:string}).code,'context_limit');assert.equal(dispatches,callsBefore);
        assert.deepEqual(await store.read(alice,a.id),before);rejected=true;break;
      }
    }
    assert.ok(rejected);const before=dispatches;
    a=await send('Keep both goals.');assert.equal(dispatches,before+1);assert.equal(a.turns.at(-1)?.state,'completed');
    a=await service.command(alice,a.id,{operationId:randomUUID(),expectedRevision:a.revision,kind:'edit',itemId:null,topic:'Priority',value:'Tennis is still first.'},async()=>true);
    const reviewed=structuredClone(a.context);
    a=await service.command(alice,a.id,{operationId:randomUUID(),expectedRevision:a.revision,kind:'confirm',reviewedRevision:a.revision},async()=>true);
    assert.deepEqual(a.context,reviewed);assert.equal(a.state,'confirmed');assert.equal(dispatches,before+1);
  });
  await t.test('conversational recap, correction, agreement and reopen never confirm unseen items or spend on acknowledgement',async()=>{
    let a=await fresh();const observed:any[]=[];let responseIndex=0;
    const replies=[
      {...proposal,nextQuestion:{topic:'Availability',text:'How much time is realistic for you?',decision:'Availability is still missing.'}},
      {...proposal,nextQuestion:{topic:'Equipment',text:'What equipment or facilities can you use?',decision:'Equipment is still missing.'}},
      {...proposal,reply:'Tennis first; two flexible half-hour sessions, walking now, public courts, no reported limitations.',nextQuestion:{topic:'Onboarding recap',text:'Ready?',decision:'Practical context supplied.'}},
      {...proposal,reply:'Tennis first, flexible sessions and public courts; no plan has been created.',nextQuestion:{topic:'Onboarding recap',text:'Ready?',decision:'Summary requested, not agreement.'}},
      {...proposal,reply:'Correction noted.',nextQuestion:{topic:'Onboarding recap',text:'One flexible half-hour session, not two. Tennis, walking, public courts and no reported limitations remain. Ready?',decision:'Updated recap needs agreement.'}},
      {...proposal,nextQuestion:{topic:'Availability',text:'How long could that extra session be?',decision:'A new correction reopened the discussion.'}},
    ];
    const scripted={...provider,prepare(input:any){observed.push(structuredClone(input));return provider.prepare(input)},call:async()=>{calls++;return{proposal:replies[responseIndex++],usage:{input:100,output:20,cached:0,cacheWrite:0}}}};
    const local=buildApp(false,{store:profiles,verifyAccount:async()=>alice,onboarding:onboardingService(store,scripted,'test')});
    const send=async(text:string,op=randomUUID())=>{const r=await local.inject({method:'POST',url:`/onboarding/${a.id}/commands`,headers:{authorization:'Bearer alice'},payload:{operationId:op,expectedRevision:a.revision,kind:'message',text}});assert.equal(r.statusCode,200);a=r.json();return a};
    try{
      await send('Tennis is my priority.');assert.equal(a.turns.at(-1).questionTopic,'Availability');
      await send('Two half-hour sessions, but days vary.');assert.equal(a.turns.at(-1).questionTopic,'Equipment');assert.ok(observed[1].recent.some((x:any)=>x.text.includes('How much time')));
      await send('Public courts. I walk now and have no important limitations.');assert.ok(a.turns.at(-1).reply.includes('Looks good'));assert.equal(a.turns.at(-1).questionTopic,'Onboarding recap');
      await send('Can you summarize that?');assert.equal(responseIndex,4);assert.equal(a.turns.at(-1).questionTopic,'Onboarding recap');
      await send('Actually only one half-hour session, not two.');assert.equal(responseIndex,5);assert.ok(a.turns.at(-1).reply.includes('One flexible half-hour session'));assert.ok(observed[4].sources.m2.includes('Two half-hour'));assert.ok(observed[4].sources.m5.includes('only one'));
      const before=calls, op=randomUUID(), beforeContext=structuredClone(a.context);
      await send('Looks good',op);assert.equal(calls,before);assert.equal(a.turns.at(-1).questionTopic,'Onboarding complete');assert.ok(a.turns.at(-1).reply.includes('finished and saved'));
      assert.equal(a.state,'collecting');assert.equal(a.confirmedRevision,null);assert.deepEqual(a.context.items.slice(0,beforeContext.items.length),beforeContext.items);assert.ok(a.context.items.every((x:any)=>x.review==='unreviewed'));
      await send('Looks good',op);assert.equal(calls,before);assert.equal(a.turns.length,6);
      const reopened=await postgresOnboardingStore(pool).read(alice,a.id);assert.deepEqual(reopened.turns,a.turns);assert.equal(reopened.confirmedRevision,null);
      await send('I can add another session after all.');assert.equal(responseIndex,6);assert.equal(a.turns.at(-1).questionTopic,'Availability');assert.equal(a.confirmedRevision,null);
    }finally{await local.close()}
  });
  await t.test('recorded synthetic shoulder, comprehensive and irregular/skip dialogues preserve displayed recaps through agreement and reopen',async()=>{
    for(const fixture of dialogueFixtures){
      const old=await store.create(alice);await store.remove(alice,old.id);
      let a=await store.create(alice), dispatched=0;
      const replay={...provider,call:async()=>({proposal:fixture.turns[dispatched++]!.proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}})};
      const service=onboardingService(store,replay,'test');
      const send=(text:string)=>service.command(alice,a.id,{operationId:randomUUID(),expectedRevision:a.revision,kind:'message',text},async()=>true);
      for(const turn of fixture.turns){
        a=await send(turn.message);const shown=a.turns.at(-1)!;
        assert.equal(shown.state,'completed',fixture.name);
        assert.equal(shown.reply,renderOnboardingReply(turn.proposal as ModelProposal));assert.notEqual(shown.questionTopic,'Onboarding complete');
      }
      assert.equal(a.turns.at(-1)?.questionTopic,'Onboarding recap');
      a=await send('Looks good');assert.equal(dispatched,fixture.turns.length);assert.equal(a.turns.at(-1)?.questionTopic,'Onboarding complete');
      assert.equal(a.confirmedRevision,null);assert.ok(a.context.items.every((x:{review:string})=>x.review==='unreviewed'));
      assert.deepEqual((await store.read(alice,a.id)).turns,a.turns);
    }
  });
  await t.test('a context edit after a recap invalidates conversational agreement to that old recap',async()=>{
    let a=await fresh(), dispatched=0;
    const service=onboardingService(store,{...provider,call:async()=>{dispatched++;return{proposal:{...proposal,nextQuestion:{topic:'Onboarding recap',text:'Ready?',decision:'Synthetic recap.'}},usage:{input:100,output:20,cached:0,cacheWrite:0}}}},'test');
    const send=(fields:any)=>service.command(alice,a.id,{operationId:randomUUID(),expectedRevision:a.revision,...fields},async()=>true);
    a=await send({kind:'message',text:'Tennis, walking now, two short sessions, public courts, no limitations.'});
    a=await send({kind:'edit',itemId:null,topic:'Availability',value:'Only one short session.'});
    a=await send({kind:'message',text:'Looks good'});
    assert.equal(dispatched,2);assert.equal(a.turns.at(-1)?.questionTopic,'Onboarding recap');assert.equal(a.confirmedRevision,null);
  });
  await t.test('forward migration preserves profile data; RLS, privileges, owner composite keys and API isolation',async()=>{
    const a=await create();const b=await create('bob');assert.notEqual(a.id,b.id);assert.equal((await create()).id,a.id);
    assert.equal((await profiles.read(alice))?.firstName,'Alex');
    assert.equal((await request('GET',`/onboarding/${a.id}`,undefined,'bob')).statusCode,404);
    assert.equal((await request('DELETE',`/onboarding/${a.id}`,undefined,'bob')).statusCode,204);
    assert.equal((await request('GET',`/onboarding/${a.id}`)).statusCode,200);
    assert.equal((await app.inject({method:'GET',url:`/onboarding/${a.id}`})).statusCode,401);
    assert.equal((await command(a.id,0,{kind:'message',text:'Goal',userId:bob.userId})).statusCode,400);
    for(const table of ['onboarding_conversations','onboarding_context_revisions','onboarding_turns','onboarding_operations','onboarding_attempts','onboarding_request_limits','ai_budget']) {
      assert.deepEqual((await owner.query(`SELECT relrowsecurity AS rls,relforcerowsecurity AS forced FROM pg_class WHERE oid=$1::regclass`,[`fitquest.${table}`])).rows[0],{rls:true,forced:true});
      for(const role of ['anon','authenticated','service_role']) assert.equal((await owner.query('SELECT has_table_privilege($1,$2,\'SELECT\') AS allowed',[role,`fitquest.${table}`])).rows[0].allowed,false);
    }
    const c=await pool.connect();try{
      assert.equal((await c.query('SELECT * FROM fitquest.onboarding_conversations')).rowCount,0);
      await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[alice.userId]);
      assert.equal((await c.query('SELECT * FROM fitquest.onboarding_conversations')).rowCount,1);
      assert.equal((await c.query('UPDATE fitquest.onboarding_conversations SET revision=1 WHERE user_id=$1',[bob.userId])).rowCount,0);
      await assert.rejects(c.query('UPDATE fitquest.onboarding_conversations SET user_id=$1 WHERE user_id=$2',[bob.userId,alice.userId]),{code:'42501'});
      await c.query('ROLLBACK');
      await assert.rejects(c.query('SELECT * FROM fitquest.ai_budget'),{code:'42501'});
    }finally{c.release()}
  });
  await t.test('one call, duplicate/lost response recovery, digest conflict, exact reviewed confirmation without AI',async()=>{
    let a=await fresh();const op=randomUUID();const before=calls;
    const result=await command(a.id,a.revision,{kind:'message',text:'Tennis and my first pull-up'},op);assert.equal(result.statusCode,200);a=result.json();
    const operationResult=a.operationResult;
    assert.equal(calls,before+1);assert.equal(a.turns[0].state,'completed');
    assert.equal((await command(a.id,0,{kind:'message',text:'Tennis and my first pull-up'},op)).json().revision,a.revision);assert.equal(calls,before+1);
    assert.equal((await command(a.id,0,{kind:'message',text:'Different payload'},op)).statusCode,409);
    const review=structuredClone(a.context);const confirmed=await command(a.id,a.revision,{kind:'confirm',reviewedRevision:a.revision});
    assert.equal(confirmed.statusCode,200);assert.equal(confirmed.json().state,'confirmed');assert.equal(confirmed.json().confirmedRevision,a.revision);assert.deepEqual(confirmed.json().context,review);assert.equal(calls,before+1);
    const reopened=await store.read(alice,a.id);assert.deepEqual(reopened.context,review);
    assert.deepEqual((await command(a.id,0,{kind:'message',text:'Tennis and my first pull-up'},op)).json().operationResult,operationResult);
    assert.equal((await command(a.id,0,{kind:'confirm',reviewedRevision:0})).statusCode,409);
  });
  await t.test('skip/correction provenance and uncertainty can be confirmed; no silent profile write',async()=>{
    let a=await fresh();a=(await command(a.id,a.revision,{kind:'skip',topic:'Schedule'})).json();
    const original=a.context.items[0];a=(await command(a.id,a.revision,{kind:'edit',itemId:original.id,topic:'Age report',value:'I reported my age incorrectly; I am 30.'})).json();
    assert.equal(a.context.items[0].review,'disputed');const edited=a.context.items.at(-1);assert.equal(edited.origin,'user_report');assert.equal(edited.review,'confirmed');assert.equal(edited.supersedes,original.id);
    assert.equal((await profiles.read(alice))?.age,29);
    const confirmed=(await command(a.id,a.revision,{kind:'confirm',reviewedRevision:a.revision})).json();assert.equal(confirmed.state,'confirmed');assert.ok(confirmed.context.skipped.includes('Schedule'));
  });
  await t.test('claim is atomic across service instances and pool is released during provider work',async()=>{
    let finish!:(result:ProviderResult)=>void;respond=()=>new Promise(resolve=>{finish=resolve});const a=await fresh();const op=randomUUID();const before=calls;
    const pending=command(a.id,a.revision,{kind:'message',text:'Irregular schedule'},op);
    while(!finish) await new Promise(resolve=>setImmediate(resolve));
    assert.equal((await profiles.read(bob))?.firstName,'Jordan');
    const duplicate=await command(a.id,0,{kind:'message',text:'Irregular schedule'},op);assert.equal(duplicate.json().turns[0].state,'pending');
    assert.equal((await command(a.id,duplicate.json().revision,{kind:'message',text:'Another send'})).statusCode,409);assert.equal(calls,before+1);
    finish({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});assert.equal((await pending).json().turns[0].state,'completed');
    respond=async()=>({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});
  });
  await t.test('crashed lease recovery, separate retry reservation and late attempt rejection',async()=>{
    const a=await fresh();const first=await store.claim(alice,a.id,{operationId:randomUUID(),expectedRevision:0,kind:'message',text:'Endurance and body composition'},provider);assert.ok(first.work);
    await owner.query("UPDATE fitquest.onboarding_turns SET deadline=now()-interval '1 second' WHERE conversation_id=$1",[a.id]);
    const resumed=await store.read(alice,a.id);assert.equal(resumed.turns[0]?.state,'failed');assert.equal(resumed.turns[0]?.error,'interrupted');
    const retry=await store.claim(alice,a.id,{operationId:randomUUID(),expectedRevision:resumed.revision,kind:'retry',turnId:resumed.turns[0]!.id},provider);assert.ok(retry.work);assert.notEqual(retry.work.attempt,first.work.attempt);
    await store.finish(alice,a.id,first.work,first.conversation.context,'STALE',undefined);assert.equal((await store.read(alice,a.id)).turns[0]?.reply,null);
    await store.settle(alice,first.work.attempt,5);await store.settle(alice,retry.work.attempt,null);
    const amounts=await owner.query('SELECT reserved_micro,actual_micro,state FROM fitquest.onboarding_attempts WHERE id=ANY($1)',[[first.work.attempt,retry.work.attempt]]);assert.equal(amounts.rowCount,2);
    await request('DELETE',`/onboarding/${a.id}`);
  });
  await t.test('malformed/refused/incomplete/provider errors retain message and never commit proposed context',async()=>{
    for(const failure of ['malformed','refused','incomplete','provider_error']) {
      const a=await fresh();respond=async()=>failure==='malformed'?{proposal:{...proposal,userId:bob.userId},usage:{input:100,output:20,cached:0,cacheWrite:0}}:{failure:failure as 'refused'|'incomplete'|'provider_error'};
      const r=(await command(a.id,0,{kind:'message',text:'Restriction uncertain'})).json();assert.equal(r.turns[0].state,'failed');assert.equal(r.turns[0].reply,null);assert.ok(r.context.items.some((x:{value:string})=>x.value==='Restriction uncertain'));
    }
    respond=async()=>({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});
  });
  await t.test('deletion mid-call keeps cost settlement and cannot resurrect content',async()=>{
    let finish!:(result:ProviderResult)=>void;respond=()=>new Promise(resolve=>{finish=resolve});const a=await fresh();const pending=command(a.id,0,{kind:'message',text:'Longevity and coordination'});
    while(!finish) await new Promise(resolve=>setImmediate(resolve));
    const attempt=(await owner.query('SELECT attempt_id FROM fitquest.onboarding_turns WHERE conversation_id=$1',[a.id])).rows[0].attempt_id;
    await request('DELETE',`/onboarding/${a.id}`);finish({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});
    assert.equal((await pending).statusCode,404);assert.equal((await owner.query('SELECT * FROM fitquest.onboarding_context_revisions WHERE conversation_id=$1',[a.id])).rowCount,0);
    assert.equal((await owner.query('SELECT actual_micro FROM fitquest.onboarding_attempts WHERE id=$1',[attempt])).rows[0].actual_micro,'5');
    respond=async()=>({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});
  });
  await t.test('profile changes, summary edits and expired identity reject stale completion but settle usage',async()=>{
    for(const cause of ['profile','edit','identity','session']) {
      let finish!:(result:ProviderResult)=>void;respond=()=>new Promise(resolve=>{finish=resolve});const a=await fresh();const pending=command(a.id,0,{kind:'message',text:'Goals remain flexible'});
      while(!finish) await new Promise(resolve=>setImmediate(resolve));
      const current=await store.read(alice,a.id);
      if(cause==='profile') await profiles.save(alice,{...profile,age:30});
      if(cause==='edit') await command(a.id,current.revision,{kind:'edit',itemId:null,topic:'Goal correction',value:'Current goal corrected'});
      if(cause==='identity') allowed=false;
      if(cause==='session') await owner.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[alice.sessionId]);
      finish({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});const result=await pending;
      assert.equal(result.body.includes('Thanks for explaining'),false);
      allowed=true;await owner.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[alice.sessionId]);
      await profiles.save(alice,profile);
    }
    respond=async()=>({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}});
  });
  await t.test('budget exhaustion, aged liabilities, disabled AI and age gate',async()=>{
    const a=await fresh();provider.capMicro=1;
    const exhausted=(await command(a.id,0,{kind:'message',text:'Save this despite no budget'})).json();assert.equal(exhausted.turns[0].error,'budget_exhausted');
    const before=calls;provider.capMicro=1000000;
    const off=onboardingService(store,undefined,'test');await request('DELETE',`/onboarding/${a.id}`);const freshOff=await off.create(alice);
    const saved=await off.command(alice,freshOff.id,{operationId:randomUUID(),expectedRevision:0,kind:'message',text:'Do not run AI'},async()=>true);assert.equal(saved.turns[0]?.error,'ai_disabled');assert.equal(calls,before);
    await profiles.save(alice,{...profile,age:17});const minor=await fresh();const denied=(await command(minor.id,0,{kind:'message',text:'Goal'})).json();assert.equal(denied.turns[0].error,'adults_only');assert.equal(calls,before);await profiles.save(alice,profile);
    const reserves=(await owner.query('SELECT coalesce(sum(reserved_micro),0) AS amount FROM fitquest.ai_budget')).rows[0].amount;
    assert.ok(Number(reserves)>0);
    await owner.query("UPDATE fitquest.onboarding_attempts SET created_at=now()-interval '2 years'");
    provider.capMicro=Number(reserves);const month=await fresh();assert.equal((await command(month.id,0,{kind:'message',text:'Outstanding still counts'})).json().turns[0].error,'budget_exhausted');provider.capMicro=1000000;
  });
  await t.test('lifetime ledger survives deletion, old settled usage, fresh services and config reruns',async()=>{
    const before=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];
    assert.ok(Number(before.spent_micro)>0);
    await owner.query("UPDATE fitquest.onboarding_attempts SET created_at=now()-interval '2 years'");
    const a=await fresh();
    const restarted=onboardingService(postgresOnboardingStore(pool),{...provider,capMicro:Number(before.spent_micro)+Number(before.reserved_micro)+99},'test');
    const denied=await restarted.command(alice,a.id,{operationId:randomUUID(),expectedRevision:0,kind:'message',text:'Do not renew the allowance'},async()=>true);
    assert.equal(denied.turns[0]?.error,'budget_exhausted');
    const after=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];assert.deepEqual(after,before);
    assert.ok((await owner.query("SELECT * FROM fitquest.onboarding_attempts WHERE state='settled' AND created_at<now()-interval '1 year'")).rowCount!>0);
  });
  await t.test('evaluations share lifetime allowance, have a durable sublimit, and settle once after deletion',async()=>{
    const before=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];
    const a=await fresh();
    const evalProvider={...provider,purpose:'evaluation' as const};
    const claim=await store.claim(alice,a.id,{operationId:randomUUID(),expectedRevision:0,kind:'message',text:'Synthetic evaluation'},evalProvider);assert.ok(claim.work);
    await store.remove(alice,a.id);await store.settle(alice,claim.work.attempt,null);
    const reserved=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];
    assert.equal(Number(reserved.reserved_micro),Number(before.reserved_micro)+100);
    assert.equal(Number(reserved.evaluation_reserved_micro),100);
    await store.settle(alice,claim.work.attempt,5);await store.settle(alice,claim.work.attempt,5);
    const settled=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];
    assert.equal(Number(settled.spent_micro),Number(before.spent_micro)+5);assert.equal(Number(settled.evaluation_spent_micro),5);
    assert.equal(Number(settled.evaluation_reserved_micro),0);
    await owner.query('UPDATE fitquest.ai_budget SET evaluation_cap_micro=104');
    const b=await fresh();const restarted=postgresOnboardingStore(pool);
    assert.equal((await restarted.claim(alice,b.id,{operationId:randomUUID(),expectedRevision:0,kind:'message',text:'Eval limit persists'},evalProvider)).conversation.turns[0]?.error,'budget_exhausted');
    await owner.query('UPDATE fitquest.ai_budget SET evaluation_cap_micro=250000');
  });
  await t.test('global concurrent reservations cannot overrun the allowance; app activation and missing accounting fail closed',async()=>{
    const concurrent=new Pool({...pool.options,max:2});
    const reserve=async(account:typeof alice,id:string)=>{
      const c=await concurrent.connect();try{
        await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[account.userId]);
        await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,'evaluation','not_dispatched','test','test','test')",[account.userId,id]);
        const allowed=(await c.query('SELECT fitquest.reserve_onboarding($1,100,7000000) AS allowed',[id])).rows[0].allowed;
        await c.query('COMMIT');return allowed;
      }finally{c.release()}
    };
    const b=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];
    await owner.query('UPDATE fitquest.ai_budget SET cap_micro=spent_micro+reserved_micro+100');
    const ids=[randomUUID(),randomUUID()];const results=await Promise.all([reserve(alice,ids[0]!),reserve(bob,ids[1]!)]).finally(()=>concurrent.end());assert.equal(results.filter(Boolean).length,1);
    await store.settle(results[0]?alice:bob,ids[results[0]?0:1]!,null);
    await owner.query('UPDATE fitquest.ai_budget SET cap_micro=$1,app_enabled=false',[b.cap_micro]);
    const a=await fresh();assert.equal((await store.claim(alice,a.id,{operationId:randomUUID(),expectedRevision:0,kind:'message',text:'Activation locked'},provider)).conversation.turns[0]?.error,'budget_exhausted');
    // Roll back the simulated missing row; never recreate/reset it as a reservation side effect.
    const c=await owner.connect();try{await c.query('BEGIN');await c.query('DELETE FROM fitquest.ai_budget');
      await c.query("SELECT set_config('fitquest.user_id',$1,true)",[alice.userId]);
      assert.equal((await c.query('SELECT fitquest.reserve_onboarding($1,1,7000000) AS allowed',[ids[0]])).rows[0].allowed,false);
      assert.equal((await c.query('SELECT * FROM fitquest.ai_budget')).rowCount,0);
      await c.query('ROLLBACK');
    }finally{c.release()}
    await owner.query('UPDATE fitquest.ai_budget SET app_enabled=true');
    await assert.rejects(owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000001'),{code:'23514'});
    await assert.rejects(owner.query('UPDATE fitquest.ai_budget SET evaluation_cap_micro=250001'),{code:'23514'});
  });
  await t.test('evaluation runner reruns preserve usage and failed calls retain durable reservations',async()=>{
    const budget=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];
    const evalProvider={...provider,call:async()=>({proposal,usage:{input:100,output:20,cached:0,cacheWrite:0}})};
    const first=await evaluateCase(pool,evalProvider,evaluationCases[0]);assert.equal(first.accountedMicro,5);assert.equal(first.failure,undefined);
    const second=await evaluateCase(pool,evalProvider,evaluationCases[0]);assert.notEqual(first.attempt,second.attempt);
    const failure=await evaluateCase(pool,{...evalProvider,call:async()=>({failure:'provider_error' as const})},evaluationCases[0]);assert.equal(failure.accountedMicro,null);
    const after=(await owner.query('SELECT * FROM fitquest.ai_budget')).rows[0];
    assert.equal(Number(after.spent_micro),Number(budget.spent_micro)+10);
    assert.equal(Number(after.evaluation_spent_micro),Number(budget.evaluation_spent_micro)+10);
    assert.equal(Number(after.reserved_micro),Number(budget.reserved_micro)+100);
    assert.equal(Number(after.evaluation_reserved_micro),Number(budget.evaluation_reserved_micro)+100);
  });
  await t.test('multi-turn evaluation harness uses production HTTP/store assembly and does not replay an existing conversation',async()=>{
    const account={userId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',sessionId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};
    await owner.query('INSERT INTO auth.users VALUES($1)',[account.userId]);
    await owner.query('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[account.sessionId,account.userId]);
    await profiles.save(account,{...profile,firstName:'Casey',lastName:'Fixtureperson'});
    let calls=0;const records:unknown[]=[];
    const adapter=openAIProvider({key:'synthetic',model:'gpt-6-luna',capMicro:1000000,inputRate:0.1,cachedRate:0.01,cacheWriteRate:0.125,outputRate:0.5},async()=>{
      calls++;return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...proposal,nextQuestion:calls<3?proposal.nextQuestion:null})}]}]}));
    });
    const result=await evaluateConversation(pool,adapter,async value=>{records.push(value)});
    assert.equal(result.calls,3);assert.equal(calls,3);assert.equal(records.length,7);
    await assert.rejects(evaluateConversation(pool,adapter,async()=>{}));assert.equal(calls,3);
  });
  await t.test('request and storage caps, database constraints, immutable revision and no public RPC grants',async()=>{
    const a=await fresh();await owner.query('UPDATE fitquest.onboarding_request_limits SET requests=600 WHERE user_id=$1',[alice.userId]);
    assert.equal((await request('GET',`/onboarding/${a.id}`)).statusCode,429);
    await owner.query('UPDATE fitquest.onboarding_request_limits SET requests=0 WHERE user_id=$1',[alice.userId]);
    await owner.query('UPDATE fitquest.onboarding_conversations SET revision=240 WHERE id=$1',[a.id]);
    assert.equal((await command(a.id,240,{kind:'message',text:'Too many operations'})).statusCode,422);
    for(const role of ['anon','authenticated','service_role']) assert.equal((await owner.query("SELECT has_function_privilege($1,'fitquest.reserve_onboarding(uuid,bigint,bigint)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
    await assert.rejects(owner.query("UPDATE fitquest.onboarding_conversations SET revision=-1 WHERE id=$1",[a.id]),{code:'23514'});
  });
}
