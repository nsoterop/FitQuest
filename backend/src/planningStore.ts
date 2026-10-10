import {scheduledDates} from './weeklySchedule.js';
import {weeklyScheduleVersion} from './weeklyScheduleContract.js';
import {captureProgress,nextWeekDates,type ProgressSnapshot} from './progressContext.js';
import {historyConsentVersion,historyConsentScope,hasHistoryConsent,type HistoryConsent} from './progressConsent.js';
import {planningConsentVersion,planningConsentScope,hasPlanningConsent,type PlanningConsent} from './planningConsent.js';
import {foodDate,foodId,foodToday} from './foodContract.js';
import {prepareDocument,documentPlanVersion} from './documentPlanning.js';
import {documentOverview,isDocumentVersion,nutritionDocumentPlanVersion,validDailyNutrition,type AcceptedNutrition,type SavedDocumentPlan} from './documentPlanContract.js';
import { prepareComplete,prepareCompleteOutline,completeActivities,completePlanVersion } from './completePlanning.js';
import { recordPlanDiagnostic } from './planDiagnosticStore.js';
import { planOverview,type PlanResponse } from './completePlanContract.js';
import { intakeAnswers } from './fixedIntake.js';
import { preparePlainOutline,parsePlainOutline } from './plainOutline.js';
import { prepareOverview,overviewDays } from './outlinePlanning.js';
import { safeDiagnostic,type ProviderDiagnostic } from './providerDiagnostics.js';
import { prepareWeek,weeklyLimits,type CheckedWeek } from './weeklyPlanning.js';
import { prepareReview,type ReviewRequest,type PlanVersion,type ReviewResult } from './planReview.js';
import { isDeepStrictEqual } from 'node:util';
import { informationCoverage } from './planningReadiness.js';
import { randomUUID,createHash } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Account } from './auth.js';
import { OnboardingError } from './onboardingDomain.js';
import { minimizeModelInput,type OnboardingProvider } from './onboardingProvider.js';
import { catalog } from './activityCatalog.js';
import { checkTimeZone,checkedSummary,planDates,hasGoalSet,type TrainingSummary } from './trainingSummary.js';
import { preparePlanning,planningPromptVersion,savedDetail,type PlanningInput,type Outline,type Detail } from './planningDomain.js';

export type GenerationRequest={summaryRevision:number;planId:string;target:string;retryAttempt:string|null;planRevision?:number;confirmOutline?:boolean};
export type PlanningWork={scheduleRevision?:number;historyConsentRevision?:number;progressSnapshot?:ProgressSnapshot;consentRevision?:number;stage?:'outline'|'workouts';attempt:string;planId:string;target:string;revision:number;planRevision?:number;profileVersion:string;input:PlanningInput;body:string};
export function planningStore(pool:Pool,background=false,clock=()=>new Date()) {
  async function tx<T>(a:Account,fn:(c:PoolClient)=>Promise<T>,session=true):Promise<T>{
    const c=await pool.connect();try {
      await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[a.userId]);
      if(session&&!background&&!(await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active',[a.sessionId,a.userId])).rows[0]?.active)throw new OnboardingError(401,'session_ended');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.userId]);
      const value=await fn(c);await c.query('COMMIT');return value;
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  }
  async function rate(c:PoolClient,a:Account,generation=false) {
    const {rows}=await c.query(`INSERT INTO fitquest.onboarding_request_limits(user_id,hour,requests,day,generations)
      VALUES($1,date_trunc('hour',now()),1,current_date,$2) ON CONFLICT(user_id) DO UPDATE SET hour=EXCLUDED.hour,day=EXCLUDED.day,
      requests=CASE WHEN onboarding_request_limits.hour=EXCLUDED.hour THEN onboarding_request_limits.requests+1 ELSE 1 END,
      generations=CASE WHEN onboarding_request_limits.day=EXCLUDED.day THEN onboarding_request_limits.generations+$2 ELSE $2 END RETURNING requests,generations`,[a.userId,generation?1:0]);
    if(rows[0].requests>600||rows[0].generations>60)throw new OnboardingError(429,'rate_limit');
  }
  async function summary(c:PoolClient,a:Account) {
    const s=(await c.query('SELECT revision,document,time_zone,preferences FROM fitquest.training_summaries WHERE user_id=$1 FOR UPDATE',[a.userId])).rows[0];
    if(!s)throw new OnboardingError(409,'summary_required');return s;
  }
  async function profile(c:PoolClient,a:Account) {
    const p=(await c.query('SELECT age,height_inches,weight_lb,gender,planning_consent,history_consent,first_name,last_name,updated_at::text AS version FROM fitquest.profiles WHERE user_id=$1 FOR SHARE',[a.userId])).rows[0];
    if(!p)throw new OnboardingError(409,'profile_required');return p;
  }
  async function recover(c:PoolClient,a:Account) {
    const expired=await c.query("UPDATE fitquest.training_generations SET status='failed',error_code='interrupted' WHERE user_id=$1 AND status='pending' AND deadline<=now() RETURNING attempt_id,schedule_revision,dispatch_started_at",[a.userId]);
    for(const row of expired.rows)await c.query('SELECT fitquest.settle_onboarding($1,$2)',[row.attempt_id,row.schedule_revision&&!row.dispatch_started_at?0:null]);
  }
  async function view(c:PoolClient,a:Account,offset=0) {
    const s=(await c.query('SELECT revision,document,preferences,time_zone AS "timeZone",source_conversation AS "sourceConversation" FROM fitquest.training_summaries WHERE user_id=$1',[a.userId])).rows[0]??null;
    const plans=(await c.query(`SELECT id,week_start::text AS "weekStart",next_operation AS "nextOperation",progress_snapshot AS "progressSnapshot",summary_revision AS "summaryRevision",time_zone AS "timeZone",dates,catalog_version AS "catalogVersion",outline,schema_version AS "schemaVersion",complete_plan AS "completePlan",document_plan AS "documentPlan",accepted_at AS "acceptedAt",created_at AS "createdAt",CASE WHEN review_state<>'accepted' THEN document_history->-1 ELSE NULL END AS "acceptedDocument",
      outline_first AS "outlineFirst",confirmed_outline_revision AS "confirmedOutlineRevision",review_state AS "reviewState",review_revision AS "planRevision",review_note AS "reviewNote",review_context->>'question' AS "reviewQuestion"
      FROM fitquest.training_plans WHERE user_id=$1 ORDER BY (dates ? $2) DESC,created_at DESC,id DESC LIMIT 21 OFFSET $3`,[a.userId,foodToday(s?.timeZone??'UTC'),offset])).rows;
    const more=plans.length>20;if(more)plans.pop();
    const nextOffset=more?offset+20:null;
    for(const p of plans) {
      if(p.progressSnapshot){
        const snapshot=p.progressSnapshot as ProgressSnapshot;p.contextCapturedAt=snapshot.capturedAt;
        try{const latest=await profile(c,a);const fresh=await captureProgress(c,a.userId,p.dates,p.timeZone,s?.document??snapshot.input.summary,{age:latest.age,heightInches:latest.height_inches,weightLb:Number(latest.weight_lb),gender:latest.gender},snapshot.changes,new Date(),{summary:s?.revision??0,profile:latest.version});p.contextChanged=fresh.fingerprint!==snapshot.fingerprint}catch{p.contextChanged=true}
      }
      delete p.progressSnapshot;
      p.days=(await c.query('SELECT date::text,detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 ORDER BY date',[a.userId,p.id])).rows;
      p.jobs=(await c.query('SELECT target,status,error_code AS error,attempt_id AS "attemptId",feedback,complete_stage AS stage,raw_response AS "rawResponse" FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND (target NOT LIKE \'review:%\' OR target=$3) AND (target NOT LIKE \'details:%\' OR target=$4)',[a.userId,p.id,`review:${p.planRevision}`,`details:${p.planRevision}`])).rows;
      if(!isDocumentVersion(p.schemaVersion))delete p.acceptedDocument;
      if(isDocumentVersion(p.schemaVersion)){
        p.completeReady=!!p.documentPlan;
        p.documentOverview=p.documentPlan?documentOverview(p.documentPlan):null;
        if(p.reviewState!=='accepted')p.documentPlan=null;
        p.jobs=p.jobs.map(({rawResponse,...job}:any)=>job);
      }
      if(p.schemaVersion===completePlanVersion){
        p.completeReady=!!p.completePlan;
        p.overview=p.completePlan?planOverview(p.completePlan):null;
        p.activityNames=p.completePlan&&p.reviewState==='accepted'?completeActivities(p.completePlan):{};
        if(p.reviewState!=='accepted')p.completePlan=null;
        p.jobs=p.jobs.map(({rawResponse,...job}:any)=>job);
      }
    }
    // Acceptance is durable server evidence, independent of the current draft or calendar.
    const onboarded=(await c.query("SELECT EXISTS(SELECT 1 FROM fitquest.training_plans WHERE user_id=$1 AND (review_state='accepted' OR jsonb_array_length(document_history)>0)) AS accepted",[a.userId])).rows[0].accepted;
    const permissions=(await c.query('SELECT planning_consent,history_consent FROM fitquest.profiles WHERE user_id=$1',[a.userId])).rows[0];
    const schedule=(await c.query('SELECT enabled,revision::int,time_zone AS "timeZone",enabled_at AS "enabledAt",last_week::text AS "lastWeek",error_code AS error FROM fitquest.weekly_schedules WHERE user_id=$1',[a.userId])).rows[0]??null;
    return {summary:s,plans,onboarded,nextOffset,schedule,consent:permissions?.planning_consent??null,historyConsent:permissions?.history_consent??null};
  }
  async function claimDocument(c:PoolClient,a:Account,plan:any,r:GenerationRequest|ReviewRequest,provider?:OnboardingProvider):Promise<PlanningWork|undefined>{
    const s=await summary(c,a),p=await profile(c,a),review='feedback' in r;
    if(plan.week_start?plan.summary_revision!==r.summaryRevision:s.revision!==r.summaryRevision||plan.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
    if(!review&&(r.target!=='week'||r.confirmOutline))throw new OnboardingError(409,'review_unavailable');
    const target=review?`review:${r.planRevision}`:'week',feedback=review?r.feedback:null;
    const hash=feedback===null?null:createHash('sha256').update(feedback).digest('hex');
    const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,plan.id,target])).rows[0];
    if(job?.status==='completed'){if(review&&job.feedback_hash!==hash)throw new OnboardingError(409,'plan_changed');return;}
    if(review&&(plan.review_revision!==r.planRevision||!plan.document_plan))throw new OnboardingError(409,'plan_changed');
    if(!review&&plan.document_plan)return;
    if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending'",[a.userId,plan.id])).rowCount)return;
    if(job&&(job.status!=='failed'||r.retryAttempt!==job.attempt_id))return;
    if(!job&&r.retryAttempt)throw new OnboardingError(409,'retry_unavailable');
    if(!hasPlanningConsent(p.planning_consent))throw new OnboardingError(409,'planning_consent_required');
    if(plan.week_start&&!hasHistoryConsent(p.history_consent))throw new OnboardingError(409,'history_consent_required');
    const progressSnapshot:ProgressSnapshot|undefined=plan.week_start?((job?.feedback_hash===hash?job.progress_snapshot:null)??(review?await captureProgress(c,a.userId,plan.dates,plan.time_zone,s.document,{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb),gender:p.gender},plan.progress_snapshot.changes,new Date(),{summary:s.revision,profile:p.version}):plan.progress_snapshot)):undefined;
    const input:PlanningInput={schemaVersion:documentPlanVersion,kind:'week',summary:s.document,profile:{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb),gender:p.gender},dates:plan.dates,...(progressSnapshot?progressSnapshot.input:{}),...(review?{documentReview:{plan:plan.document_plan,feedback:r.feedback}}:{})};
    const attempt=randomUUID();let prepared:ReturnType<typeof prepareDocument>|undefined,failure:string|undefined;
    if(p.age<18)failure='adults_only';else if(!provider)failure='ai_disabled';else{
      await rate(c,a,true);
      try{prepared=prepareDocument(provider,input)}catch(e){failure=e instanceof OnboardingError?e.code:'planning_context_limit';}
      if(prepared){
        await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,$5,$5)",[a.userId,attempt,provider.purpose??'app',provider.model,documentPlanVersion]);
        if(!(await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[attempt,prepared.reserveMicro,provider.capMicro])).rows[0]?.allowed)failure='budget_exhausted';
      }
    }
    await c.query(`INSERT INTO fitquest.training_generations(user_id,plan_id,target,status,error_code,attempt_id,deadline,profile_version,summary_revision,feedback,feedback_hash)
      VALUES($1,$2,$3,$4,$5,$6,now()+($11*interval '1 second'),$7,$8,$9,$10) ON CONFLICT(user_id,plan_id,target) DO UPDATE SET status=EXCLUDED.status,error_code=EXCLUDED.error_code,attempt_id=EXCLUDED.attempt_id,deadline=EXCLUDED.deadline,profile_version=EXCLUDED.profile_version,summary_revision=EXCLUDED.summary_revision,feedback=EXCLUDED.feedback,feedback_hash=EXCLUDED.feedback_hash,schedule_revision=NULL,dispatch_started_at=NULL`,
      [a.userId,plan.id,target,failure?'failed':'pending',failure??null,attempt,p.version,s.revision,feedback,hash,weeklyLimits.leaseSeconds]);
    if(progressSnapshot)await c.query('UPDATE fitquest.training_generations SET progress_snapshot=$4 WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,plan.id,target,JSON.stringify(progressSnapshot)]);
    if(prepared&&!failure)return {historyConsentRevision:p.history_consent?.revision,progressSnapshot,consentRevision:p.planning_consent.revision,attempt,planId:plan.id,target,revision:plan.summary_revision,planRevision:plan.review_revision,profileVersion:p.version,input,body:prepared.body};
  }

  async function claimComplete(c:PoolClient,a:Account,plan:any,r:GenerationRequest|ReviewRequest,provider?:OnboardingProvider,checkpoint?:{work:PlanningWork;text:string}):Promise<PlanningWork|undefined>{
    const s=await summary(c,a),p=await profile(c,a),review='feedback' in r;
    if(s.revision!==r.summaryRevision||plan.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
    if(plan.catalog_version!==catalog.version)throw new OnboardingError(409,'catalog_changed');
    if(!review&&((r as GenerationRequest).target!=='week'||(r as GenerationRequest).confirmOutline))throw new OnboardingError(409,'review_unavailable');
    const target=review?`review:${r.planRevision}`:'week',feedback=review?r.feedback:null;
    const hash=feedback===null?null:createHash('sha256').update(feedback).digest('hex');
    const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,plan.id,target])).rows[0];
    if(job?.status==='completed'){if(review&&job.feedback_hash!==hash)throw new OnboardingError(409,'plan_changed');return;}
    if(review&&(plan.review_revision!==r.planRevision||!plan.complete_plan))throw new OnboardingError(409,'plan_changed');
    if(!review&&plan.complete_plan)return;
    if(checkpoint){
      const w=checkpoint.work;
      if(!job||job.status!=='pending'||job.attempt_id!==w.attempt||job.complete_stage!=='outline')return;
      if(plan.review_revision!==w.planRevision||p.version!==w.profileVersion||s.revision!==w.revision||new Date(job.deadline).getTime()<=Date.now()){
        await c.query("UPDATE fitquest.training_generations SET status='failed',error_code='summary_changed' WHERE user_id=$1 AND plan_id=$2 AND target=$3",[a.userId,plan.id,target]);return;
      }
    }else{
      if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending'",[a.userId,plan.id])).rowCount)return;
      if(job&&(job.status!=='failed'||r.retryAttempt!==job.attempt_id))return;
      if(!job&&r.retryAttempt)throw new OnboardingError(409,'retry_unavailable');
    }
    const reusable=job?.complete_stage==='workouts'&&job.raw_response&&job.profile_version===p.version&&job.summary_revision===s.revision&&job.feedback_hash===hash;
    const outlineText=checkpoint?.text??(reusable?job.raw_response:undefined);
    const stage=outlineText?'workouts':'outline';
    const input:PlanningInput={schemaVersion:completePlanVersion,kind:'week',summary:s.document,profile:{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb)},dates:plan.dates,...(review?{completeReview:{plan:plan.complete_plan,feedback:r.feedback}}:{})};
    if(outlineText)input.completeOutlineText=outlineText;
    const attempt=randomUUID();let prepared:ReturnType<typeof prepareComplete>|undefined,failure:string|undefined;
    if(p.age<18)failure='adults_only';else if(!provider)failure='ai_disabled';else{
      try{await rate(c,a,true)}catch(e){if(e instanceof OnboardingError)failure=e.code;else throw e;}
      try{if(!failure)prepared=stage==='outline'?prepareCompleteOutline(provider,input):prepareComplete(provider,input)}catch(e){failure=e instanceof OnboardingError?e.code:'planning_context_limit';}
      if(prepared){
        await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,$5,$6)",[a.userId,attempt,provider.purpose??'app',provider.model,`complete-two-stage-v1-${stage}`,completePlanVersion]);
        if(!(await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[attempt,prepared.reserveMicro,provider.capMicro])).rows[0]?.allowed)failure='budget_exhausted';
      }
    }
    await c.query(`INSERT INTO fitquest.training_generations(user_id,plan_id,target,status,error_code,attempt_id,deadline,profile_version,summary_revision,feedback,feedback_hash,complete_stage,raw_response,outline_attempt_id)
      VALUES($1,$2,$3,$4,$5,$6,now()+($11*interval '1 second'),$7,$8,$9,$10,$12,$13,$14) ON CONFLICT(user_id,plan_id,target) DO UPDATE SET status=EXCLUDED.status,error_code=EXCLUDED.error_code,attempt_id=EXCLUDED.attempt_id,deadline=EXCLUDED.deadline,profile_version=EXCLUDED.profile_version,summary_revision=EXCLUDED.summary_revision,feedback=EXCLUDED.feedback,feedback_hash=EXCLUDED.feedback_hash,complete_stage=EXCLUDED.complete_stage,raw_response=EXCLUDED.raw_response,outline_attempt_id=EXCLUDED.outline_attempt_id`,
      [a.userId,plan.id,target,failure?'failed':'pending',failure??null,attempt,p.version,s.revision,feedback,hash,stage==='outline'?35:weeklyLimits.leaseSeconds,stage,outlineText??null,checkpoint?.work.attempt??(reusable?job.outline_attempt_id:null)]);
    if(prepared&&!failure)return {stage,attempt,planId:plan.id,target,revision:s.revision,planRevision:plan.review_revision,profileVersion:p.version,input,body:prepared.body};
  }

  return {
    schedule:(a:Account,r:{version:string;enabled:boolean;expectedRevision:number})=>tx(a,async c=>{
      if(r.version!==weeklyScheduleVersion||typeof r.enabled!=='boolean'||!Number.isSafeInteger(r.expectedRevision)||r.expectedRevision<0)throw new OnboardingError(400,'invalid_request');
      const old=(await c.query('SELECT * FROM fitquest.weekly_schedules WHERE user_id=$1',[a.userId])).rows[0];
      if(Number(old?.revision??0)!==r.expectedRevision)throw new OnboardingError(409,'consent_changed');
      let zone=old?.time_zone??'UTC';
      if(r.enabled){const s=await summary(c,a),p=await profile(c,a);zone=s.time_zone;
        if(!hasPlanningConsent(p.planning_consent))throw new OnboardingError(409,'planning_consent_required');
        if(!hasHistoryConsent(p.history_consent))throw new OnboardingError(409,'history_consent_required');
        if(!(await c.query("SELECT 1 FROM fitquest.training_plans WHERE user_id=$1 AND jsonb_array_length(document_history)>0 LIMIT 1",[a.userId])).rowCount)throw new OnboardingError(409,'accepted_week_required');
      }
      await c.query(`INSERT INTO fitquest.weekly_schedules(user_id,enabled,revision,time_zone,enabled_at) VALUES($1,$2,1,$3,$4)
        ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,revision=weekly_schedules.revision+1,time_zone=EXCLUDED.time_zone,enabled_at=CASE WHEN EXCLUDED.enabled THEN EXCLUDED.enabled_at ELSE weekly_schedules.enabled_at END`,[a.userId,r.enabled,zone,clock()]);return view(c,a);
    }),
    claimScheduled:(a:Account,provider?:OnboardingProvider)=>tx(a,async c=>{
      if(!background)throw new OnboardingError(403,'not_allowed');
      const schedule=(await c.query('SELECT *,last_week::text AS week FROM fitquest.weekly_schedules WHERE user_id=$1 FOR UPDATE',[a.userId])).rows[0];
      if(!schedule?.enabled)return;
      const dates=scheduledDates(schedule.time_zone,new Date(schedule.enabled_at).toISOString(),clock());if(!dates)return;
      await recover(c,a);
      let plan=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND dates->>0=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',[a.userId,dates[0]])).rows[0];
      // A manual draft or existing ready week always wins; never purchase a replacement.
      if(plan&&(!plan.scheduled||plan.document_plan))return;
      const job=plan?(await c.query("SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target='week'",[a.userId,plan.id])).rows[0]:null;
      const retry=job?.status==='failed'&&job.error_code==='interrupted'&&job.schedule_revision&&!job.dispatch_started_at;
      if(job&&!retry)return;
      if(!plan&&schedule.week===dates[0])return;
      try{
        const s=await summary(c,a),p=await profile(c,a);
        if(!hasPlanningConsent(p.planning_consent))throw new OnboardingError(409,'planning_consent_required');
        if(!hasHistoryConsent(p.history_consent))throw new OnboardingError(409,'history_consent_required');
        if(!plan){const snapshot=await captureProgress(c,a.userId,dates,schedule.time_zone,s.document,{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb),gender:p.gender},'',clock(),{summary:s.revision,profile:p.version});
          plan=(await c.query(`INSERT INTO fitquest.training_plans(user_id,id,summary_revision,summary,time_zone,dates,catalog_version,outline_first,schema_version,week_start,next_operation,progress_snapshot,scheduled)
            VALUES($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,true) RETURNING *`,[a.userId,randomUUID(),s.revision,JSON.stringify(s.document),schedule.time_zone,JSON.stringify(dates),catalog.version,documentPlanVersion,dates[0],randomUUID(),JSON.stringify(snapshot)])).rows[0];}
        const work=await claimDocument(c,a,plan,{summaryRevision:plan.summary_revision,planId:plan.id,target:'week',retryAttempt:retry?job.attempt_id:null},provider);
        if(work){work.scheduleRevision=Number(schedule.revision);await c.query("UPDATE fitquest.training_generations SET schedule_revision=$3,dispatch_started_at=NULL WHERE user_id=$1 AND plan_id=$2 AND target='week'",[a.userId,plan.id,work.scheduleRevision]);}
        await c.query('UPDATE fitquest.weekly_schedules SET last_week=$2,error_code=NULL WHERE user_id=$1',[a.userId,dates[0]]);return work;
      }catch(e){if(!(e instanceof OnboardingError))throw e;await c.query('UPDATE fitquest.weekly_schedules SET last_week=$2,error_code=$3 WHERE user_id=$1',[a.userId,dates[0],e.code]);return;}
    }),
    historyConsent:(a:Account,request:{version:string;scope:string;granted:boolean;expectedRevision:number})=>tx(a,async c=>{
      if(request.version!==historyConsentVersion||request.scope!==historyConsentScope||typeof request.granted!=='boolean'||!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0)throw new OnboardingError(400,'invalid_request');
      const p=await profile(c,a),old=p.history_consent as HistoryConsent|null;if((old?.revision??0)!==request.expectedRevision)throw new OnboardingError(409,'consent_changed');
      const consent:HistoryConsent={version:historyConsentVersion,scope:historyConsentScope,granted:request.granted,revision:(old?.revision??0)+1,updatedAt:new Date().toISOString()};
      await c.query('UPDATE fitquest.profiles SET history_consent=$2 WHERE user_id=$1',[a.userId,JSON.stringify(consent)]);return view(c,a);
    }),
    ensureNextWeek:(a:Account,r:{operationId:string;changes:string},now=new Date())=>tx(a,async c=>{
      if(!foodId(r.operationId)||typeof r.changes!=='string'||r.changes.length>2000)throw new OnboardingError(400,'invalid_request');
      await rate(c,a);await recover(c,a);
      const existing=(await c.query('SELECT id,progress_snapshot FROM fitquest.training_plans WHERE user_id=$1 AND next_operation=$2',[a.userId,r.operationId])).rows[0];
      if(existing){if(existing.progress_snapshot.changes!==r.changes)throw new OnboardingError(409,'operation_conflict');return {...await view(c,a),nextPlanId:existing.id}};
      const s=await summary(c,a),p=await profile(c,a),dates=nextWeekDates(s.time_zone,now);
      const prior=(await c.query('SELECT id FROM fitquest.training_plans WHERE user_id=$1 AND dates->>0=$2 ORDER BY created_at DESC LIMIT 1',[a.userId,dates[0]])).rows[0];
      if(prior)return {...await view(c,a),nextPlanId:prior.id};
      if(!hasPlanningConsent(p.planning_consent))throw new OnboardingError(409,'planning_consent_required');
      if(!hasHistoryConsent(p.history_consent))throw new OnboardingError(409,'history_consent_required');
      const snapshot=await captureProgress(c,a.userId,dates,s.time_zone,s.document,{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb),gender:p.gender},r.changes,now,{summary:s.revision,profile:p.version}),id=randomUUID();
      await c.query(`INSERT INTO fitquest.training_plans(user_id,id,summary_revision,summary,time_zone,dates,catalog_version,outline_first,schema_version,week_start,next_operation,progress_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11)`,[a.userId,id,s.revision,JSON.stringify(s.document),s.time_zone,JSON.stringify(dates),catalog.version,documentPlanVersion,dates[0],r.operationId,JSON.stringify(snapshot)]);
      return {...await view(c,a),nextPlanId:id};
    }),
    consent:(a:Account,request:{version:string;scope:string;granted:boolean;expectedRevision:number})=>tx(a,async c=>{
      if(request.version!==planningConsentVersion||request.scope!==planningConsentScope||typeof request.granted!=='boolean'||!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0)throw new OnboardingError(400,'invalid_request');
      const p=await profile(c,a),old=p.planning_consent as PlanningConsent|null;
      if((old?.revision??0)!==request.expectedRevision)throw new OnboardingError(409,'consent_changed');
      const consent:PlanningConsent={version:planningConsentVersion,scope:planningConsentScope,granted:request.granted,revision:(old?.revision??0)+1,updatedAt:new Date().toISOString()};
      await c.query('UPDATE fitquest.profiles SET planning_consent=$2 WHERE user_id=$1',[a.userId,JSON.stringify(consent)]);
      return view(c,a);
    }),
    canDispatch:async(a:Account,w:PlanningWork,onAllowed?:()=>void)=>{
      if(w.scheduleRevision){const marked=await tx(a,async c=>{
        const row=await c.query("UPDATE fitquest.training_generations SET dispatch_started_at=now() WHERE user_id=$1 AND plan_id=$2 AND attempt_id=$3 AND status='pending' AND dispatch_started_at IS NULL AND deadline>now() RETURNING attempt_id",[a.userId,w.planId,w.attempt]);return !!row.rowCount;
      });if(!marked)return false;}
      return tx(a,async c=>{
      if(w.input.schemaVersion!==documentPlanVersion)return true;
      const p=await profile(c,a);
      let scheduledAllowed=true;
      if(w.scheduleRevision){const row=(await c.query('SELECT * FROM fitquest.weekly_schedules WHERE user_id=$1',[a.userId])).rows[0];const dates=row?.enabled?scheduledDates(row.time_zone,new Date(row.enabled_at).toISOString(),clock()):null;scheduledAllowed=!!dates&&dates[0]===w.input.dates[0]&&Number(row.revision)===w.scheduleRevision;}
      const allowed=scheduledAllowed&&hasPlanningConsent(p.planning_consent)&&p.planning_consent.revision===w.consentRevision&&(w.progressSnapshot?hasHistoryConsent(p.history_consent)&&p.history_consent.revision===w.historyConsentRevision:p.version===w.profileVersion);
      if(allowed)onAllowed?.(); // Start transmission while holding the same account lock as revocation.
      return allowed;
    });},
    nutrition:(a:Account,date:string):Promise<{target:AcceptedNutrition|null}>=>tx(a,async c=>{
      if(!foodDate(date))throw new OnboardingError(400,'invalid_request');
      // Search all owned accepted weeks, not the most-recent training page. Drafts never win.
      const rows=(await c.query(`SELECT id,time_zone,dates,document_history->-1 AS accepted FROM fitquest.training_plans
        WHERE user_id=$1 AND dates ? $2 AND jsonb_array_length(document_history)>0
        ORDER BY (document_history->-1->>'acceptedAt')::timestamptz DESC,id DESC LIMIT 1`,[a.userId,date])).rows;
      const p=rows[0],h=p?.accepted;
      if(![documentPlanVersion,nutritionDocumentPlanVersion].includes(h?.schemaVersion)||!validDailyNutrition(h.plan?.nutrition))return {target:null};
      return {target:{planId:p.id,planRevision:h.revision,schemaVersion:h.schemaVersion,acceptedAt:h.acceptedAt,dates:p.dates,timeZone:p.time_zone,nutrition:h.plan.nutrition}};
    }),
    advanceComplete:(a:Account,w:PlanningWork,text:string,provider:OnboardingProvider)=>tx(a,async c=>{
      const plan=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,w.planId])).rows[0];
      if(!plan)return;
      const request=w.input.completeReview?{summaryRevision:w.revision,planId:w.planId,planRevision:w.planRevision!,feedback:w.input.completeReview.feedback,retryAttempt:null}:{summaryRevision:w.revision,planId:w.planId,target:'week',retryAttempt:null};
      return claimComplete(c,a,plan,request,provider,{work:w,text});
    }),
    read:(a:Account,offset=0)=>tx(a,async c=>{if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new OnboardingError(400,'invalid_request');await rate(c,a);await recover(c,a);return view(c,a,offset)}),
    accept:(a:Account,r:PlanVersion)=>tx(a,async c=>{
      await rate(c,a);await recover(c,a);
      const p=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,r.planId])).rows[0];
      if(!p)throw new OnboardingError(404,'not_found');
      const s=await summary(c,a);
      if(p.review_revision!==r.planRevision)throw new OnboardingError(409,'plan_changed');
      if(p.week_start?p.summary_revision!==r.summaryRevision:s.revision!==r.summaryRevision||p.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
      if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending'",[a.userId,r.planId])).rowCount)throw new OnboardingError(409,'review_pending');
      if(isDocumentVersion(p.schema_version)){
        if(!p.document_plan||!p.review_revision)throw new OnboardingError(409,'review_unavailable');
        if(p.review_state!=='accepted')await c.query("UPDATE fitquest.training_plans SET review_state='accepted',accepted_at=now(),document_history=document_history||jsonb_build_array(jsonb_build_object('schemaVersion',schema_version,'revision',review_revision,'acceptedAt',now(),'plan',document_plan)) WHERE user_id=$1 AND id=$2",[a.userId,r.planId]);
        await c.query("UPDATE fitquest.training_generations SET feedback=NULL WHERE user_id=$1 AND plan_id=$2 AND status<>'pending'",[a.userId,r.planId]);
        return view(c,a);
      }
      if(p.schema_version===completePlanVersion){
        if(!p.complete_plan||!p.review_revision)throw new OnboardingError(409,'review_unavailable');
        await c.query("UPDATE fitquest.training_plans SET review_state='accepted',accepted_at=coalesce(accepted_at,now()) WHERE user_id=$1 AND id=$2",[a.userId,r.planId]);
        await c.query("UPDATE fitquest.training_generations SET feedback=NULL WHERE user_id=$1 AND plan_id=$2 AND status<>'pending'",[a.userId,r.planId]);
        return view(c,a);
      }
      if(p.review_state==='legacy'||!p.review_revision||p.review_context||!p.outline||p.outline.clarification||p.outline.coverage.length)throw new OnboardingError(409,'review_unavailable');
      const days=(await c.query('SELECT date::text,detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2',[a.userId,r.planId])).rows;
      if(!p.dates.every((date:string)=>days.some(d=>d.date===date&&!d.detail.clarification&&!d.detail.coverage.length)))throw new OnboardingError(409,'review_unavailable');
      await c.query("UPDATE fitquest.training_plans SET review_state='accepted' WHERE user_id=$1 AND id=$2",[a.userId,r.planId]);
      await c.query("UPDATE fitquest.training_generations SET feedback=NULL WHERE user_id=$1 AND plan_id=$2 AND status<>'pending'",[a.userId,r.planId]);
      return view(c,a);
    }),
    claimReview:(a:Account,r:ReviewRequest,provider?:OnboardingProvider):Promise<PlanningWork|undefined>=>tx(a,async c=>{
      if(!r.feedback.trim()||r.feedback.length>2000)throw new OnboardingError(422,'invalid_feedback');
      await rate(c,a);await recover(c,a);
      const plan=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,r.planId])).rows[0];
      if(!plan)throw new OnboardingError(404,'not_found');
      if(isDocumentVersion(plan.schema_version))return claimDocument(c,a,plan,r,provider);
      if(plan.schema_version===completePlanVersion)return claimComplete(c,a,plan,r,provider);
      const s=await summary(c,a),p=await profile(c,a);
      const target=`review:${r.planRevision}`;
      const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,r.planId,target])).rows[0];
      // Completed receipts make lost-response duplicates free, including clarifications.
      const feedbackHash=createHash('sha256').update(r.feedback).digest('hex');
      if(job?.status==='completed'){if(job.feedback_hash!==feedbackHash)throw new OnboardingError(409,'plan_changed');return}
      if(plan.review_revision!==r.planRevision)throw new OnboardingError(409,'plan_changed');
      if(s.revision!==r.summaryRevision||plan.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
      if(plan.catalog_version!==catalog.version)throw new OnboardingError(409,'catalog_changed');
      if(plan.review_state==='legacy'||!r.planRevision||!plan.outline_first&&!hasGoalSet(s.document))throw new OnboardingError(409,'review_unavailable');
      if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending'",[a.userId,r.planId])).rowCount)return;
      if(job&&(job.status!=='failed'||r.retryAttempt!==job.attempt_id))return;
      if(!job&&r.retryAttempt)throw new OnboardingError(409,'retry_unavailable');
      let days=(await c.query('SELECT detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 ORDER BY date',[a.userId,r.planId])).rows.map(x=>({date:x.detail.date,sessions:x.detail.sessions,coverage:x.detail.coverage,clarification:x.detail.clarification??null} as Detail));
      if(plan.outline_first){if(days.length)throw new OnboardingError(409,'review_unavailable');if(plan.outline)days=overviewDays(plan.outline);}
      if(!plan.outline||plan.outline.clarification||plan.outline.coverage.length||!plan.dates.every((date:string)=>days.some(d=>d.date===date&&!d.clarification&&!d.coverage.length)))throw new OnboardingError(409,'review_unavailable');
      if(!plan.outline_first&&s.preferences.length>=6&&/\b(from now on|going forward|future weeks|always)\b/i.test(r.feedback))throw new OnboardingError(409,'preference_limit');
      const retained=plan.review_context?.feedback??'';
      if(retained.length+r.feedback.length>6000)throw new OnboardingError(422,'feedback_limit');
      const input:PlanningInput={kind:plan.outline_first?'outline':'week',outlineFirst:plan.outline_first,draftReview:true,qualityVersion:2,preferredUnits:plan.outline.units,summary:s.document,preferences:s.preferences,profile:{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb)},dates:plan.dates,review:{feedback:r.feedback,note:plan.review_note,context:plan.review_context,outline:plan.outline,days}};
      const outbound=intakeAnswers(input.summary)?input:minimizeModelInput(input as never,[p.first_name,p.last_name]) as unknown as PlanningInput;
      const attempt=randomUUID();let failure:string|undefined,prepared:ReturnType<typeof prepareReview>|undefined;
      if(p.age<18)failure='adults_only';else if(!provider)failure='ai_disabled';else {
        await rate(c,a,true);
        try{prepared=plan.outline_first?prepareOverview(provider,outbound):prepareReview(provider,outbound)}catch(e){failure=e instanceof OnboardingError?e.code:'planning_context_limit'}
        if(prepared){
          await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,$5,$5)",[a.userId,attempt,provider.purpose??'app',provider.model,plan.outline_first?'outline-review-v2':'catalog-review-v3']);
          if(!(await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[attempt,prepared.reserveMicro,provider.capMicro])).rows[0]?.allowed)failure='budget_exhausted';
        }
      }
      await c.query(`INSERT INTO fitquest.training_generations(user_id,plan_id,target,status,error_code,attempt_id,deadline,profile_version,summary_revision,feedback,feedback_hash)
        VALUES($1,$2,$3,$4,$5,$6,now()+($10 * interval '1 second'),$7,$8,$9,$11) ON CONFLICT(user_id,plan_id,target) DO UPDATE SET status=EXCLUDED.status,error_code=EXCLUDED.error_code,attempt_id=EXCLUDED.attempt_id,deadline=EXCLUDED.deadline,profile_version=EXCLUDED.profile_version,summary_revision=EXCLUDED.summary_revision,feedback=EXCLUDED.feedback,feedback_hash=EXCLUDED.feedback_hash`,
        [a.userId,r.planId,target,failure?'failed':'pending',failure??null,attempt,p.version,s.revision,r.feedback,weeklyLimits.leaseSeconds,feedbackHash]);
      if(!failure&&prepared)return {attempt,planId:r.planId,target,revision:s.revision,planRevision:r.planRevision,profileVersion:p.version,input:outbound,body:prepared.body};
    }),
    async edit(a:Account,expected:number,document:TrainingSummary,timeZone:string) {
      checkedSummary(document);checkTimeZone(timeZone);
      return tx(a,async c=>{await rate(c,a);const old=await summary(c,a);
        if(old.revision!==expected)throw new OnboardingError(409,'summary_changed');
        document=document.map((f,i)=>{
          const previous=old.document[i];
          if(f.category==='nutrition'&&previous?.text!==f.text){const {nutritionInput,...updated}=f;return updated;}
          if(f.category==='goals'&&previous?.text!==f.text&&JSON.stringify(f.goals)===JSON.stringify(previous?.goals)){
            const {goals,...updated}=f;return updated;
          }
          return f;
        });
        if(!isDeepStrictEqual(old.document.filter((f:TrainingSummary[number])=>f.category==='availability'),document.filter(f=>f.category==='availability')))await c.query("UPDATE fitquest.training_summaries SET preferences='[]' WHERE user_id=$1",[a.userId]);
        // A repeated save after a lost response is read back, never silently applied twice.
        await c.query('UPDATE fitquest.training_summaries SET revision=revision+1,document=$2,time_zone=$3,updated_at=now() WHERE user_id=$1',[a.userId,JSON.stringify(document),timeZone]);
        return view(c,a);
      });
    },
    async ensurePlan(a:Account,expected:number) {
      return tx(a,async c=>{await rate(c,a);const s=await summary(c,a);if(s.revision!==expected)throw new OnboardingError(409,'summary_changed');
        await c.query(`INSERT INTO fitquest.training_plans(user_id,id,summary_revision,summary,time_zone,dates,catalog_version,outline_first,schema_version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,summary_revision) WHERE week_start IS NULL DO NOTHING`,[a.userId,randomUUID(),s.revision,JSON.stringify(s.document),s.time_zone,JSON.stringify(planDates(s.time_zone)),catalog.version,!intakeAnswers(s.document),intakeAnswers(s.document)?documentPlanVersion:null]);
        return view(c,a);
      });
    },
    async claim(a:Account,r:GenerationRequest,provider?:OnboardingProvider):Promise<PlanningWork|undefined> {
      return tx(a,async c=>{
        await rate(c,a);await recover(c,a);const s=await summary(c,a),p=await profile(c,a);
        const plan=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,r.planId])).rows[0];
        if(!plan)throw new OnboardingError(404,'not_found');
        if(isDocumentVersion(plan.schema_version))return claimDocument(c,a,plan,r,provider);
        if(plan.schema_version===completePlanVersion)return claimComplete(c,a,plan,r,provider);
        if(s.revision!==r.summaryRevision||plan.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
        if(plan.catalog_version!==catalog.version)throw new OnboardingError(409,'catalog_changed');
        const generationTarget=plan.outline_first&&r.target==='week'?`details:${r.planRevision}`:r.target;
        if(plan.outline_first){
          if(r.target!=='outline'&&r.target!=='week')throw new OnboardingError(409,'outline_confirmation_required');
          if(r.target==='week'){
            if(r.confirmOutline!==true||!r.planRevision)throw new OnboardingError(409,'outline_confirmation_required');
            if(plan.review_revision!==r.planRevision)throw new OnboardingError(409,'plan_changed');
            if(!plan.outline||!plan.review_revision||plan.review_context||plan.outline.clarification||plan.outline.coverage.length)throw new OnboardingError(409,'review_unavailable');
          }
        }

        if(r.target!=='week'&&r.target!=='outline'&&!plan.dates.includes(r.target))throw new OnboardingError(422,'invalid_date');
        // Serialize legacy daily requests against the new weekly operation, too.
        if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending' AND ($3='week' OR target='week' OR target LIKE 'review:%' OR $4)",[a.userId,r.planId,r.target,plan.outline_first])).rowCount)return;
        const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,r.planId,generationTarget])).rows[0];
        if(job&&(job.status!=='failed'||r.retryAttempt!==job.attempt_id))return;
        if(!job&&r.retryAttempt)throw new OnboardingError(409,'retry_unavailable');
        if(r.target==='outline'&&plan.outline || r.target!=='outline'&&r.target!=='week'&&(await c.query('SELECT 1 FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 AND date=$3',[a.userId,r.planId,r.target])).rowCount)return;
        if(r.target!=='outline'&&r.target!=='week'&&!plan.outline)throw new OnboardingError(409,'outline_required');
        // An explicit retry may recover a previously rejected formatting variant for free.
        // Never reinterpret refusals/incomplete responses, stale context, or usable saved work.
        if(r.target==='outline'&&plan.outline_first&&!plan.outline&&plan.review_revision===0&&job?.error_code==='outline_conversion'&&job.raw_response&&job.profile_version===p.version&&job.summary_revision===s.revision&&p.age>=18){
          let recovered:Outline|undefined;
          try{recovered=parsePlainOutline(job.raw_response,plan.dates)}catch(error){if(!(error instanceof OnboardingError&&error.code==='outline_conversion'))throw error;}
          if(recovered){
            await c.query("UPDATE fitquest.training_plans SET outline=$3,review_state='draft',review_revision=1,review_note=NULL,review_context=NULL,confirmed_outline_revision=NULL WHERE user_id=$1 AND id=$2",[a.userId,r.planId,JSON.stringify(recovered)]);
            await c.query("UPDATE fitquest.training_generations SET status='completed',error_code=NULL WHERE user_id=$1 AND plan_id=$2 AND target='outline'",[a.userId,r.planId]);
            return;
          }
        }
        const input:PlanningInput={outlineFirst:plan.outline_first,preferences:s.preferences,kind:r.target==='week'?'week':r.target==='outline'?'outline':'day',summary:s.document,profile:{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb)},dates:plan.dates};
        if(input.kind==='week') {
          if(plan.outline_first)input.approvedOutlineRevision=r.planRevision;
          input.draftReview=plan.review_state!=='legacy';input.preferences=s.preferences;
          input.qualityVersion=2;input.preferredUnits=plan.outline?.units??'imperial';
          const days=(await c.query('SELECT detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 ORDER BY date',[a.userId,r.planId])).rows.map(x=>x.detail as Detail);
          if(plan.outline?.clarification||plan.outline&&informationCoverage(plan.outline.coverage)||days.some(d=>d.clarification||informationCoverage(d.coverage)))throw new OnboardingError(409,'clarification_required');
          if(plan.outline?.coverage.length||days.some(d=>d.coverage.length))throw new OnboardingError(409,'catalog_coverage');
          if(plan.dates.every((date:string)=>days.some(d=>d.date===date)))return;
          if(plan.outline)input.outline=plan.outline;
          input.savedDays=days.map(d=>({date:d.date,sessions:d.sessions,coverage:d.coverage,clarification:d.clarification??null}));
          // Legacy prose has no independent, user-reviewed goal identities. Do not
          // guess goal boundaries or pay a planner to define its own coverage test.
          if(!plan.outline_first&&provider&&p.age>=18&&!hasGoalSet(input.summary)) {
            const clarification={question:'Can we review the individual goals in your saved summary before planning?',reason:'This older summary has no explicit goal list, so planning cannot yet verify that every goal is covered.'};
            if(!plan.outline)await c.query('UPDATE fitquest.training_plans SET outline=$3 WHERE user_id=$1 AND id=$2',[a.userId,r.planId,JSON.stringify({days:plan.dates.map((date:string)=>({date,sessions:[]})),coverage:[],clarification})]);
            else {
              const date=plan.dates.find((date:string)=>!days.some(d=>d.date===date));
              await c.query('INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5)',[a.userId,r.planId,date,s.revision,JSON.stringify(savedDetail({date,sessions:[],coverage:[],clarification}))]);
            }
            return;
          }
        }
        if(input.kind==='day') {
          if(plan.outline.clarification||informationCoverage(plan.outline.coverage))throw new OnboardingError(409,'clarification_required');
          if(plan.outline.coverage.length)throw new OnboardingError(409,'catalog_coverage');
          input.date=r.target;input.outline=plan.outline;
          input.previous=(await c.query('SELECT date::text,detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 AND date<$3 ORDER BY date',[a.userId,r.planId,r.target])).rows.map(x=>({date:x.date,sessions:x.detail.sessions}));
          const day=input.outline!.days.find(d=>d.date===r.target)!;
          if(!day.sessions.length){await c.query('INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5)',[a.userId,r.planId,r.target,s.revision,JSON.stringify(savedDetail({date:r.target,sessions:[],coverage:plan.outline.coverage}))]);return}
        }
        let outbound=input;
        const attempt=randomUUID();let failure:string|undefined,prepared:ReturnType<typeof preparePlanning>|undefined;
        if(p.age<18)failure='adults_only';
        else if(!provider)failure='ai_disabled';
        else {
          await rate(c,a,true);
          // Reuse existing redaction for identifiers/names without duplicating transcript.
          const redacted=intakeAnswers(input.summary)?input:minimizeModelInput(input as never,[p.first_name,p.last_name]) as unknown as PlanningInput;
          outbound=redacted;
          try{prepared=input.kind==='week'?prepareWeek(provider,redacted):plan.outline_first?(intakeAnswers(input.summary)?preparePlainOutline(provider,input):prepareOverview(provider,redacted)):preparePlanning(provider,redacted)}catch(e){failure=e instanceof OnboardingError?e.code:'planning_context_limit'}
          if(prepared) {
            await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,$5,$6)",[a.userId,attempt,provider.purpose??'app',provider.model,plan.outline_first?(input.kind==='week'?'outline-details-v2':intakeAnswers(input.summary)?'plain-outline-v1':'outline-v2'):input.kind==='week'?(input.draftReview?'catalog-week-v6':'catalog-week-v4'):planningPromptVersion,plan.outline_first?(input.kind==='week'?'outline-details-v2':intakeAnswers(input.summary)?'plain-outline-v1':'outline-v2'):input.kind==='week'?(input.draftReview?'catalog-week-v6':'catalog-week-v4'):'catalog-plan-v1']);
            if(!(await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[attempt,prepared.reserveMicro,provider.capMicro])).rows[0]?.allowed)failure='budget_exhausted';
          }
        }
        await c.query(`INSERT INTO fitquest.training_generations(user_id,plan_id,target,status,error_code,attempt_id,deadline,profile_version,summary_revision)
          VALUES($1,$2,$3,$4,$5,$6,now()+($9 * interval '1 second'),$7,$8) ON CONFLICT(user_id,plan_id,target) DO UPDATE SET
          status=EXCLUDED.status,error_code=EXCLUDED.error_code,attempt_id=EXCLUDED.attempt_id,deadline=EXCLUDED.deadline,profile_version=EXCLUDED.profile_version,summary_revision=EXCLUDED.summary_revision`,
          [a.userId,r.planId,generationTarget,failure?'failed':'pending',failure??null,attempt,p.version,s.revision,input.kind==='week'?weeklyLimits.leaseSeconds:35]);
        if(plan.outline_first&&r.target==='week')await c.query('UPDATE fitquest.training_plans SET confirmed_outline_revision=$3 WHERE user_id=$1 AND id=$2',[a.userId,r.planId,r.planRevision]);
        if(!failure&&prepared)return {attempt,planId:r.planId,target:generationTarget,revision:s.revision,planRevision:plan.review_revision,profileVersion:p.version,body:prepared.body,input:outbound};
      });
    },
    recordValidation:(a:Account,w:PlanningWork,diagnostic:unknown)=>recordPlanDiagnostic(pool,a,w,diagnostic),
    settle:async(a:Account,attempt:string,cost:number|null,diagnostic?:ProviderDiagnostic)=>{
      await tx(a,c=>c.query('SELECT fitquest.settle_onboarding($1,$2)',[attempt,cost]),false);
      // Diagnostics are best-effort and independent of charge settlement.
      if(diagnostic)try{await tx(a,c=>c.query('UPDATE fitquest.onboarding_attempts SET provider_diagnostic=$3 WHERE user_id=$1 AND id=$2',[a.userId,attempt,safeDiagnostic(diagnostic)]),false)}catch{/* Never log private error text. */}
    },
    finish:(a:Account,w:PlanningWork,value:Outline|Detail|CheckedWeek|ReviewResult|PlanResponse|SavedDocumentPlan|undefined,failure?:string,rawResponse?:string)=>tx(a,async c=>{
      const s=await summary(c,a),p=await profile(c,a);
      const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,w.planId,w.target])).rows[0];
      if(!job||job.status!=='pending'||job.attempt_id!==w.attempt)return;
      if((!w.input.schemaVersion||w.stage==='outline')&&rawResponse!==undefined&&Buffer.byteLength(rawResponse)<=64000)await c.query('UPDATE fitquest.training_generations SET raw_response=$4 WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target,rawResponse]);
      if((!w.progressSnapshot&&(s.revision!==w.revision||p.version!==w.profileVersion))||new Date(job.deadline).getTime()<=Date.now()){failure='summary_changed';value=undefined}
      if(w.input.schemaVersion===documentPlanVersion){
        const plan=(await c.query('SELECT review_revision FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,w.planId])).rows[0];
        if(plan?.review_revision!==w.planRevision){failure='plan_changed';value=undefined;}
        if(value){
          if(w.progressSnapshot)await c.query('UPDATE fitquest.training_plans SET progress_snapshot=$3 WHERE user_id=$1 AND id=$2',[a.userId,w.planId,JSON.stringify(w.progressSnapshot)]);
          await c.query("UPDATE fitquest.training_plans SET document_plan=$3,schema_version=$4,review_revision=review_revision+1,review_state='draft',accepted_at=NULL,review_note=NULL,review_context=NULL WHERE user_id=$1 AND id=$2",[a.userId,w.planId,JSON.stringify(value),documentPlanVersion]);
          await c.query('UPDATE fitquest.training_generations SET feedback=NULL WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target]);
        }
        await c.query('UPDATE fitquest.training_generations SET status=$4,error_code=$5 WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target,value?'completed':'failed',value?null:failure??'provider_error']);
        return;
      }
      if(w.input.schemaVersion===completePlanVersion){
        const plan=(await c.query('SELECT review_revision FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,w.planId])).rows[0];
        if(plan?.review_revision!==w.planRevision){failure='plan_changed';value=undefined;}
        const result=(value as PlanResponse|undefined)?.result;
        if(result?.kind==='unavailable'){
          await c.query('UPDATE fitquest.training_plans SET review_note=$3 WHERE user_id=$1 AND id=$2',[a.userId,w.planId,result.reason]);failure='plan_unavailable';value=undefined;
        }else if(result?.kind==='plan'){
          await c.query("UPDATE fitquest.training_plans SET complete_plan=$3,review_revision=review_revision+1,review_state='draft',accepted_at=NULL,review_note=NULL,review_context=NULL WHERE user_id=$1 AND id=$2",[a.userId,w.planId,JSON.stringify(result.plan)]);
          await c.query('UPDATE fitquest.training_generations SET feedback=NULL WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target]);
        }
        await c.query('UPDATE fitquest.training_generations SET status=$4,error_code=$5 WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target,value?'completed':'failed',value?null:failure??'provider_error']);
        return;
      }
      if(w.input.outlineFirst){
        const plan=(await c.query('SELECT review_revision,confirmed_outline_revision FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,w.planId])).rows[0];
        if(plan?.review_revision!==w.planRevision||w.input.kind==='week'&&plan.confirmed_outline_revision!==w.planRevision){failure='plan_changed';value=undefined;}
        if(value&&'conflict' in value&&value.conflict){
          await c.query('UPDATE fitquest.training_plans SET review_note=$3 WHERE user_id=$1 AND id=$2',[a.userId,w.planId,value.conflict]);failure='outline_conflict';value=undefined;
        }
      }
      if(w.input.review){
        const plan=(await c.query('SELECT review_revision FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,w.planId])).rows[0];
        if(plan?.review_revision!==w.planRevision){failure='plan_changed';value=undefined}
        if(value){
          const result=value as ReviewResult;
          if(result.lastingPreference&&s.preferences.length>=6)throw new OnboardingError(409,'preference_limit');
          if(result.week){
            for(const detail of result.week.details){
              const old=w.input.review.days.find(d=>d.date===detail.date)!;
              if(!isDeepStrictEqual(old.sessions,detail.sessions))await c.query('UPDATE fitquest.training_days SET detail=$4 WHERE user_id=$1 AND plan_id=$2 AND date=$3',[a.userId,w.planId,detail.date,JSON.stringify(savedDetail(detail))]);
            }
            await c.query("UPDATE fitquest.training_plans SET outline=$3,review_state='draft',review_revision=review_revision+1,review_note=$4,review_context=NULL,confirmed_outline_revision=NULL WHERE user_id=$1 AND id=$2",[a.userId,w.planId,JSON.stringify(result.week.outline),result.reply]);
            if(result.lastingPreference){
              const prefs=[...s.preferences,result.lastingPreference];
              await c.query('UPDATE fitquest.training_summaries SET preferences=$2,revision=revision+1,updated_at=now() WHERE user_id=$1',[a.userId,JSON.stringify(prefs)]);
              await c.query('UPDATE fitquest.training_plans SET summary_revision=summary_revision+1 WHERE user_id=$1 AND id=$2',[a.userId,w.planId]);
            }
          }else {
            const feedback=[w.input.review.context?.feedback,w.input.review.feedback].filter(Boolean).join('\n');
            await c.query('UPDATE fitquest.training_plans SET review_revision=review_revision+1,review_note=$3,review_context=$4,confirmed_outline_revision=NULL WHERE user_id=$1 AND id=$2',[a.userId,w.planId,result.reply,JSON.stringify({feedback,question:result.question})]);
          }
          await c.query('UPDATE fitquest.training_generations SET feedback=NULL WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target]);
        }
      }else if(value) {
        if(w.input.kind==='week') {
          const week=value as CheckedWeek;
          await c.query('UPDATE fitquest.training_plans SET outline=$3 WHERE user_id=$1 AND id=$2',[a.userId,w.planId,JSON.stringify(week.outline)]);
          if(w.input.outlineFirst&&week.details.length===w.input.dates.length)await c.query("UPDATE fitquest.training_plans SET review_state='accepted',review_note=NULL WHERE user_id=$1 AND id=$2",[a.userId,w.planId]);
          if(!w.input.outlineFirst&&w.input.draftReview&&week.details.length===w.input.dates.length&&!week.outline.clarification&&!week.outline.coverage.length)await c.query("UPDATE fitquest.training_plans SET review_revision=review_revision+1,review_state='draft' WHERE user_id=$1 AND id=$2",[a.userId,w.planId]);
          for(const detail of week.details)await c.query('INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[a.userId,w.planId,detail.date,w.revision,JSON.stringify(savedDetail(detail))]);
        }
        else if(w.target==='outline')await c.query('UPDATE fitquest.training_plans SET outline=$3,review_revision=review_revision+$4 WHERE user_id=$1 AND id=$2 AND outline IS NULL',[a.userId,w.planId,JSON.stringify(value),w.input.outlineFirst?1:0]);
        else await c.query('INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[a.userId,w.planId,w.target,w.revision,JSON.stringify(savedDetail(value as Detail))]);
      }
      await c.query('UPDATE fitquest.training_generations SET status=$4,error_code=$5 WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target,value?'completed':'failed',value?null:failure??'provider_error']);
    }),
  };
}
export type PlanningStore=ReturnType<typeof planningStore>;
