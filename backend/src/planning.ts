import {checkDocument,documentPlanVersion} from './documentPlanning.js';
import { CompleteValidationError,safeValidationDiagnostic } from './planDiagnostics.js';
import { checkComplete,completeOutline } from './completePlanning.js';
import { validationFailureCode } from './planningValidation.js';
import { parsePlainOutline } from './plainOutline.js';
import { intakeAnswers } from './fixedIntake.js';
import { checkOverview,checkOverviewReview } from './outlinePlanning.js';
import { checkReview,type ReviewRequest } from './planReview.js';
import { checkWeek,weeklyLimits } from './weeklyPlanning.js';
import { informationCoverage } from './planningReadiness.js';
import type { Account } from './auth.js';
import { OnboardingError } from './onboardingDomain.js';
import type { OnboardingProvider,ProviderResult } from './onboardingProvider.js';
import { checkGeneratableOutline,checkDetail } from './planningDomain.js';
import type { GenerationRequest,PlanningStore } from './planningStore.js';

export function planningService(store:PlanningStore,provider?:OnboardingProvider,environment=process.env.NODE_ENV) {
  if(provider?.mode==='test'&&environment==='production')throw Error('Test AI is not allowed in production.');
  return {
    read:store.read,edit:store.edit,ensurePlan:store.ensurePlan,accept:store.accept,consent:store.consent,nutrition:store.nutrition,
    review:(a:Account,r:ReviewRequest,authorize:()=>Promise<boolean>)=>run(a,()=>store.claimReview(a,r,provider),authorize),
    generate:(a:Account,r:GenerationRequest,authorize:()=>Promise<boolean>)=>run(a,()=>store.claim(a,r,provider),authorize),
  };
  async function run(a:Account,claim:()=>Promise<import('./planningStore.js').PlanningWork|undefined>,authorize:()=>Promise<boolean>){
      let nextWork=await claim();
      for(let stageCount=0;nextWork&&provider&&stageCount<2;stageCount++) {
        const work=nextWork;
        const attempt=work.attempt;
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
        const timeout=new Promise<ProviderResult>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({failure:'provider_error',diagnostic:{transport:'aborted'}})},work.stage==='outline'?30000:work.input.kind==='week'?weeklyLimits.timeoutMs:30000)});
        // Settlement survives sign-out, a changed summary, timeout and content publication failure.
        let consentDenied=false;
        const pending=(async():Promise<ProviderResult>=>{
          if(work.input.schemaVersion!==documentPlanVersion)return provider.call(work.body,controller.signal);
          let started:Promise<ProviderResult>|undefined;
          try{
            const allowed=await store.canDispatch(a,work,()=>{started=Promise.resolve().then(()=>provider.call(work.body,controller.signal)).catch(():ProviderResult=>({failure:'provider_error'}));});
            if(!allowed)consentDenied=true;
          }catch{/* If a commit fails after dispatch, still await and settle the actual request. */}
          return started??{failure:'provider_error',usage:{input:0,output:0,cached:0,cacheWrite:0}};
        })().catch(():ProviderResult=>({failure:'provider_error'})).then(async result=>{
          await store.settle(a,attempt,result.usage?provider.cost(result.usage):null,result.diagnostic);return result;
        });
        let result:ProviderResult;try{result=await Promise.race([timeout,pending])}finally{clearTimeout(timer!)}
        if(controller.signal.aborted)await store.settle(a,attempt,null,{transport:'aborted'});
        if(!await authorize())throw new OnboardingError(401,'session_ended');
        let value;let failure:string|undefined=consentDenied?'planning_consent_required':result.failure;
        if(!failure)try{value=work.input.schemaVersion===documentPlanVersion?checkDocument(result.proposal,work.input):work.stage==='outline'?completeOutline(result.rawText!,work.input.dates):work.input.schemaVersion==='complete-week-v1'?checkComplete(result.proposal,work.input):work.input.outlineFirst&&work.input.kind==='outline'?(work.input.review?checkOverviewReview(result.proposal,work.input):intakeAnswers(work.input.summary)?parsePlainOutline(result.rawText!,work.input.dates):checkOverview(result.proposal,work.input)):work.input.review?checkReview(result.proposal,work.input):work.input.kind==='week'?checkWeek(result.proposal,work.input):work.target==='outline'?checkGeneratableOutline(provider,work.input,result.proposal):checkDetail(result.proposal,work.input.outline!.days.find(d=>d.date===work.target)!);if(!Array.isArray(value)&&'coverage' in value&&informationCoverage(value.coverage)){value=undefined;throw new OnboardingError(422,'invalid_plan')}}catch(e){
          failure=validationFailureCode(e)??(e instanceof OnboardingError?e.code:'invalid_plan');
          if(work.input.schemaVersion==='complete-week-v1'||work.input.schemaVersion===documentPlanVersion)try{
            const diagnostic=e instanceof CompleteValidationError?e.diagnostic:safeValidationDiagnostic({stage:'integrity',rule:e instanceof OnboardingError&&e.code==='saved_day_changed'?'kept_work':'validation'});
            await store.recordValidation(a,work,diagnostic);
          }catch{/* Diagnostics cannot mask validation or affect settled accounting. */}
        }
        if(work.stage==='outline'&&!failure){
          nextWork=await store.advanceComplete(a,work,result.rawText!,provider);
          continue;
        }
        const reviewedText=work.input.review?.outline.sourceFormat==='plain-v1'?(result.proposal as {outlineText?:unknown}|undefined)?.outlineText:undefined;
        await store.finish(a,work,Array.isArray(value)?undefined:value,failure,result.rawText??(typeof reviewedText==='string'?reviewedText:undefined));
        break;
      }
      return store.read(a);
  }
}
export type PlanningService=ReturnType<typeof planningService>;
