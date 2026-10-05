import { checkReviewProtections,type ProtectionLevel } from './reviewProtection.js';
import { isDeepStrictEqual } from 'node:util';
import { OnboardingError } from './onboardingError.js';
import type { Detail,Outline,PlanningInput } from './planningDomain.js';
type DayScope={date:string;changeSessions:number[];evidence:string};
export type ResolvedScope=DayScope[];
export const resolvedScopeSchema={anyOf:[{type:'null'},{type:'array',maxItems:7,items:{type:'object',additionalProperties:false,required:['date','changeSessions','evidence'],properties:{date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},changeSessions:{type:'array',maxItems:3,uniqueItems:true,items:{type:'integer',minimum:0,maximum:2}},evidence:{type:'string',minLength:3,maxLength:350}}}}]};
// Model interpretation is bounded and source-grounded within the existing call.
// The server enforces its exact unchanged-work contract, independent of wording.
export function checkResolvedScope(scope:ResolvedScope|null,review:NonNullable<PlanningInput['review']>,dates:string[],details:Detail[],outline:Outline,level:ProtectionLevel='activities'){
  if(!scope||scope.length>7||new Set(scope.map(s=>s.date)).size!==scope.length)throw new OnboardingError(422,'invalid_plan');
  for(const s of scope){
    const old=review.days.find(d=>d.date===s.date);
    if(!dates.includes(s.date)||!old||new Set(s.changeSessions).size!==s.changeSessions.length||s.changeSessions.some(j=>!old.sessions[j]))throw new OnboardingError(422,'invalid_plan');
    if(![review.feedback,review.context?.feedback??''].some(text=>text.includes(s.evidence)))throw new OnboardingError(422,'invalid_feedback');
  }
  checkReviewProtections(review,dates,details,outline,level);
  for(const date of dates){
    const permission=scope.find(s=>s.date===date),old=review.days.find(d=>d.date===date)!,next=details.find(d=>d.date===date)!;
    const oldOutline=review.outline.days.find(d=>d.date===date)!,nextOutline=outline.days.find(d=>d.date===date)!;
    if(!permission&&(!isDeepStrictEqual(old.sessions,next.sessions)||!isDeepStrictEqual(oldOutline,nextOutline)))throw new OnboardingError(422,'saved_day_changed');
    let after=-1;
    for(const [index,session] of old.sessions.entries()){
      if(permission?.changeSessions.includes(index))continue;
      const found=next.sessions.findIndex((v,j)=>j>after&&isDeepStrictEqual(v,session)&&isDeepStrictEqual(nextOutline.sessions[j],oldOutline.sessions[index]));
      if(found<0)throw new OnboardingError(422,'saved_day_changed');after=found;
    }
  }
}
