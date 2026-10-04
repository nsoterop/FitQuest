import { informationCoverage } from './planningReadiness.js';
import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Account } from './auth.js';
import { OnboardingError } from './onboardingDomain.js';
import { minimizeModelInput,type OnboardingProvider } from './onboardingProvider.js';
import { catalog } from './activityCatalog.js';
import { checkTimeZone,checkedSummary,sevenDates,type TrainingSummary } from './trainingSummary.js';
import { preparePlanning,planningPromptVersion,savedDetail,type PlanningInput,type Outline,type Detail } from './planningDomain.js';

export type GenerationRequest={summaryRevision:number;planId:string;target:string;retryAttempt:string|null};
export type PlanningWork={attempt:string;planId:string;target:string;revision:number;profileVersion:string;input:PlanningInput;body:string};
export function planningStore(pool:Pool) {
  async function tx<T>(a:Account,fn:(c:PoolClient)=>Promise<T>,session=true):Promise<T>{
    const c=await pool.connect();try {
      await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[a.userId]);
      if(session&&!(await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active',[a.sessionId,a.userId])).rows[0]?.active)throw new OnboardingError(401,'session_ended');
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
    const s=(await c.query('SELECT revision,document,time_zone FROM fitquest.training_summaries WHERE user_id=$1 FOR UPDATE',[a.userId])).rows[0];
    if(!s)throw new OnboardingError(409,'summary_required');return s;
  }
  async function profile(c:PoolClient,a:Account) {
    const p=(await c.query('SELECT age,height_inches,weight_lb,first_name,last_name,updated_at::text AS version FROM fitquest.profiles WHERE user_id=$1 FOR SHARE',[a.userId])).rows[0];
    if(!p)throw new OnboardingError(409,'profile_required');return p;
  }
  async function recover(c:PoolClient,a:Account) {
    const expired=await c.query("UPDATE fitquest.training_generations SET status='failed',error_code='interrupted' WHERE user_id=$1 AND status='pending' AND deadline<=now() RETURNING attempt_id",[a.userId]);
    for(const row of expired.rows)await c.query('SELECT fitquest.settle_onboarding($1,NULL)',[row.attempt_id]);
  }
  async function view(c:PoolClient,a:Account) {
    const s=(await c.query('SELECT revision,document,time_zone AS "timeZone",source_conversation AS "sourceConversation" FROM fitquest.training_summaries WHERE user_id=$1',[a.userId])).rows[0]??null;
    const plans=(await c.query('SELECT id,summary_revision AS "summaryRevision",time_zone AS "timeZone",dates,catalog_version AS "catalogVersion",outline FROM fitquest.training_plans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',[a.userId])).rows;
    for(const p of plans) {
      p.days=(await c.query('SELECT date::text,detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 ORDER BY date',[a.userId,p.id])).rows;
      p.jobs=(await c.query('SELECT target,status,error_code AS error,attempt_id AS "attemptId" FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2',[a.userId,p.id])).rows;
    }
    return {summary:s,plans};
  }
  return {
    read:(a:Account)=>tx(a,async c=>{await rate(c,a);await recover(c,a);return view(c,a)}),
    async edit(a:Account,expected:number,document:TrainingSummary,timeZone:string) {
      checkedSummary(document);checkTimeZone(timeZone);
      return tx(a,async c=>{await rate(c,a);const old=await summary(c,a);
        if(old.revision!==expected)throw new OnboardingError(409,'summary_changed');
        // A repeated save after a lost response is read back, never silently applied twice.
        await c.query('UPDATE fitquest.training_summaries SET revision=revision+1,document=$2,time_zone=$3,updated_at=now() WHERE user_id=$1',[a.userId,JSON.stringify(document),timeZone]);
        return view(c,a);
      });
    },
    async ensurePlan(a:Account,expected:number) {
      return tx(a,async c=>{await rate(c,a);const s=await summary(c,a);if(s.revision!==expected)throw new OnboardingError(409,'summary_changed');
        await c.query(`INSERT INTO fitquest.training_plans(user_id,id,summary_revision,summary,time_zone,dates,catalog_version)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,summary_revision) DO NOTHING`,[a.userId,randomUUID(),s.revision,JSON.stringify(s.document),s.time_zone,JSON.stringify(sevenDates(s.time_zone)),catalog.version]);
        return view(c,a);
      });
    },
    async claim(a:Account,r:GenerationRequest,provider?:OnboardingProvider):Promise<PlanningWork|undefined> {
      return tx(a,async c=>{
        await rate(c,a);await recover(c,a);const s=await summary(c,a),p=await profile(c,a);
        const plan=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,r.planId])).rows[0];
        if(!plan)throw new OnboardingError(404,'not_found');
        if(s.revision!==r.summaryRevision||plan.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
        if(plan.catalog_version!==catalog.version)throw new OnboardingError(409,'catalog_changed');
        if(r.target!=='outline'&&!plan.dates.includes(r.target))throw new OnboardingError(422,'invalid_date');
        const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,r.planId,r.target])).rows[0];
        if(job&&(job.status!=='failed'||r.retryAttempt!==job.attempt_id))return;
        if(!job&&r.retryAttempt)throw new OnboardingError(409,'retry_unavailable');
        if(r.target==='outline'&&plan.outline || r.target!=='outline'&&(await c.query('SELECT 1 FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 AND date=$3',[a.userId,r.planId,r.target])).rowCount)return;
        if(r.target!=='outline'&&!plan.outline)throw new OnboardingError(409,'outline_required');
        const input:PlanningInput={kind:r.target==='outline'?'outline':'day',summary:s.document,profile:{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb)},dates:plan.dates};
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
          const redacted=minimizeModelInput(input as never,[p.first_name,p.last_name]) as unknown as PlanningInput;
          outbound=redacted;
          try{prepared=preparePlanning(provider,redacted)}catch(e){failure=e instanceof OnboardingError?e.code:'planning_context_limit'}
          if(prepared) {
            await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,$5,'catalog-plan-v1')",[a.userId,attempt,provider.purpose??'app',provider.model,planningPromptVersion]);
            if(!(await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[attempt,prepared.reserveMicro,provider.capMicro])).rows[0]?.allowed)failure='budget_exhausted';
          }
        }
        await c.query(`INSERT INTO fitquest.training_generations(user_id,plan_id,target,status,error_code,attempt_id,deadline,profile_version,summary_revision)
          VALUES($1,$2,$3,$4,$5,$6,now()+interval '35 seconds',$7,$8) ON CONFLICT(user_id,plan_id,target) DO UPDATE SET
          status=EXCLUDED.status,error_code=EXCLUDED.error_code,attempt_id=EXCLUDED.attempt_id,deadline=EXCLUDED.deadline,profile_version=EXCLUDED.profile_version,summary_revision=EXCLUDED.summary_revision`,
          [a.userId,r.planId,r.target,failure?'failed':'pending',failure??null,attempt,p.version,s.revision]);
        if(!failure&&prepared)return {attempt,planId:r.planId,target:r.target,revision:s.revision,profileVersion:p.version,body:prepared.body,input:outbound};
      });
    },
    settle:(a:Account,attempt:string,cost:number|null)=>tx(a,c=>c.query('SELECT fitquest.settle_onboarding($1,$2)',[attempt,cost]),false),
    finish:(a:Account,w:PlanningWork,value:Outline|Detail|undefined,failure?:string)=>tx(a,async c=>{
      const s=await summary(c,a),p=await profile(c,a);
      const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,w.planId,w.target])).rows[0];
      if(!job||job.status!=='pending'||job.attempt_id!==w.attempt)return;
      if(s.revision!==w.revision||p.version!==w.profileVersion||new Date(job.deadline).getTime()<=Date.now()){failure='summary_changed';value=undefined}
      if(value) {
        if(w.target==='outline')await c.query('UPDATE fitquest.training_plans SET outline=$3 WHERE user_id=$1 AND id=$2 AND outline IS NULL',[a.userId,w.planId,JSON.stringify(value)]);
        else await c.query('INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[a.userId,w.planId,w.target,w.revision,JSON.stringify(savedDetail(value as Detail))]);
      }
      await c.query('UPDATE fitquest.training_generations SET status=$4,error_code=$5 WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target,value?'completed':'failed',value?null:failure??'provider_error']);
    }),
  };
}
export type PlanningStore=ReturnType<typeof planningStore>;
