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
import { checkTimeZone,checkedSummary,sevenDates,hasGoalSet,type TrainingSummary } from './trainingSummary.js';
import { preparePlanning,planningPromptVersion,savedDetail,type PlanningInput,type Outline,type Detail } from './planningDomain.js';

export type GenerationRequest={summaryRevision:number;planId:string;target:string;retryAttempt:string|null};
export type PlanningWork={attempt:string;planId:string;target:string;revision:number;planRevision?:number;profileVersion:string;input:PlanningInput;body:string};
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
    const s=(await c.query('SELECT revision,document,time_zone,preferences FROM fitquest.training_summaries WHERE user_id=$1 FOR UPDATE',[a.userId])).rows[0];
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
    const s=(await c.query('SELECT revision,document,preferences,time_zone AS "timeZone",source_conversation AS "sourceConversation" FROM fitquest.training_summaries WHERE user_id=$1',[a.userId])).rows[0]??null;
    const plans=(await c.query(`SELECT id,summary_revision AS "summaryRevision",time_zone AS "timeZone",dates,catalog_version AS "catalogVersion",outline,
      review_state AS "reviewState",review_revision AS "planRevision",review_note AS "reviewNote",review_context->>'question' AS "reviewQuestion"
      FROM fitquest.training_plans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,[a.userId])).rows;
    for(const p of plans) {
      p.days=(await c.query('SELECT date::text,detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 ORDER BY date',[a.userId,p.id])).rows;
      p.jobs=(await c.query('SELECT target,status,error_code AS error,attempt_id AS "attemptId",feedback FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND (target NOT LIKE \'review:%\' OR target=$3)',[a.userId,p.id,`review:${p.planRevision}`])).rows;
    }
    return {summary:s,plans};
  }
  return {
    read:(a:Account)=>tx(a,async c=>{await rate(c,a);await recover(c,a);return view(c,a)}),
    accept:(a:Account,r:PlanVersion)=>tx(a,async c=>{
      await rate(c,a);await recover(c,a);
      const p=(await c.query('SELECT * FROM fitquest.training_plans WHERE user_id=$1 AND id=$2 FOR UPDATE',[a.userId,r.planId])).rows[0];
      if(!p)throw new OnboardingError(404,'not_found');
      const s=await summary(c,a);
      if(p.review_revision!==r.planRevision)throw new OnboardingError(409,'plan_changed');
      if(s.revision!==r.summaryRevision||p.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
      if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending'",[a.userId,r.planId])).rowCount)throw new OnboardingError(409,'review_pending');
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
      const s=await summary(c,a),p=await profile(c,a);
      const target=`review:${r.planRevision}`;
      const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,r.planId,target])).rows[0];
      // Completed receipts make lost-response duplicates free, including clarifications.
      const feedbackHash=createHash('sha256').update(r.feedback).digest('hex');
      if(job?.status==='completed'){if(job.feedback_hash!==feedbackHash)throw new OnboardingError(409,'plan_changed');return}
      if(plan.review_revision!==r.planRevision)throw new OnboardingError(409,'plan_changed');
      if(s.revision!==r.summaryRevision||plan.summary_revision!==s.revision)throw new OnboardingError(409,'summary_changed');
      if(plan.catalog_version!==catalog.version)throw new OnboardingError(409,'catalog_changed');
      if(plan.review_state==='legacy'||!r.planRevision||!hasGoalSet(s.document))throw new OnboardingError(409,'review_unavailable');
      if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending'",[a.userId,r.planId])).rowCount)return;
      if(job&&(job.status!=='failed'||r.retryAttempt!==job.attempt_id))return;
      if(!job&&r.retryAttempt)throw new OnboardingError(409,'retry_unavailable');
      const days=(await c.query('SELECT detail FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 ORDER BY date',[a.userId,r.planId])).rows.map(x=>({date:x.detail.date,sessions:x.detail.sessions,coverage:x.detail.coverage,clarification:x.detail.clarification??null} as Detail));
      if(!plan.outline||plan.outline.clarification||plan.outline.coverage.length||!plan.dates.every((date:string)=>days.some(d=>d.date===date&&!d.clarification&&!d.coverage.length)))throw new OnboardingError(409,'review_unavailable');
      if(s.preferences.length>=6&&/\b(from now on|going forward|future weeks|always)\b/i.test(r.feedback))throw new OnboardingError(409,'preference_limit');
      const retained=plan.review_context?.feedback??'';
      if(retained.length+r.feedback.length>6000)throw new OnboardingError(422,'feedback_limit');
      const input:PlanningInput={kind:'week',draftReview:true,qualityVersion:2,preferredUnits:plan.outline.units,summary:s.document,preferences:s.preferences,profile:{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb)},dates:plan.dates,review:{feedback:r.feedback,context:plan.review_context,outline:plan.outline,days}};
      const outbound=minimizeModelInput(input as never,[p.first_name,p.last_name]) as unknown as PlanningInput;
      const attempt=randomUUID();let failure:string|undefined,prepared:ReturnType<typeof prepareReview>|undefined;
      if(p.age<18)failure='adults_only';else if(!provider)failure='ai_disabled';else {
        await rate(c,a,true);
        try{prepared=prepareReview(provider,outbound)}catch(e){failure=e instanceof OnboardingError?e.code:'planning_context_limit'}
        if(prepared){
          await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,'catalog-review-v2','catalog-review-v2')",[a.userId,attempt,provider.purpose??'app',provider.model]);
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
        if(r.target!=='week'&&r.target!=='outline'&&!plan.dates.includes(r.target))throw new OnboardingError(422,'invalid_date');
        // Serialize legacy daily requests against the new weekly operation, too.
        if((await c.query("SELECT 1 FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND status='pending' AND ($3='week' OR target='week' OR target LIKE 'review:%')",[a.userId,r.planId,r.target])).rowCount)return;
        const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,r.planId,r.target])).rows[0];
        if(job&&(job.status!=='failed'||r.retryAttempt!==job.attempt_id))return;
        if(!job&&r.retryAttempt)throw new OnboardingError(409,'retry_unavailable');
        if(r.target==='outline'&&plan.outline || r.target!=='outline'&&r.target!=='week'&&(await c.query('SELECT 1 FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 AND date=$3',[a.userId,r.planId,r.target])).rowCount)return;
        if(r.target!=='outline'&&r.target!=='week'&&!plan.outline)throw new OnboardingError(409,'outline_required');
        const input:PlanningInput={kind:r.target==='week'?'week':r.target==='outline'?'outline':'day',summary:s.document,profile:{age:p.age,heightInches:p.height_inches,weightLb:Number(p.weight_lb)},dates:plan.dates};
        if(input.kind==='week') {
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
          if(provider&&p.age>=18&&!hasGoalSet(input.summary)) {
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
          const redacted=minimizeModelInput(input as never,[p.first_name,p.last_name]) as unknown as PlanningInput;
          outbound=redacted;
          try{prepared=input.kind==='week'?prepareWeek(provider,redacted):preparePlanning(provider,redacted)}catch(e){failure=e instanceof OnboardingError?e.code:'planning_context_limit'}
          if(prepared) {
            await c.query("INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,$5,$6)",[a.userId,attempt,provider.purpose??'app',provider.model,input.kind==='week'?(input.draftReview?'catalog-week-v5':'catalog-week-v3'):planningPromptVersion,input.kind==='week'?(input.draftReview?'catalog-week-v5':'catalog-week-v3'):'catalog-plan-v1']);
            if(!(await c.query('SELECT fitquest.reserve_onboarding($1,$2,$3) AS allowed',[attempt,prepared.reserveMicro,provider.capMicro])).rows[0]?.allowed)failure='budget_exhausted';
          }
        }
        await c.query(`INSERT INTO fitquest.training_generations(user_id,plan_id,target,status,error_code,attempt_id,deadline,profile_version,summary_revision)
          VALUES($1,$2,$3,$4,$5,$6,now()+($9 * interval '1 second'),$7,$8) ON CONFLICT(user_id,plan_id,target) DO UPDATE SET
          status=EXCLUDED.status,error_code=EXCLUDED.error_code,attempt_id=EXCLUDED.attempt_id,deadline=EXCLUDED.deadline,profile_version=EXCLUDED.profile_version,summary_revision=EXCLUDED.summary_revision`,
          [a.userId,r.planId,r.target,failure?'failed':'pending',failure??null,attempt,p.version,s.revision,input.kind==='week'?weeklyLimits.leaseSeconds:35]);
        if(!failure&&prepared)return {attempt,planId:r.planId,target:r.target,revision:s.revision,profileVersion:p.version,body:prepared.body,input:outbound};
      });
    },
    settle:async(a:Account,attempt:string,cost:number|null,diagnostic?:ProviderDiagnostic)=>{
      await tx(a,c=>c.query('SELECT fitquest.settle_onboarding($1,$2)',[attempt,cost]),false);
      // Diagnostics are best-effort and independent of charge settlement.
      if(diagnostic)try{await tx(a,c=>c.query('UPDATE fitquest.onboarding_attempts SET provider_diagnostic=$3 WHERE user_id=$1 AND id=$2',[a.userId,attempt,safeDiagnostic(diagnostic)]),false)}catch{/* Never log private error text. */}
    },
    finish:(a:Account,w:PlanningWork,value:Outline|Detail|CheckedWeek|ReviewResult|undefined,failure?:string)=>tx(a,async c=>{
      const s=await summary(c,a),p=await profile(c,a);
      const job=(await c.query('SELECT * FROM fitquest.training_generations WHERE user_id=$1 AND plan_id=$2 AND target=$3 FOR UPDATE',[a.userId,w.planId,w.target])).rows[0];
      if(!job||job.status!=='pending'||job.attempt_id!==w.attempt)return;
      if(s.revision!==w.revision||p.version!==w.profileVersion||new Date(job.deadline).getTime()<=Date.now()){failure='summary_changed';value=undefined}
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
            await c.query("UPDATE fitquest.training_plans SET outline=$3,review_state='draft',review_revision=review_revision+1,review_note=$4,review_context=NULL WHERE user_id=$1 AND id=$2",[a.userId,w.planId,JSON.stringify(result.week.outline),result.reply]);
            if(result.lastingPreference){
              const prefs=[...s.preferences,result.lastingPreference];
              await c.query('UPDATE fitquest.training_summaries SET preferences=$2,revision=revision+1,updated_at=now() WHERE user_id=$1',[a.userId,JSON.stringify(prefs)]);
              await c.query('UPDATE fitquest.training_plans SET summary_revision=summary_revision+1 WHERE user_id=$1 AND id=$2',[a.userId,w.planId]);
            }
          }else {
            const feedback=[w.input.review.context?.feedback,w.input.review.feedback].filter(Boolean).join('\n');
            await c.query('UPDATE fitquest.training_plans SET review_revision=review_revision+1,review_note=$3,review_context=$4 WHERE user_id=$1 AND id=$2',[a.userId,w.planId,result.reply,JSON.stringify({feedback,question:result.question})]);
          }
          await c.query('UPDATE fitquest.training_generations SET feedback=NULL WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target]);
        }
      }else if(value) {
        if(w.target==='week') {
          const week=value as CheckedWeek;
          await c.query('UPDATE fitquest.training_plans SET outline=$3 WHERE user_id=$1 AND id=$2',[a.userId,w.planId,JSON.stringify(week.outline)]);
          if(w.input.draftReview&&week.details.length===7&&!week.outline.clarification&&!week.outline.coverage.length)await c.query("UPDATE fitquest.training_plans SET review_revision=review_revision+1,review_state='draft' WHERE user_id=$1 AND id=$2",[a.userId,w.planId]);
          for(const detail of week.details)await c.query('INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[a.userId,w.planId,detail.date,w.revision,JSON.stringify(savedDetail(detail))]);
        }
        else if(w.target==='outline')await c.query('UPDATE fitquest.training_plans SET outline=$3 WHERE user_id=$1 AND id=$2 AND outline IS NULL',[a.userId,w.planId,JSON.stringify(value)]);
        else await c.query('INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[a.userId,w.planId,w.target,w.revision,JSON.stringify(savedDetail(value as Detail))]);
      }
      await c.query('UPDATE fitquest.training_generations SET status=$4,error_code=$5 WHERE user_id=$1 AND plan_id=$2 AND target=$3',[a.userId,w.planId,w.target,value?'completed':'failed',value?null:failure??'provider_error']);
    }),
  };
}
export type PlanningStore=ReturnType<typeof planningStore>;
