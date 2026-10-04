import { informationCoverage } from './planningReadiness.js';
import type { Account } from './auth.js';
import { OnboardingError } from './onboardingDomain.js';
import type { OnboardingProvider,ProviderResult } from './onboardingProvider.js';
import { checkGeneratableOutline,checkDetail } from './planningDomain.js';
import type { GenerationRequest,PlanningStore } from './planningStore.js';

export function planningService(store:PlanningStore,provider?:OnboardingProvider,environment=process.env.NODE_ENV) {
  if(provider?.mode==='test'&&environment==='production')throw Error('Test AI is not allowed in production.');
  return {
    read:store.read,edit:store.edit,ensurePlan:store.ensurePlan,
    async generate(a:Account,r:GenerationRequest,authorize:()=>Promise<boolean>) {
      const work=await store.claim(a,r,provider);
      if(work&&provider) {
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
        const timeout=new Promise<ProviderResult>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({failure:'provider_error'})},30000)});
        // Settlement survives sign-out, a changed summary, timeout and content publication failure.
        const pending=Promise.resolve().then(()=>provider.call(work.body,controller.signal)).catch(():ProviderResult=>({failure:'provider_error'})).then(async result=>{
          await store.settle(a,work.attempt,result.usage?provider.cost(result.usage):null);return result;
        });
        let result:ProviderResult;try{result=await Promise.race([timeout,pending])}finally{clearTimeout(timer!)}
        if(controller.signal.aborted)await store.settle(a,work.attempt,null);
        if(!await authorize())throw new OnboardingError(401,'session_ended');
        let value;let failure:string|undefined=result.failure;
        if(!failure)try{value=work.target==='outline'?checkGeneratableOutline(provider,work.input,result.proposal):checkDetail(result.proposal,work.input.outline!.days.find(d=>d.date===work.target)!);if(informationCoverage(value.coverage)){value=undefined;throw new OnboardingError(422,'invalid_plan')}}catch(e){failure=e instanceof OnboardingError?e.code:'invalid_plan'}
        await store.finish(a,work,value,failure);
      }
      return store.read(a);
    },
  };
}
export type PlanningService=ReturnType<typeof planningService>;
