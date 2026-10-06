import { intakeAnswers,intakeSummary } from './fixedIntake.js';
import { nutritionInputSchema,type NutritionInput } from './nutrition.js';
import { createHash, randomUUID } from 'node:crypto';
import { catalog } from './activityCatalog.js';
import { Ajv } from 'ajv';
import type { PoolClient } from 'pg';
import type { Account } from './auth.js';
import type { Context, RecoveryRequest } from './onboardingDomain.js';
import { OnboardingError } from './onboardingError.js';

export const summaryCategories=['goals','availability','equipment','experience','limitations'] as const;
export type SummaryFact={intakeIndex?:number;category:typeof summaryCategories[number]|'nutrition';text:string;origin:'user_report'|'model_inference'|'assumption'|'unknown';goals?:string[]|null;nutritionInput?:NutritionInput|null};
export type TrainingSummary=SummaryFact[];
export const summarySchema={type:'array',minItems:5,maxItems:12,items:{type:'object',additionalProperties:false,required:['category','text','origin'],properties:{
  category:{type:'string',enum:[...summaryCategories,'nutrition']},text:{type:'string',minLength:1,maxLength:350,pattern:'\\S'},
  origin:{type:'string',enum:['user_report','model_inference','assumption','unknown']},
  nutritionInput:nutritionInputSchema,
  goals:{anyOf:[{type:'null'},{type:'array',minItems:1,maxItems:24,items:{type:'string',minLength:1,maxLength:150,pattern:'\\S'}}]},
}}} as const;
// The provider wire contract always includes goals; saved older summaries may omit it.
export const modelSummarySchema={...summarySchema,items:{...summarySchema.items,required:[...summarySchema.items.required,'goals']}};
export const storedSummarySchema={anyOf:[summarySchema,{type:'array',minItems:5,maxItems:5,items:{type:'object',additionalProperties:false,required:['intakeIndex','category','text','origin'],properties:{intakeIndex:{type:'integer',minimum:0,maximum:4},category:{type:'string',enum:summaryCategories},text:{type:'string',minLength:1,maxLength:4000,pattern:'\\S'},origin:{const:'user_report'}}}}]};
const validate=new Ajv().compile<TrainingSummary>(storedSummarySchema);
export function checkedSummary(value:unknown):TrainingSummary {
  if(!validate(value)||summaryCategories.some(c=>!value.some(f=>f.category===c)))throw new OnboardingError(422,'invalid_summary');
  if(intakeAnswers(value))return value;
  if(value.some(f=>f.category!=='goals'||f.origin==='unknown'?f.goals!=null:Object.hasOwn(f,'goals')&&!f.goals?.length))throw new OnboardingError(422,'invalid_summary');
  if(value.some(f=>f.nutritionInput!=null&&(f.category!=='nutrition'||f.origin!=='user_report')))throw new OnboardingError(422,'invalid_summary');
  const goals=value.flatMap(f=>f.goals??[]),keys=goals.map(g=>g.trim().toLowerCase());
  if(goals.length>24||new Set(keys).size!==keys.length)throw new OnboardingError(422,'invalid_summary');
  return value;
}
export const hasGoalSet=(summary:TrainingSummary)=>summary.some(f=>f.category==='goals'&&f.origin!=='unknown')&&summary.every(f=>f.category!=='goals'||f.origin==='unknown'||!!f.goals?.length);
export function expectedGoals(summary:TrainingSummary) {
  checkedSummary(summary);
  const answers=intakeAnswers(summary);if(answers)return [{sourceIndex:0,goalIndex:0,goal:answers[0]!}];
  if(!hasGoalSet(summary))throw new OnboardingError(409,'summary_needs_correction');
  return summary.flatMap((f,sourceIndex)=>(f.goals??[]).map((goal,goalIndex)=>({sourceIndex,goalIndex,goal})));
}
export function checkTimeZone(zone:string) {
  try {if(zone.length>80)throw Error();new Intl.DateTimeFormat('en-US',{timeZone:zone}).format();return zone;}
  catch{throw new OnboardingError(422,'invalid_timezone')}
}
export function planDates(zone:string,now=new Date()) {
  checkTimeZone(zone);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  const local=Date.UTC(part('year'),part('month')-1,part('day'));
  // Advance calendar dates, not 24 hours in the user's zone (DST can be 23/25 hours).
  return Array.from({length:7-new Date(local).getUTCDay()},(_,i)=>new Date(local+(i+1)*86400000).toISOString().slice(0,10));
}
export function summaryFromContext(context:Context):TrainingSummary {
  if(context.intake)return intakeSummary(context.intake);
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
    document=EXCLUDED.document,preferences='[]',time_zone=EXCLUDED.time_zone,source_conversation=EXCLUDED.source_conversation,updated_at=now() RETURNING revision`,
    [account.userId,JSON.stringify(summary),checkTimeZone(timeZone),conversationId]);
  await c.query(`INSERT INTO fitquest.training_plans(user_id,id,summary_revision,summary,time_zone,dates,catalog_version,outline_first)
    VALUES($1,$2,$3,$4,$5,$6,$7,true)`,[account.userId,context.recovery?recoveryPlanId(account.userId,context.recovery):randomUUID(),saved.rows[0].revision,JSON.stringify(summary),timeZone,JSON.stringify(planDates(timeZone)),catalog.version]);
}
