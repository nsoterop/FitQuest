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
    read:store.read,edit:store.edit,ensurePlan:store.ensurePlan,accept:store.accept,
    review:(a:Account,r:ReviewRequest,authorize:()=>Promise<boolean>)=>run(a,()=>store.claimReview(a,r,provider),authorize),
    generate:(a:Account,r:GenerationRequest,authorize:()=>Promise<boolean>)=>run(a,()=>store.claim(a,r,provider),authorize),
  };
  async function run(a:Account,claim:()=>Promise<import('./planningStore.js').PlanningWork|undefined>,authorize:()=>Promise<boolean>){
      const work=await claim();
      if(work&&provider) {
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
        const timeout=new Promise<ProviderResult>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({failure:'provider_error',diagnostic:{transport:'aborted'}})},work.input.kind==='week'?weeklyLimits.timeoutMs:30000)});
        // Settlement survives sign-out, a changed summary, timeout and content publication failure.
        const pending=Promise.resolve().then(()=>provider.call(work.body,controller.signal)).catch(():ProviderResult=>({failure:'provider_error'})).then(async result=>{
          await store.settle(a,work.attempt,result.usage?provider.cost(result.usage):null,result.diagnostic);return result;
        });
        let result:ProviderResult;try{result=await Promise.race([timeout,pending])}finally{clearTimeout(timer!)}
        if(controller.signal.aborted)await store.settle(a,work.attempt,null,{transport:'aborted'});
        if(!await authorize())throw new OnboardingError(401,'session_ended');
        let value;let failure:string|undefined=result.failure;
        if(!failure)try{value=work.input.outlineFirst&&work.input.kind==='outline'?(work.input.review?checkOverviewReview(result.proposal,work.input):intakeAnswers(work.input.summary)?parsePlainOutline(result.rawText!,work.input.dates):checkOverview(result.proposal,work.input)):work.input.review?checkReview(result.proposal,work.input):work.input.kind==='week'?checkWeek(result.proposal,work.input):work.target==='outline'?checkGeneratableOutline(provider,work.input,result.proposal):checkDetail(result.proposal,work.input.outline!.days.find(d=>d.date===work.target)!);if('coverage' in value&&informationCoverage(value.coverage)){value=undefined;throw new OnboardingError(422,'invalid_plan')}}catch(e){failure=e instanceof OnboardingError?e.code:'invalid_plan'}
        const reviewedText=work.input.review?.outline.sourceFormat==='plain-v1'?(result.proposal as {outlineText?:unknown}|undefined)?.outlineText:undefined;
        await store.finish(a,work,value,failure,result.rawText??(typeof reviewedText==='string'?reviewedText:undefined));
      }
      return store.read(a);
  }
}
export type PlanningService=ReturnType<typeof planningService>;
