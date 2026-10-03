export type UnderstandingItem={id:string;topic:string;value:string;origin:'profile'|'user_report'|'model_inference'|'assumption'|'unknown';review:'unreviewed'|'confirmed'|'disputed';source:string;quote:string;supersedes:string|null;recordedAt:string};
export type OnboardingCommand={operationId:string;expectedRevision:number}&(
  {kind:'message';text:string}|{kind:'retry';turnId:string}|{kind:'skip';topic:string}|{kind:'edit';itemId:string|null;topic:string;value:string}|{kind:'confirm';reviewedRevision:number});
export type OnboardingConversation={id:string;revision:number;state:'collecting'|'confirmed';confirmedRevision:number|null;
  context:{items:UnderstandingItem[];skipped:string[];readiness:'needs_clarification'|'ready_with_limits'|'ready';limitations:string[]};
  turns:{id:string;sequence:number;message:string;reply:string|null;questionTopic:string|null;state:'pending'|'completed'|'failed';error:string|null}[];
  profileChanged:boolean;generationEnabled:boolean;opening:string;disclosure:string;disclosureVersion:string};
export class OnboardingApiError extends Error {
  code:string;sessionEnded:boolean;
  constructor(code:string,sessionEnded=false){super(onboardingErrorText(code));this.code=code;this.sessionEnded=sessionEnded}
}
export function onboardingErrorText(code:string):string {
  const messages:Record<string,string>={ai_disabled:'AI conversation is not activated yet. Your message was saved; you can review and edit your understanding.',
    adults_only:'AI conversation is currently limited to adults based on the saved profile. Account and profile access remain available.',
    budget_exhausted:'AI conversation has reached its spending limit. Your message was saved; review and editing remain available.',
    context_limit:'This change was not saved because it exceeds the conversation limit. Shorten your draft, or review and confirm the saved understanding. Earlier goals and restrictions are unchanged.',
    revision_conflict:'Your understanding changed. Refresh it before continuing.',review_changed:'The reviewed version changed. Refresh and review again.',
    operation_conflict:'This operation differs from the saved request. Refresh before trying again.',
    profile_changed:'Your profile changed. Review the disputed profile references before continuing.',
    rate_limit:'Too many requests. Please try again later.',storage_limit:'This change was not saved because the conversation is full. Review the saved understanding, or delete the conversation to start again.',
    session_ended:'Your session ended. Please sign in again.',unavailable:'Conversation is unavailable. Please retry.',
    interrupted:'The previous attempt was interrupted. You can retry it.',stale_attempt:'Your understanding changed before the reply arrived. Refresh to continue.',
    refused:'AI could not answer this onboarding message. You can edit your understanding or retry.',incomplete:'AI returned an incomplete response. You can retry.',
    provider_error:'AI could not finish. Your saved message is available to retry.',not_found:'This conversation was deleted or is unavailable.'};
  return messages[code]??'Unable to complete onboarding. Please retry.';
}
export function isConversation(value:unknown):value is OnboardingConversation {
  if(typeof value!=='object'||!value)return false;
  const x=value as OnboardingConversation;
  return typeof x.id==='string'&&Number.isInteger(x.revision)&&x.revision>=0&&['collecting','confirmed'].includes(x.state)&&
    typeof x.generationEnabled==='boolean'&&typeof x.profileChanged==='boolean'&&typeof x.opening==='string'&&typeof x.disclosure==='string'&&typeof x.disclosureVersion==='string'&&
    !!x.context&&Array.isArray(x.context.items)&&x.context.items.length<=80&&x.context.items.every(i=>typeof i.id==='string'&&typeof i.topic==='string'&&typeof i.value==='string'&&typeof i.source==='string'&&typeof i.quote==='string'&&typeof i.recordedAt==='string'&&
      ['profile','user_report','model_inference','assumption','unknown'].includes(i.origin)&&['unreviewed','confirmed','disputed'].includes(i.review))&&
    ['needs_clarification','ready_with_limits','ready'].includes(x.context.readiness)&&Array.isArray(x.context.limitations)&&x.context.limitations.every(s=>typeof s==='string')&&
    Array.isArray(x.context.skipped)&&x.context.skipped.every(s=>typeof s==='string')&&Array.isArray(x.turns)&&x.turns.length<=100&&x.turns.every(t=>typeof t.id==='string'&&typeof t.message==='string'&&
      (t.reply===null||typeof t.reply==='string')&&(t.questionTopic===null||typeof t.questionTopic==='string')&&['pending','completed','failed'].includes(t.state));
}
export async function onboardingRequest(method:'POST'|'GET'|'DELETE',id:string|null,command:OnboardingCommand|null,token:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<OnboardingConversation|null> {
  try {
    const base=process.env.EXPO_PUBLIC_API_URL;if(!base||!token||signal.aborted)throw new Error();
    const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw new Error();
    url.pathname=`${url.pathname.replace(/\/$/,'')}/onboarding${id?`/${encodeURIComponent(id)}`:''}${command?'/commands':''}`;url.search='';url.hash='';
    const response=await fetcher(url.toString(),{method,signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(method==='POST'?{body:JSON.stringify(command??{disclosureVersion:'onboarding-adults-v1'})}:{})});
    if(signal.aborted)throw new Error();
    if(response.status===401)throw new OnboardingApiError('session_ended',true);
    if(method==='DELETE'&&response.status===204)return null;
    const body:unknown=await response.json();if(signal.aborted)throw new Error();
    if(response.status!==200)throw new OnboardingApiError(typeof body==='object'&&body&&'code'in body&&typeof body.code==='string'?body.code:'unavailable');
    if(!isConversation(body))throw new Error();return body;
  }catch(error){if(error instanceof OnboardingApiError)throw error;throw new OnboardingApiError('unavailable')}
}
export function operationId():string {
  // Collision-resistant identifier for retryable UI operations, never an ownership credential.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16)});
}
