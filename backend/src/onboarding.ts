import type { Account } from './auth.js';
import { applyProposal, disclosure, disclosureVersion, limits, opening, OnboardingError, type Command } from './onboardingDomain.js';
import { validateProposal, type OnboardingProvider, type ProviderResult } from './onboardingProvider.js';
import type { Conversation, OnboardingStore } from './onboardingStore.js';

export function onboardingService(store:OnboardingStore,provider?:OnboardingProvider,environment=process.env.NODE_ENV) {
  if(provider?.mode==='test' && environment==='production') throw new Error('Test AI is not allowed in production.');
  const present=(conversation:Conversation)=>({...conversation,generationEnabled:!!provider,opening,disclosure:provider?disclosure.replace('AI conversation is not activated yet. When enabled,','AI conversation is enabled.'):disclosure,disclosureVersion});
  return {
    create:async(account:Account)=>present(await store.create(account)),
    read:async(account:Account,id:string)=>present(await store.read(account,id)),
    remove:(account:Account,id:string)=>store.remove(account,id),
    async command(account:Account,id:string,command:Command,authorize:()=>Promise<boolean>) {
      const claimed=await store.claim(account,id,command,provider);
      const presentOperation=async(conversation:Conversation)=>({...present(conversation),operationResult:await store.operation(account,id,command.operationId)});
      if(!claimed.work || !provider) return presentOperation(claimed.conversation);
      const work=claimed.work;
      const controller=new AbortController();
      let timeout:ReturnType<typeof setTimeout>;
      const timedOut=new Promise<ProviderResult>(resolve=>{timeout=setTimeout(()=>{controller.abort();resolve({failure:'provider_error'})},30000)});
      // Settlement is attached to the provider result itself, even when a deadline wins the race.
      const request=Promise.resolve().then(()=>provider.call(work.body,controller.signal)).catch(():ProviderResult=>({failure:'provider_error'})).then(async result=>{
        await store.settle(account,work.attempt,result.usage?provider.cost(result.usage):null);
        return result;
      });
      let result:ProviderResult;
      try { result=await Promise.race([request,timedOut]); }
      finally {clearTimeout(timeout!)}
      if(controller.signal.aborted) await store.settle(account,work.attempt,null);
      if(!await authorize()) throw new OnboardingError(401,'session_ended');
      let context; let reply; let questionTopic; let failure=result.failure;
      if(!failure) {
        try {
          const proposal=validateProposal(result.proposal);
          context=applyProposal(claimed.conversation.context,proposal,work.sources,new Date().toISOString());
          reply=[proposal.reply,proposal.nextQuestion?.text].filter(Boolean).join('\n\n');
          questionTopic=proposal.nextQuestion?.topic;
          if(reply.length>3000) throw new OnboardingError(422,'invalid_model_output');
        }catch{failure='incomplete'}
      }
      return presentOperation(await store.finish(account,id,work,context,reply,failure,questionTopic));
    },
  };
}
export type OnboardingService=ReturnType<typeof onboardingService>;
const uuid={type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'};
const base={operationId:uuid,expectedRevision:{type:'integer',minimum:0,maximum:limits.operations}};
const text=(maximum:number)=>({type:'string',minLength:1,maxLength:maximum,pattern:'\\S'});
export const idSchema={type:'object',additionalProperties:false,required:['id'],properties:{id:uuid}};
export const commandSchema={oneOf:[
  ['message',{text:text(limits.message)}],['retry',{turnId:uuid}],['skip',{topic:text(80)}],
  ['edit',{itemId:{anyOf:[{type:'null'},text(20)]},topic:text(80),value:text(4000)}],
  ['confirm',{reviewedRevision:{type:'integer',minimum:0,maximum:limits.operations}}],
].map(([kind,fields])=>({type:'object',additionalProperties:false,required:['operationId','expectedRevision','kind',...Object.keys(fields as object)],properties:{...base,kind:{const:kind},...fields as object}}))};
