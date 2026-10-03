import { acceptsRecap, completeTopic, completionPendingReply } from './onboardingDomain.js';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Account } from './auth.js';
import { bounded, commandDigest, disclosureVersion, emptyContext, limits, OnboardingError, type Command, type Context, type Item, type ModelInput } from './onboardingDomain.js';
import { minimizeModelInput, promptVersion, schemaVersion, type OnboardingProvider } from './onboardingProvider.js';

export type Turn = { id: string; sequence: number; message: string; reply: string | null; questionTopic: string | null; state: 'pending' | 'completed' | 'failed'; error: string | null };
export type Conversation = { id: string; revision: number; state: 'collecting' | 'confirmed'; confirmedRevision: number | null; context: Context; turns: Turn[]; profileChanged: boolean };
export type Claim = { conversation: Conversation; work?: { attempt: string; turnId: string; revision: number; profileVersion: string; body: string; sources: Record<string,string> } };

export function completedConversation(conversation: Conversation) {
  const last = conversation.turns.at(-1);
  return conversation.state === 'confirmed' || (last?.state === 'completed' && last.questionTopic === completeTopic);
}

export function postgresOnboardingStore(pool: Pool) {
  async function transaction<T>(account: Account, operation: (c: PoolClient) => Promise<T>, verifySession = true): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('BEGIN'); await c.query("SELECT set_config('fitquest.user_id',$1,true)", [account.userId]);
      if (verifySession && !(await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active',[account.sessionId,account.userId])).rows[0]?.active) throw new OnboardingError(401,'session_ended');
      const result = await operation(c); await c.query('COMMIT'); return result;
    } catch(error) { await c.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { c.release(); }
  }
  async function profile(c: PoolClient, account: Account) {
    const row = (await c.query('SELECT first_name,last_name,age,height_inches,weight_lb,gender,updated_at::text AS version FROM fitquest.profiles WHERE user_id=$1 FOR SHARE',[account.userId])).rows[0];
    if (!row) throw new OnboardingError(409,'profile_required');
    return row;
  }
  async function rate(c: PoolClient, account: Account, generation = false) {
    const r = (await c.query(`INSERT INTO fitquest.onboarding_request_limits(user_id,hour,requests,day,generations)
      VALUES($1,date_trunc('hour',now()),1,current_date,$2)
      ON CONFLICT(user_id) DO UPDATE SET hour=EXCLUDED.hour,day=EXCLUDED.day,
      requests=CASE WHEN onboarding_request_limits.hour=EXCLUDED.hour THEN onboarding_request_limits.requests+1 ELSE 1 END,
      generations=CASE WHEN onboarding_request_limits.day=EXCLUDED.day THEN onboarding_request_limits.generations+$2 ELSE $2 END
      RETURNING requests,generations`,[account.userId,generation?1:0])).rows[0];
    if (r.requests>600 || r.generations>60) throw new OnboardingError(429,'rate_limit');
  }
  async function lock(c: PoolClient, account: Account, id: string) {
    const row = (await c.query('SELECT * FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2 FOR UPDATE',[account.userId,id])).rows[0];
    if (!row) throw new OnboardingError(404,'not_found');
    return row;
  }
  async function recover(c: PoolClient, account: Account, id: string) {
    // A crashed process needs no queue: resume/retry turns expired leases into retryable failures.
    const expired = await c.query(`UPDATE fitquest.onboarding_turns SET state='failed',error_code='interrupted'
      WHERE user_id=$1 AND conversation_id=$2 AND state='pending' AND deadline<=now() RETURNING attempt_id`,[account.userId,id]);
    for (const row of expired.rows) {
      await c.query('SELECT fitquest.settle_onboarding($1,NULL)',[row.attempt_id]);
      await c.query("UPDATE fitquest.onboarding_operations SET status='failed',error_code='interrupted' WHERE user_id=$1 AND conversation_id=$2 AND attempt_id=$3 AND status='pending'",[account.userId,id,row.attempt_id]);
    }
  }
  async function snapshot(c: PoolClient, account: Account, id: string): Promise<Conversation> {
    const conv = await lock(c,account,id);
    const saved = (await c.query('SELECT context,profile_version FROM fitquest.onboarding_context_revisions WHERE user_id=$1 AND conversation_id=$2 AND revision=$3',[account.userId,id,conv.revision])).rows[0];
    const p = await profile(c,account);
    const rows = await c.query('SELECT id,sequence,message,reply,question_topic,state,error_code FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 ORDER BY sequence',[account.userId,id]);
    return { id, revision:conv.revision,state:conv.state,confirmedRevision:conv.confirmed_revision,context:saved.context,profileChanged:saved.profile_version!==p.version,
      turns:rows.rows.map(x=>({id:x.id,sequence:x.sequence,message:x.message,reply:x.reply,questionTopic:x.question_topic,state:x.state,error:x.error_code})) };
  }
  async function revision(c: PoolClient, account: Account, id: string, number: number, context: Context, profileVersion: string) {
    bounded(context);
    await c.query('INSERT INTO fitquest.onboarding_context_revisions(user_id,conversation_id,revision,context,profile_version) VALUES($1,$2,$3,$4,$5)',[account.userId,id,number,JSON.stringify(context),profileVersion]);
    await c.query("UPDATE fitquest.onboarding_conversations SET revision=$3,state='collecting',confirmed_revision=NULL WHERE user_id=$1 AND id=$2",[account.userId,id,number]);
  }
  return {
    async create(account: Account) {
      return transaction(account,async c=>{
        await rate(c,account); const p=await profile(c,account);
        // Serializes create/resume for this verified account without a global lock.
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[account.userId]);
        let id=(await c.query('SELECT id FROM fitquest.onboarding_conversations WHERE user_id=$1 FOR UPDATE',[account.userId])).rows[0]?.id;
        if (id && completedConversation(await snapshot(c,account,id))) {
          await c.query('DELETE FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2',[account.userId,id]);
          id=undefined;
        }
        if (!id) {
          id=randomUUID(); await c.query('INSERT INTO fitquest.onboarding_conversations(user_id,id,disclosure_version) VALUES($1,$2,$3)',[account.userId,id,disclosureVersion]);
          const context=emptyContext();
          for (const [topic,value] of [['age',String(p.age)],['height',`${p.height_inches} in`],['weight',`${p.weight_lb} lb`],['gender',p.gender]]) {
            context.items.push({id:`i${context.items.length+1}`,topic:topic!,value:value!,origin:'profile',review:'unreviewed',source:`profile:${topic}`,quote:value!,supersedes:null,recordedAt:new Date().toISOString()});
          }
          await c.query('INSERT INTO fitquest.onboarding_context_revisions(user_id,conversation_id,revision,context,profile_version) VALUES($1,$2,0,$3,$4)',[account.userId,id,JSON.stringify(context),p.version]);
        }
        await recover(c,account,id); return snapshot(c,account,id);
      });
    },
    async read(account: Account,id:string) { return transaction(account,async c=>{await rate(c,account); await lock(c,account,id); await recover(c,account,id); return snapshot(c,account,id)}); },
    async remove(account: Account,id:string) { return transaction(account,async c=>{
      await rate(c,account); await c.query('DELETE FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2',[account.userId,id]);
    }); },
    async removeCompleted(account: Account,id:string) { return transaction(account,async c=>{
      // Lock and match this ID only; delayed cleanup must never target a new conversation.
      const row=(await c.query('SELECT id FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2 FOR UPDATE',[account.userId,id])).rows[0];
      if (!row) return true;
      if (!completedConversation(await snapshot(c,account,id))) return false;
      await c.query('DELETE FROM fitquest.onboarding_conversations WHERE user_id=$1 AND id=$2',[account.userId,id]);
      return true;
    }); },
    async operation(account:Account,id:string,operationId:string) {
      return transaction(account,async c=>(await c.query('SELECT id,result_revision AS revision,status,error_code AS code FROM fitquest.onboarding_operations WHERE user_id=$1 AND conversation_id=$2 AND id=$3',[account.userId,id,operationId])).rows[0]);
    },
    async claim(account: Account,id:string,command:Command,provider?:OnboardingProvider):Promise<Claim> {
      return transaction(account,async c=>{
        await rate(c,account);
        const conv=await lock(c,account,id); await recover(c,account,id);
        const last=(await c.query('SELECT state,question_topic FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 ORDER BY sequence DESC LIMIT 1',[account.userId,id])).rows[0];
        if (conv.state==='confirmed'||last?.state==='completed'&&last.question_topic===completeTopic) return {conversation:await snapshot(c,account,id)};
        const prior=(await c.query('SELECT digest FROM fitquest.onboarding_operations WHERE user_id=$1 AND conversation_id=$2 AND id=$3',[account.userId,id,command.operationId])).rows[0];
        if (prior) {
          if (prior.digest!==commandDigest(command)) throw new OnboardingError(409,'operation_conflict');
          return {conversation:await snapshot(c,account,id)};
        }
        if (command.expectedRevision!==conv.revision) throw new OnboardingError(409,'revision_conflict');
        if (conv.revision>=limits.operations) throw new OnboardingError(422,'storage_limit');
        const p=await profile(c,account);
        const old=(await c.query('SELECT context,profile_version FROM fitquest.onboarding_context_revisions WHERE user_id=$1 AND conversation_id=$2 AND revision=$3',[account.userId,id,conv.revision])).rows[0];
        let context:Context=structuredClone(old.context); const number=conv.revision+1; const now=new Date().toISOString();
        let turnId:string|null=null; let work:Claim['work'];
        if (command.kind==='confirm') {
          if(command.reviewedRevision!==conv.revision || old.profile_version!==p.version) throw new OnboardingError(409,'review_changed');
          // Persist the exact reviewed document, including origin and unknowns; no model call.
          await revision(c,account,id,number,context,p.version);
          await c.query("UPDATE fitquest.onboarding_conversations SET state='confirmed',confirmed_revision=$3 WHERE user_id=$1 AND id=$2",[account.userId,id,command.reviewedRevision]);
          await c.query("UPDATE fitquest.onboarding_turns SET state='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND state='pending'",[account.userId,id]);
          await c.query("UPDATE fitquest.onboarding_operations SET status='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND status='pending'",[account.userId,id]);
        } else if(command.kind==='edit' || command.kind==='skip') {
          const source=`edit${number}`;
          if(command.kind==='edit') {
            const previous=context.items.find(x=>x.id===command.itemId);
            if(command.itemId && !previous) throw new OnboardingError(409,'item_changed');
            if(previous) previous.review='disputed';
            const item:Item={id:`i${context.items.length+1}`,topic:command.topic,value:command.value,origin:'user_report',review:'confirmed',source,quote:command.value,supersedes:previous?.id??null,recordedAt:now};
            context.items.push(item);
          } else {
            if(!context.skipped.includes(command.topic)) context.skipped.push(command.topic);
            context.items.push({id:`i${context.items.length+1}`,topic:command.topic,value:'Unknown — athlete skipped this topic.',origin:'unknown',review:'confirmed',source,quote:'Skipped by athlete',supersedes:null,recordedAt:now});
          }
          // Explicit edits reconcile current profile references but never mutate the profile itself.
          if(old.profile_version!==p.version) {
            for(const item of context.items.filter(x=>x.origin==='profile')) {
              item.review='disputed';
            }
            context.limitations.push('Profile changed; previous profile references remain disputed. Review current profile facts before planning.');
          }
          await revision(c,account,id,number,context,p.version);
          await c.query("UPDATE fitquest.onboarding_turns SET state='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND state='pending'",[account.userId,id]);
          await c.query("UPDATE fitquest.onboarding_operations SET status='failed',error_code='review_changed' WHERE user_id=$1 AND conversation_id=$2 AND status='pending'",[account.userId,id]);
        } else {
          if(conv.revision>=limits.operations-1) throw new OnboardingError(422,'storage_limit');
          const pending=(await c.query("SELECT id FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 AND state='pending'",[account.userId,id])).rowCount;
          if(pending) throw new OnboardingError(409,'turn_pending');
          const turns=(await c.query('SELECT * FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 ORDER BY sequence',[account.userId,id])).rows;
          const previous=turns.at(-1);
          const finishing=command.kind==='message' && acceptsRecap(previous?{state:previous.state,questionTopic:previous.question_topic}:undefined,command.text) &&
            (await c.query("SELECT 1 FROM fitquest.onboarding_operations WHERE user_id=$1 AND conversation_id=$2 AND turn_id=$3 AND result_revision=$4 AND status='completed' LIMIT 1",[account.userId,id,previous.id,conv.revision])).rowCount===1;
          let message:string; let sequence:number;
          if(command.kind==='message') {
            if(turns.length>=limits.turns) throw new OnboardingError(422,'storage_limit');
            turnId=randomUUID(); message=command.text; sequence=turns.length+1;
            context.items.push({id:`i${context.items.length+1}`,topic:'Athlete report',value:message,origin:'user_report',review:'unreviewed',source:`m${sequence}`,quote:message,supersedes:null,recordedAt:now});
            await c.query("INSERT INTO fitquest.onboarding_turns(user_id,conversation_id,id,sequence,message,state) VALUES($1,$2,$3,$4,$5,'failed')",[account.userId,id,turnId,sequence,message]);
            turns.push({id:turnId,sequence,message,reply:null});
          } else {
            const turn=turns.find(x=>x.id===command.turnId);
            if(!turn || turn.state!=='failed') throw new OnboardingError(409,'retry_unavailable');
            turnId=turn.id; message=turn.message; sequence=turn.sequence;
          }
          if(old.profile_version!==p.version) throw new OnboardingError(409,'profile_changed');
          await revision(c,account,id,number,context,p.version);
          let failure='ai_disabled';
          if(finishing) {
            // Persist conversational agreement, never confirm unseen structured items. No AI call.
            await c.query("UPDATE fitquest.onboarding_turns SET state='completed',reply=$4,question_topic=$5,error_code=NULL WHERE user_id=$1 AND conversation_id=$2 AND id=$3",[account.userId,id,turnId,completionPendingReply,completeTopic]);
          } else if(provider && p.age>=18) {
            await rate(c,account,true);
            // Every raw report stays in context. Never truncate goals/restrictions to make a prompt fit.
            const sources:Record<string,string>={};
            for(const t of turns) sources[`m${t.sequence}`]=t.message;
            for(const item of context.items) if(item.source.startsWith('edit')) sources[item.source]=item.quote;
            const visible=structuredClone(context); visible.items=visible.items.filter(x=>x.origin!=='profile');
            const input:ModelInput={context:visible,sources,recent:turns.slice(-6).flatMap(t=>[
              {role:'user' as const,text:t.message,source:`m${t.sequence}`},...(t.reply?[{role:'assistant' as const,text:t.reply}]:[])]),knownProfileFields:['first name','last name','height','age','weight','gender']};
            let prepared:ReturnType<OnboardingProvider['prepare']>|undefined;
            // A rejected change must not permanently enlarge the saved history. Roll back this
            // command so its draft can be shortened; prior transcript/review stays usable.
            try{prepared=provider.prepare(minimizeModelInput(input,[p.first_name,p.last_name]))}catch{throw new OnboardingError(422,'context_limit')}
            if(prepared) {
              const attempt=randomUUID();
              await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$6,'not_dispatched',$3,$4,$5)",[account.userId,attempt,provider.model,promptVersion,schemaVersion,provider.purpose??'app']);
              const reserved=(await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[attempt,prepared.reserveMicro,provider.capMicro])).rows[0]?.allowed;
              if(reserved) {
                await c.query("UPDATE fitquest.onboarding_turns SET state='pending',error_code=NULL,attempt_id=$4,deadline=now()+interval '35 seconds' WHERE user_id=$1 AND conversation_id=$2 AND id=$3",[account.userId,id,turnId,attempt]);
                work={attempt,turnId:turnId!,revision:number,profileVersion:p.version,body:prepared.body,sources};
              }else failure='budget_exhausted';
            }
          }else if(provider) failure='adults_only';
          if(!work&&!finishing) await c.query('UPDATE fitquest.onboarding_turns SET error_code=$4 WHERE user_id=$1 AND conversation_id=$2 AND id=$3',[account.userId,id,turnId,failure]);
        }
        const turnStatus=turnId?(await c.query('SELECT state,error_code FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 AND id=$3',[account.userId,id,turnId])).rows[0]:{state:'completed',error_code:null};
        await c.query('INSERT INTO fitquest.onboarding_operations(user_id,conversation_id,id,digest,kind,turn_id,result_revision,attempt_id,status,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[account.userId,id,command.operationId,commandDigest(command),command.kind,turnId,number,work?.attempt??null,turnStatus.state,turnStatus.error_code]);
        return {conversation:await snapshot(c,account,id),work};
      });
    },
    async settle(account:Account,attempt:string,cost:number|null) {
      // Separate from content commit; also works after sign-out/deletion/stale rejection.
      await transaction(account,c=>c.query('SELECT fitquest.settle_onboarding($1,$2)',[attempt,cost]),false);
    },
    async finish(account:Account,id:string,work:NonNullable<Claim['work']>,context:Context|undefined,reply:string|undefined,failure:string|undefined,questionTopic?:string) {
      return transaction(account,async c=>{
        const conv=await lock(c,account,id); const p=await profile(c,account);
        const turn=(await c.query('SELECT * FROM fitquest.onboarding_turns WHERE user_id=$1 AND conversation_id=$2 AND id=$3 FOR UPDATE',[account.userId,id,work.turnId])).rows[0];
        if(!turn || turn.state!=='pending' || turn.attempt_id!==work.attempt || conv.revision!==work.revision ||
          p.version!==work.profileVersion || new Date(turn.deadline).getTime()<=Date.now()) {
          if(turn?.attempt_id===work.attempt && turn.state==='pending') await c.query("UPDATE fitquest.onboarding_turns SET state='failed',error_code='stale_attempt' WHERE user_id=$1 AND conversation_id=$2 AND id=$3",[account.userId,id,work.turnId]);
          await c.query("UPDATE fitquest.onboarding_operations SET status='failed',error_code='stale_attempt' WHERE user_id=$1 AND conversation_id=$2 AND attempt_id=$3 AND status='pending'",[account.userId,id,work.attempt]);
          return snapshot(c,account,id);
        }
        if(context && reply!==undefined) {
          await revision(c,account,id,conv.revision+1,context,p.version);
          await c.query("UPDATE fitquest.onboarding_turns SET state='completed',reply=$4,error_code=NULL,question_topic=$5 WHERE user_id=$1 AND conversation_id=$2 AND id=$3",[account.userId,id,work.turnId,reply,questionTopic??null]);
        }else await c.query("UPDATE fitquest.onboarding_turns SET state='failed',error_code=$4 WHERE user_id=$1 AND conversation_id=$2 AND id=$3",[account.userId,id,work.turnId,failure??'provider_error']);
        await c.query('UPDATE fitquest.onboarding_operations SET status=$4,error_code=$5,result_revision=$6 WHERE user_id=$1 AND conversation_id=$2 AND attempt_id=$3 AND status=\'pending\'',[account.userId,id,work.attempt,context&&reply!==undefined?'completed':'failed',failure??null,context&&reply!==undefined?conv.revision+1:conv.revision]);
        return snapshot(c,account,id);
      });
    },
  };
}
export type OnboardingStore = ReturnType<typeof postgresOnboardingStore>;
