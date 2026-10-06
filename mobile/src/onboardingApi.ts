export type RecoveryRequest={summaryRevision:number;planId:string;target:string};
export type UnderstandingItem={id:string;topic:string;value:string;origin:'profile'|'user_report'|'model_inference'|'assumption'|'unknown';review:'unreviewed'|'confirmed'|'disputed';source:string;quote:string;supersedes:string|null;recordedAt:string};
export type OnboardingCommand={operationId:string;expectedRevision:number;timeZone?:string}&(
  {kind:'message';text:string}|{kind:'retry';turnId:string}|{kind:'skip';topic:string}|{kind:'edit';itemId:string|null;topic:string;value:string}|{kind:'confirm';reviewedRevision:number});
export type OnboardingConversation={id:string;revision:number;state:'collecting'|'confirmed';confirmedRevision:number|null;
  confirmableRevision?:number|null;
  context:{items:UnderstandingItem[];skipped:string[];readiness:'needs_clarification'|'ready_with_limits'|'ready';limitations:string[]};
  turns:{id:string;sequence:number;message:string;reply:string|null;questionTopic:string|null;state:'pending'|'completed'|'failed';error:string|null}[];
  profileChanged:boolean;generationEnabled:boolean;opening:string;disclosure:string;disclosureVersion:string};
export type DeletedOnboarding={id:string;deleted:true;summarySaved?:boolean;message:string};
export function isDeletedOnboarding(value:unknown):value is DeletedOnboarding {
  if(!value||typeof value!=='object')return false;
  const x=value as DeletedOnboarding;
  return x.deleted===true&&typeof x.id==='string'&&typeof x.message==='string'&&x.message.length<=300&&(x.summarySaved===undefined||typeof x.summarySaved==='boolean')&&Object.keys(x).every(k=>['id','deleted','message','summarySaved'].includes(k));
}
export class OnboardingApiError extends Error {
  code:string;sessionEnded:boolean;
  constructor(code:string,sessionEnded=false){super(onboardingErrorText(code));this.code=code;this.sessionEnded=sessionEnded}
}
export function onboardingErrorText(code:string):string {
  const messages:Record<string,string>={clarification_required:'Answer the planning question before finishing. Your conversation is still saved.',summary_changed:'Your saved summary changed. Return to training to continue from the current summary.',conversation_in_progress:'An unfinished conversation is already saved. Return to the greeting and resume or delete it before clarifying this plan.',clarification_unavailable:'This plan no longer needs clarification. Return to training and reload.',ai_disabled:'AI replies are unavailable. Your answer is saved.',
    adults_only:'AI onboarding is for adults 18+. Your account and profile are still available.',
    budget_exhausted:'AI replies have reached the spending limit. Your answer is saved.',
    context_limit:'This answer was not saved. Try a shorter answer.',
    revision_conflict:'The conversation changed. Load the latest replies to continue.',review_changed:'The conversation changed. Load the latest replies to continue.',
    operation_conflict:'Could not send this answer. Load the conversation again.',
    profile_changed:'Your profile changed. Load the conversation again.',
    rate_limit:'Please wait a moment before trying again.',storage_limit:'This conversation is full. Your earlier answers are saved.',
    session_ended:'Your session ended. Please sign in again.',unavailable:'Could not load the conversation. Try again.',
    interrupted:'The reply was interrupted. You can try again.',stale_attempt:'The conversation changed before the reply arrived.',
    refused:'AI could not answer. You can try again.',incomplete:'The reply was incomplete. You can try again.',
    provider_error:'Could not finish the reply. Your answer is saved.',not_found:'This conversation was deleted or is unavailable.'};
  return messages[code]??'Unable to complete onboarding. Please retry.';
}
export function isConversation(value:unknown):value is OnboardingConversation {
  if(typeof value!=='object'||!value)return false;
  const x=value as OnboardingConversation;
  return typeof x.id==='string'&&Number.isInteger(x.revision)&&x.revision>=0&&['collecting','confirmed'].includes(x.state)&&
    (x.confirmableRevision===undefined||x.confirmableRevision===null||Number.isInteger(x.confirmableRevision)&&x.confirmableRevision===x.revision)&&
    typeof x.generationEnabled==='boolean'&&typeof x.profileChanged==='boolean'&&typeof x.opening==='string'&&typeof x.disclosure==='string'&&typeof x.disclosureVersion==='string'&&
    !!x.context&&Array.isArray(x.context.items)&&x.context.items.length<=80&&x.context.items.every(i=>typeof i.id==='string'&&typeof i.topic==='string'&&typeof i.value==='string'&&typeof i.source==='string'&&typeof i.quote==='string'&&typeof i.recordedAt==='string'&&
      ['profile','user_report','model_inference','assumption','unknown'].includes(i.origin)&&['unreviewed','confirmed','disputed'].includes(i.review))&&
    ['needs_clarification','ready_with_limits','ready'].includes(x.context.readiness)&&Array.isArray(x.context.limitations)&&x.context.limitations.every(s=>typeof s==='string')&&
    Array.isArray(x.context.skipped)&&x.context.skipped.every(s=>typeof s==='string')&&Array.isArray(x.turns)&&x.turns.length<=100&&x.turns.every(t=>typeof t.id==='string'&&typeof t.message==='string'&&
      (t.reply===null||typeof t.reply==='string')&&(t.questionTopic===null||typeof t.questionTopic==='string')&&['pending','completed','failed'].includes(t.state));
}
export async function onboardingRequest(method:'POST'|'GET'|'DELETE',id:string|null,command:OnboardingCommand|null,token:string,signal:AbortSignal,fetcher:typeof fetch=fetch,recovery?:RecoveryRequest):Promise<OnboardingConversation|DeletedOnboarding|null> {
  try {
    const base=process.env.EXPO_PUBLIC_API_URL;if(!base||!token||signal.aborted)throw new Error();
    const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw new Error();
    url.pathname=`${url.pathname.replace(/\/$/,'')}/onboarding${id?`/${encodeURIComponent(id)}`:''}${command?'/commands':''}`;url.search='';url.hash='';
    if(recovery)url.pathname=`${new URL(base).pathname.replace(/\/$/,'')}/training/clarification`;
    const response=await fetcher(url.toString(),{method,signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(method==='POST'?{body:JSON.stringify(recovery??command??{disclosureVersion:'onboarding-planning-v2',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})}:{})});
    if(signal.aborted)throw new Error();
    if(response.status===401)throw new OnboardingApiError('session_ended',true);
    if(method==='DELETE'&&response.status===204)return null;
    const body:unknown=await response.json();if(signal.aborted)throw new Error();
    if(response.status!==200)throw new OnboardingApiError(typeof body==='object'&&body&&'code'in body&&typeof body.code==='string'?body.code:'unavailable');
    if(isDeletedOnboarding(body)){if(id?body.id!==id:!recovery||body.summarySaved!==true)throw new Error();return body}
    if(!isConversation(body))throw new Error();return body;
  }catch(error){if(error instanceof OnboardingApiError)throw error;throw new OnboardingApiError('unavailable')}
}
export function operationId():string {
  // Collision-resistant identifier for retryable UI operations, never an ownership credential.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16)});
}
