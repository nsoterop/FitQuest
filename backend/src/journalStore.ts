import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {Account} from './auth.js';
import {OnboardingError} from './onboardingError.js';
import {foodId} from './foodContract.js';
import {validSavedDocument,legacyDocumentPlanVersion,type ExerciseRow} from './documentPlanContract.js';
import {validJournalCommand,journalToday,type Journal,type JournalCommand,type JournalSnapshot,type JournalReceipt,type JournalList,type SetGroup} from './journalContract.js';
const fail=(code:string,status=409):never=>{throw new OnboardingError(status,code)};
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as any)[k])).join(',')+'}':JSON.stringify(v);
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const record=(r:any):Journal=>({id:r.id,revision:r.revision,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString(),snapshot:r.snapshot,document:r.document});
const receipt=(r:any):JournalReceipt=>({id:r.id,journalId:r.journal_id,revision:r.revision});
const group=():SetGroup=>({id:randomUUID(),weight:null,sets:null,reps:null,unit:'lb',removed:false});
export function journalStore(pool:Pool){
 async function tx<T>(a:Account,fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[a.userId]);if(!(await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active',[a.sessionId,a.userId])).rows[0]?.active)fail('session_ended',401);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.userId]);const value=await fn(c);await c.query('COMMIT');return value}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
 return {
 list:(a:Account,offset=0):Promise<JournalList>=>{if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail('invalid_request',400);return tx(a,async c=>{const rows=(await c.query(`SELECT id,revision,document->>'title' AS title,document->>'performedDate' AS "performedDate",document->>'outcome' AS outcome,updated_at AS "updatedAt" FROM fitquest.workout_journals WHERE user_id=$1 ORDER BY updated_at DESC,id LIMIT 51 OFFSET $2`,[a.userId,offset])).rows;return{items:rows.slice(0,50),nextOffset:rows.length>50?offset+50:null}})},
 read:(a:Account,id:string)=>{if(!foodId(id))fail('invalid_request',400);return tx(a,async c=>{const r=(await c.query('SELECT * FROM fitquest.workout_journals WHERE user_id=$1 AND id=$2',[a.userId,id])).rows[0];if(!r)fail('journal_missing',404);return record(r)})},
 readOperation:(a:Account,id:string)=>{if(!foodId(id))fail('invalid_request',400);return tx(a,async c=>{const r=(await c.query('SELECT * FROM fitquest.workout_journal_operations WHERE user_id=$1 AND id=$2',[a.userId,id])).rows[0];if(!r)fail('journal_operation_missing',404);return receipt(r)})},
 command:(a:Account,cmd:JournalCommand)=>{if(!validJournalCommand(cmd)||Buffer.byteLength(JSON.stringify(cmd))>128000)fail('invalid_request',400);return tx(a,async c=>{
  const digest=hash(cmd),old=(await c.query('SELECT * FROM fitquest.workout_journal_operations WHERE user_id=$1 AND id=$2',[a.userId,cmd.operationId])).rows[0];if(old){if(old.digest!==digest)fail('operation_conflict');return receipt(old)}
  let journalId:string,revision:number;
  if(cmd.kind==='begin'){
   const sourceKey=cmd.source?hash(cmd.source):null;
   const existing=sourceKey&&!cmd.repeat?(await c.query('SELECT id,revision FROM fitquest.workout_journals WHERE user_id=$1 AND source_key=$2 ORDER BY created_at DESC,id LIMIT 1',[a.userId,sourceKey])).rows[0]:null;
   if(existing){journalId=existing.id;revision=existing.revision}else{
    let snapshot:JournalSnapshot={source:cmd.source,schemaVersion:null,acceptedAt:null,timeZone:null,session:null,fingerprint:hash(null),exercises:[],workoutMarkdown:null};let title=cmd.title.trim()||'Unplanned workout';
    if(cmd.source){
     const ref=cmd.source,p=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND id=$2',[a.userId,ref.planId])).rows[0];
     const accepted=p?.document_history?.find((h:any)=>h.revision===ref.revision);const version=accepted?.schemaVersion??legacyDocumentPlanVersion;
     if(!accepted||!validSavedDocument(accepted.plan,p.dates,version))fail('journal_source_unavailable');
     const session=accepted.plan.days.find((d:any)=>d.date===ref.date)?.sessions[ref.sessionIndex];if(!session)fail('journal_source_unavailable');
     title=session.title;snapshot={source:ref,schemaVersion:version,acceptedAt:accepted.acceptedAt,timeZone:p.time_zone,session,fingerprint:hash({source:ref,version,session}),workoutMarkdown:session.workoutMarkdown??null,exercises:(session.exercises??[]).map((e:ExerciseRow,i:number)=>({id:randomUUID(),position:i,name:e.exercise,prescription:e.prescription,mode:e.loggingMode??'completion'}))};
    }
    if(cmd.performedDate>journalToday(cmd.timeZone))fail('future_journal',422);
    const document={version:1,title,performedDate:cmd.performedDate,timeZone:cmd.timeZone,outcome:'in_progress',notes:'',results:snapshot.exercises.map(e=>({id:e.id,name:e.name,mode:e.mode,groups:[group()],completed:null,removed:false}))};
    journalId=randomUUID();revision=1;await c.query('INSERT INTO fitquest.workout_journals(user_id,id,revision,source_key,snapshot,document) VALUES($1,$2,1,$3,$4,$5)',[a.userId,journalId,sourceKey,snapshot,document]);
   }
  }else{
   const r=(await c.query('SELECT * FROM fitquest.workout_journals WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,cmd.journalId])).rows[0];if(!r)fail('journal_missing',404);if(r.revision!==cmd.expectedRevision)fail('journal_changed');
   if(cmd.document.performedDate>journalToday(cmd.document.timeZone))fail('future_journal',422);
   // Every original/result identity remains present; removals are recoverable flags.
   if(r.document.results.some((e:any)=>!cmd.document.results.some(n=>n.id===e.id))||r.snapshot.exercises.some((e:any)=>!cmd.document.results.some(n=>n.id===e.id&&n.name===e.name)))fail('journal_identity_changed',422);
   for(const prior of r.document.results){const next=cmd.document.results.find(n=>n.id===prior.id)!;if(prior.groups.some((g:any)=>!next.groups.some(n=>n.id===g.id)))fail('journal_identity_changed',422)}
   journalId=r.id;revision=r.revision+1;await c.query('UPDATE fitquest.workout_journals SET revision=$3,document=$4,updated_at=now() WHERE user_id=$1 AND id=$2',[a.userId,journalId,revision,cmd.document]);
  }
  return receipt((await c.query('INSERT INTO fitquest.workout_journal_operations(user_id,id,digest,journal_id,revision) VALUES($1,$2,$3,$4,$5) RETURNING *',[a.userId,cmd.operationId,digest,journalId,revision])).rows[0]);
 })}
 };
}
export type JournalStore=ReturnType<typeof journalStore>;
