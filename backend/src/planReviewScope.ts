import { isDeepStrictEqual } from 'node:util';
import type { Detail,Outline,PlanningInput } from './planningDomain.js';

type Scope={date:string;session:string|null};
const weekday=(date:string)=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const keep=/\b(?:keep|preserve|leave|don't change|do not change)\b/i;
const edit=/\b(?:change|revise|edit|adjust|split|shorten|lengthen|halve|reduce|increase|replace|remove|add|move|swap|reschedule|combine)\b/i;
const reassurance=/\b(?:unchanged|the same|as (?:it|they) (?:is|are)|still good|(?:is|are) (?:good|fine))\b/i;
const sessionLabel='morning|midday|evening|flexible|first|second|third';
const ordinalDays=['first','second','third','fourth','fifth','sixth','seventh'];

function scopes(clause:string,dates:string[]):Scope[]{
  return dates.flatMap((date,index)=>{
    const label=`(?:${date}|${weekday(date)}(?:'s)?|(?:the\\s+)?${ordinalDays[index]}\\s+day)`;
    const found=new RegExp(`\\b${label}\\b`,'i').exec(clause);
    if(!found)return [];
    const after=clause.slice(found.index+found[0].length),before=clause.slice(0,found.index);
    const session=new RegExp(`^\\s*(?:the\\s+)?(${sessionLabel})\\b`,'i').exec(after)?.[1]
      ??new RegExp(`\\b(${sessionLabel})\\s+(?:session\\s+)?(?:on\\s+)?$`,'i').exec(before)?.[1];
    return [{date,session:session?.toLowerCase()??null}];
  });
}
function intent(text:string,dates:string[]){
  const kept:Scope[]=[],changed:Scope[]=[],overrides:Scope[]=[];
  let broad=false,unscoped=false;
  // Split comma/conjunction boundaries only when another independent instruction
  // follows. Day lists and "split Tuesday ... and add speed" stay in one scope.
  for(const clause of text.split(/[;.!?\n]+|\bbut\b|(?:,\s*(?:and\s+)?|\band\s+)(?=(?:keep|preserve|leave|change|revise|edit|adjust|split|shorten|lengthen|halve|reduce|increase|replace|remove|move|swap|reschedule|combine)\b)/i).map(s=>s.trim()).filter(Boolean)){
    const targets=scopes(clause,dates),keeping=keep.test(clause)||/\b(?:don't|do not|never|no changes?)\b/i.test(clause)&&edit.test(clause)||reassurance.test(clause)&&!edit.test(clause);
    if(keeping){kept.push(...targets);continue}
    if(targets.length){changed.push(...targets);if(edit.test(clause))overrides.push(...targets)}
    else {unscoped=true;if(edit.test(clause))broad=true}
  }
  return {kept,changed,overrides,broad,unscoped};
}
const contains=(scope:Scope,date:string,index:number,session:Detail['sessions'][number])=>scope.date===date&&(scope.session===null||scope.session===session.timing||['first','second','third'][index]===scope.session);
type Review=NonNullable<PlanningInput['review']>;
export function reviewScope(review:Review,dates:string[]){
  const previous=intent(review.context?.feedback??'',dates),latest=intent(review.feedback,dates);
  const turns=[...(review.context?.feedback.split('\n').filter(Boolean)??[]).map(text=>intent(text,dates)),latest];
  const effective=latest.changed.length||latest.broad?latest:previous;
  // Free-form whole-week feedback need not contain a verb from the extraction
  // vocabulary. During clarification, an unscoped answer inherits the request's
  // existing targets instead of expanding them to other dates.
  const broad=effective.broad||!review.context&&latest.unscoped;
  const protectedSessions=review.days.flatMap(day=>day.sessions.flatMap((session,index)=>{
    // Mentioning a date (including reassurance) cannot revoke a previous keep.
    const kept=turns.reduce((prior,turn)=>turn.kept.some(s=>contains(s,day.date,index,session))||prior&&!turn.overrides.some(s=>contains(s,day.date,index,session)),false);
    return kept?[{date:day.date,index}]:[];
  }));
  const protectedDays=dates.filter(date=>turns.reduce((prior,turn)=>turn.kept.some(s=>s.date===date&&s.session===null)||prior&&!turn.overrides.some(s=>s.date===date),false));
  return {protectedDays,protectedSessions,changes:broad?null:effective.changed};
}
export function protectedDates(feedback:string,dates:string[]){return intent(feedback,dates).kept.filter(s=>s.session===null).map(s=>s.date)}

export function preservesReviewScope(review:Review,dates:string[],details:Detail[],outline:Outline){
  const scope=reviewScope(review,dates);
  for(const old of review.days){
    const next=details.find(d=>d.date===old.date)!,oldOutline=review.outline.days.find(d=>d.date===old.date)!,nextOutline=outline.days.find(d=>d.date===old.date)!;
    const unchanged=isDeepStrictEqual(old.sessions,next.sessions)&&isDeepStrictEqual(oldOutline,nextOutline);
    if(scope.protectedDays.includes(old.date)&&!unchanged)return false;
    if(scope.changes!==null&&!scope.changes.some(s=>s.date===old.date)&&!unchanged)return false;
    // Kept or out-of-scope sessions must survive exactly, in relative order.
    // Matching by content permits an authorized different session to be split.
    let after=-1;
    for(const [index,session] of old.sessions.entries()){
      const protectedSession=scope.protectedSessions.some(s=>s.date===old.date&&s.index===index);
      const outsideScope=scope.changes!==null&&!scope.changes.some(s=>contains(s,old.date,index,session));
      if(!protectedSession&&!outsideScope)continue;
      const found=next.sessions.findIndex((s,i)=>i>after&&isDeepStrictEqual(s,session)&&isDeepStrictEqual(nextOutline.sessions[i],oldOutline.sessions[index]));
      if(found<0)return false;after=found;
    }
  }
  return true;
}
