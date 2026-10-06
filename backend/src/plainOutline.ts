import { OnboardingError } from './onboardingError.js';
import { intakeAnswers } from './fixedIntake.js';
import type { Outline,PlanningInput } from './planningDomain.js';
import type { OnboardingProvider } from './onboardingProvider.js';

// This is the complete initial coaching prompt. No profile, schema, catalog or legacy instructions.
export function initialOutlinePrompt(answers:string[],dates:string[]) {
  const [goals,current,equipment,preferences,limitations]=answers;
  return `I want you to come up with an exercise plan for me. My goals are: ${goals}. My current activity is: ${current}. My available equipment is: ${equipment}. My training preferences are: ${preferences}. My limitations are: ${limitations}. I want you to build a plan to help me achieve my goals. Return a high level plan for ${dates[0]} through ${dates.at(-1)} inclusive, don't give exercises yet. Just return a list with days of the week up until Sunday, with each day's session(s) underneath it, the goal for each session and the rough time to complete the session.`;
}
export function preparePlainOutline(provider:OnboardingProvider,input:PlanningInput){
  const answers=intakeAnswers(input.summary);if(!answers)throw new OnboardingError(422,'invalid_intake');
  const body=JSON.stringify({model:provider.model,store:false,stream:false,truncation:'disabled',service_tier:'default',reasoning:{effort:'low'},max_output_tokens:2000,input:initialOutlinePrompt(answers,input.dates)});
  if(Buffer.byteLength(body)>48000)throw new OnboardingError(422,'planning_context_limit');
  return {body,reserveMicro:provider.cost({input:Buffer.byteLength(body),output:2000,cached:0,cacheWrite:0})};
}
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const clean=(line:string)=>line.trim().replace(/^#{1,6}\s*/,'').replace(/^[-*•]\s+|^\d+[.)]\s+/,'').replace(/\*\*|__/g,'').trim();
const fail=():never=>{throw new OnboardingError(422,'outline_conversion')};
export type PlainSession={sourceText:string;goal:string|null;durationText:string|null;durationRange:{min:number;max:number}|null;timingText:string|null;optional:boolean};
const hasDuration=(text:string)=>new RegExp(durationPattern.source,'i').test(text);
const durationPattern=/\b(\d+(?:\.\d+)?)\s*(?:[-–—]|to)?\s*(\d+(?:\.\d+)?)?\s*(minutes?|mins?|hours?|hrs?)\b/gi;
export function parsePlainOutline(text:string,dates:string[]):Outline {
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>64000)return fail();
  const days:Outline['days']=[];let day:Outline['days'][number]|undefined,block:string[]=[],blockIndent=0;
  function flush(){
    if(!block.length)return;
    if(!day)return fail();
    const sourceText=block.join('\n'),lines=block.map(clean),title=lines[0]!;
    const durations=[...lines.join(' ').matchAll(durationPattern)];
    // More than one duration is ambiguous (e.g. two sessions on a single bullet).
    if(durations.length!==1)return fail();
    const d=durations[0]!,factor=/^h/i.test(d[3]!)?60:1,min=Number(d[1])*factor,max=Number(d[2]??d[1])*factor;
    if(!Number.isFinite(max)||min<=0||max<min)return fail();
    const goalLine=lines.find(l=>/^(?:goal|purpose|focus)\s*:/i.test(l));
    const inlineGoal=/(?:^|[;|—–]\s*|\s+)(?:goal|purpose)\s*:\s*(.+)/i.exec(title)?.[1];
    const goal=goalLine?.replace(/^(?:goal|purpose|focus)\s*:\s*/i,'')??inlineGoal??null;
    const timeLine=lines.find(l=>/^(?:timing|time of day)\s*:/i.test(l));
    const timeLabel=timeLine?.replace(/^(?:timing|time of day)\s*:\s*/i,'')??/^(morning|midday|afternoon|evening|night|am|pm|\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i.exec(title)?.[1]??null;
    const timing=timeLabel&&/^(morning|midday|evening)$/i.test(timeLabel)?timeLabel.toLowerCase() as 'morning'|'midday'|'evening':null;
    day.sessions.push({focus:title,activityIds:[],timing,...(min===max?{estimatedMinutes:min}:{}),plain:{sourceText,goal,durationText:d[0],durationRange:{min,max},timingText:timeLabel,optional:/\boptional\b|\bif (?:desired|you feel|wanted)\b/i.test(lines.join(' '))}});
    block=[];
  }
  for(const raw of text.split(/\r?\n/)){
    if(!raw.trim())continue;
    const line=clean(raw);
    if(/^[-*_]{3,}$/.test(line))continue;
    const match=/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b(.*)$/i.exec(line);
    if(match){
      flush();const date=dates[days.length];if(!date||weekdays[new Date(date+'T12:00:00Z').getUTCDay()]!.toLowerCase()!==match[1]!.toLowerCase())return fail();
      const explicit=/\b\d{4}-\d{2}-\d{2}\b/.exec(match[2]!);if(explicit&&explicit[0]!==date)return fail();
      const namedDate=/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i.exec(match[2]!);
      if(namedDate){
        const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(namedDate[1]!.slice(0,3).toLowerCase())+1;
        if(month!==Number(date.slice(5,7))||Number(namedDate[2])!==Number(date.slice(8))||namedDate[3]&&namedDate[3]!==date.slice(0,4))return fail();
      }
      day={date,sessions:[],sourceHeading:line};days.push(day);
      let tail=match[2]!.replace(/^[\s:—–-]+/,'').trim();
      // A heading may carry the grounded date, or an inline rest/session entry.
      tail=tail.replace(/^\(?\d{4}-\d{2}-\d{2}\)?\s*[:—–-]?\s*/,'').replace(/^\(?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\)?\s*[:—–-]?\s*/i,'');
      if(tail){
        const rest=/^(?:rest|off|recovery day|no (?:training|sessions?))\b/i.test(tail);
        if(rest)day.restText=tail;
        if(hasDuration(tail)){block=[tail];blockIndent=0;}else if(!rest)return fail();
      }
      continue;
    }
    if(!day){if(/^#/.test(raw)||/^here(?:'s| is)\b|^(?:your |weekly |training |high.level )*plan\b/i.test(line))continue;return fail();}
    const field=/^(goal|purpose|focus|duration|rough time|time|timing|time of day)\s*:/i.test(line);
    const indent=raw.search(/\S/),bullet=/^\s*(?:[-*•]|\d+[.)])\s+/.test(raw);
    const newSession=!field&&(bullet&&(!block.length||indent<=blockIndent)||/^(?:morning|midday|afternoon|evening|night|session\s+\d+)\s*[:—–-]/i.test(line));
    if(!block.length&&/^(?:rest|off|recovery day|no (?:training|sessions?))\b/i.test(line)&&!hasDuration(line)){day.restText=[day.restText,line].filter(Boolean).join('\n');continue;}
    if(newSession){flush();blockIndent=indent;block=[raw];}
    else if(block.length)block.push(raw);
    else return fail();
  }
  flush();if(days.length!==dates.length||days.some(d=>!d.sessions.length&&!d.restText))return fail();
  return {sourceFormat:'plain-v1',originalResponse:text,days,coverage:[],clarification:null};
}

// Revisions keep the existing explicit, metered preservation contract. Only initial generation is plain text.
export const plainReviewSchema={type:'object',additionalProperties:false,required:['outlineText','scope','reply','question'],properties:{
  outlineText:{anyOf:[{type:'null'},{type:'string',minLength:1,maxLength:64000}]},
  scope:{anyOf:[{type:'null'},{type:'array',maxItems:7,items:{type:'object',additionalProperties:false,required:['date','changeSessions','evidence'],properties:{date:{type:'string'},changeSessions:{type:'array',items:{type:'integer',minimum:0}},evidence:{type:'string',minLength:3,maxLength:350}}}}]},
  reply:{type:'string',minLength:8,maxLength:600},question:{anyOf:[{type:'null'},{type:'string',minLength:8,maxLength:350}]},
}};
