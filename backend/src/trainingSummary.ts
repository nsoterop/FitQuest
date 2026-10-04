import { createHash, randomUUID } from 'node:crypto';
import { catalog } from './activityCatalog.js';
import { Ajv } from 'ajv';
import type { PoolClient } from 'pg';
import type { Account } from './auth.js';
import type { Context, RecoveryRequest } from './onboardingDomain.js';
import { OnboardingError } from './onboardingError.js';

export const summaryCategories=['goals','availability','equipment','experience','limitations'] as const;
export type SummaryFact={category:typeof summaryCategories[number];text:string;origin:'user_report'|'model_inference'|'assumption'|'unknown'};
export type TrainingSummary=SummaryFact[];
export const summarySchema={type:'array',minItems:5,maxItems:12,items:{type:'object',additionalProperties:false,required:['category','text','origin'],properties:{
  category:{type:'string',enum:summaryCategories},text:{type:'string',minLength:1,maxLength:350,pattern:'\\S'},
  origin:{type:'string',enum:['user_report','model_inference','assumption','unknown']},
}}} as const;
const validate=new Ajv().compile<TrainingSummary>(summarySchema);
export function checkedSummary(value:unknown):TrainingSummary {
  if(!validate(value)||summaryCategories.some(c=>!value.some(f=>f.category===c)))throw new OnboardingError(422,'invalid_summary');
  return value;
}
export function checkTimeZone(zone:string) {
  try {if(zone.length>80)throw Error();new Intl.DateTimeFormat('en-US',{timeZone:zone}).format();return zone;}
  catch{throw new OnboardingError(422,'invalid_timezone')}
}
export function sevenDates(zone:string,now=new Date()) {
  checkTimeZone(zone);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  const local=Date.UTC(part('year'),part('month')-1,part('day'));
  // Advance calendar dates, not 24 hours in the user's zone (DST can be 23/25 hours).
  return Array.from({length:7},(_,i)=>new Date(local+(i+1)*86400000).toISOString().slice(0,10));
}
export function summaryFromContext(context:Context):TrainingSummary {
  if(context.trainingSummary)return checkedSummary(context.trainingSummary);
  // Older sessions have no compact snapshot. Preserve concise, categorized facts where
  // possible, never the catch-all raw-message items or a full transcript. Mark gaps explicitly.
  const topics:Record<typeof summaryCategories[number],RegExp>={goals:/goal|priorit/i,availability:/availab|schedule|frequency|session length/i,
    equipment:/equip|facilit|access/i,experience:/experience|baseline|current activity|current training/i,limitations:/limitation|restriction|injur|discomfort/i};
  return summaryCategories.map(category=>{
    const fact=context.items.findLast(f=>f.review!=='disputed'&&f.origin!=='profile'&&f.topic!=='Athlete report'&&topics[category].test(f.topic)&&f.value.length<=350);
    return fact?{category,text:fact.value,origin:fact.origin as SummaryFact['origin']}:{category,text:'Not captured in this older conversation. Please update before planning.',origin:'unknown'};
  });
}
export async function assertRecoveryCurrent(c:PoolClient,account:Account,context:Context) {
  if(!context.recovery)return;
  const saved=(await c.query('SELECT revision FROM fitquest.training_summaries WHERE user_id=$1 FOR UPDATE',[account.userId])).rows[0];
  if(saved?.revision!==context.recovery.summaryRevision)throw new OnboardingError(409,'summary_changed');
}
// The plan created by a completed recovery is also its durable, content-free receipt.
// Its identity binds the exact owner/request, without retaining the deleted conversation.
export function recoveryPlanId(userId:string,recovery:RecoveryRequest) {
  const hex=createHash('sha256').update(JSON.stringify(['fitquest-recovery-plan-v1',userId.toLowerCase(),recovery.planId.toLowerCase(),recovery.summaryRevision,recovery.target])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export async function retainTrainingSummary(c:PoolClient,account:Account,context:Context,conversationId:string,timeZone:string) {
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[account.userId]);
  await assertRecoveryCurrent(c,account,context);
  const summary=summaryFromContext(context);
  const saved=await c.query(`INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone,source_conversation)
    VALUES($1,1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET revision=training_summaries.revision+1,
    document=EXCLUDED.document,time_zone=EXCLUDED.time_zone,source_conversation=EXCLUDED.source_conversation,updated_at=now() RETURNING revision`,
    [account.userId,JSON.stringify(summary),checkTimeZone(timeZone),conversationId]);
  await c.query(`INSERT INTO fitquest.training_plans(user_id,id,summary_revision,summary,time_zone,dates,catalog_version)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[account.userId,context.recovery?recoveryPlanId(account.userId,context.recovery):randomUUID(),saved.rows[0].revision,JSON.stringify(summary),timeZone,JSON.stringify(sevenDates(timeZone)),catalog.version]);
}
