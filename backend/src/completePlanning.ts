import { CompleteValidationError,invalidComplete,schemaPosition,type DiagnosticPosition } from './planDiagnostics.js';
import { Ajv } from 'ajv';
import { activity,catalog,completeSelectionCatalog,trackingModes,repetitionCountAlias,supportedTargetKinds } from './activityCatalog.js';
import { initialOutlinePrompt,parsePlainOutline } from './plainOutline.js';
import { planOverview } from './completePlanContract.js';
import { intakeAnswers } from './fixedIntake.js';
import { OnboardingError } from './onboardingError.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import type { PlanningInput,Detail,Outline } from './planningDomain.js';
import { weeklyLimits } from './weeklyPlanning.js';
import { completePlanVersion,validCompletePlan,validOverview,validExercise,type WeeklyPlan,type PlanResponse,type Exercise } from './completePlanContract.js';
import { completeResponseSchema,completeWireName,decodeCompleteWire,encodeCompleteWire,type WireResponse } from './completePlanWire.js';
import { checkReviewProtections,reviewProtections } from './reviewProtection.js';
const validate=new Ajv({strict:true}).compile<WireResponse>(completeResponseSchema);
export function prepareCompleteOutline(provider:OnboardingProvider,input:PlanningInput){
 const answers=intakeAnswers(input.summary);if(!answers)throw new OnboardingError(409,'summary_needs_correction');
 let prompt=initialOutlinePrompt(answers,input.dates);
 if(input.completeReview)prompt+=`\n\nRevise this same high-level week according to my feedback. Preserve the arrangement and work I ask to keep. Return the revised days and sessions, goals and rough durations only, without exercises.\nFeedback:\n${input.completeReview.feedback}\nSaved high-level week:\n${JSON.stringify(planOverview(input.completeReview.plan))}`;
 const body=JSON.stringify({model:provider.model,store:false,stream:false,truncation:'disabled',service_tier:'default',reasoning:{effort:'low'},max_output_tokens:2000,input:prompt});
 if(Buffer.byteLength(body)>48000)throw new OnboardingError(422,'planning_context_limit');
 return {body,reserveMicro:provider.cost({input:Buffer.byteLength(body),output:2000,cached:0,cacheWrite:0})};
}
export function completeOutline(text:string,dates:string[]){
 const outline=parsePlainOutline(text,dates);
 // Bounded reuse of the existing list adapter; no model extraction or invented sessions.
 const days=outline.days.map(d=>({date:d.date,sessions:d.sessions.map(s=>({title:s.focus,goal:s.plain!.goal,timing:s.plain!.timingText,durationMinutes:s.plain!.durationRange!,optional:s.plain!.optional}))}));
 if(days.some(d=>d.sessions.length>12||d.sessions.some(s=>s.title.length>160||s.goal!==null&&s.goal.length>600||s.timing!==null&&s.timing.length>600||s.durationMinutes.min<1||s.durationMinutes.max>1440)))throw new OnboardingError(422,'outline_conversion');
 return days;
}
export function completePrompt(answers:string[],dates:string[],outlineText:string):string{
 return `Create exercises/workouts for every day and session in the exact high-level plan below, and format the complete week with the provided response schema. Do not replan, merge, drop, move or reorder sessions. Preserve goals, timing, optionality, duration ranges and rest days. Copy the supplied session metadata exactly; where a goal is null, use the original response to describe that session's purpose. Select only exact eligible catalog IDs and respect equipment, setup and tracking requirements. Include appropriate sets, repetitions, time, distance, recovery and effort targets. If catalog work cannot support the outline, return unavailable with the specific reason instead of silently changing the schedule.

My goals are: ${answers[0]}.
My current activity is: ${answers[1]}.
My available equipment is: ${answers[2]}.
My training preferences are: ${answers[3]}.
My limitations are: ${answers[4]}.

Saved dates: ${dates.join(', ')}
Exact high-level response:
${outlineText}

Session metadata to preserve (from that response):
${JSON.stringify(completeOutline(outlineText,dates))}

Exercise catalog:
${JSON.stringify({encoding:'Rows align with columns. Numeric cells index strings; string and array cells are literal.',...completeSelectionCatalog})}`;
}
// Recognition adapter only: no conversion to old prescriptions for storage or display.
// Block/recovery context remains attached to every row so a keep protects its dose.
function protectionView(plan:WeeklyPlan){
 const days=plan.days.map(d=>({date:d.date,sessions:d.sessions.map(s=>({...s,activities:s.blocks.flatMap(b=>[...b.exercises,...(b.recovery?.activity?[b.recovery.activity]:[])].map(e=>({...e,id:e.activityId,block:{phase:b.phase,optional:b.optional,rounds:b.rounds,recovery:b.recovery}})))})),coverage:[],clarification:null})) as unknown as Detail[];
 const outline={days:plan.days.map(d=>({date:d.date,sessions:d.sessions.map(s=>({...s,focus:s.title,activityIds:[]}))})),coverage:[],clarification:null} as unknown as Outline;
 return {days,outline};
}
export function prepareComplete(provider:OnboardingProvider,input:PlanningInput){
 const answers=intakeAnswers(input.summary);if(!answers)throw new OnboardingError(409,'summary_needs_correction');
 if(!input.completeOutlineText)throw new OnboardingError(409,'outline_required');
 let prompt=completePrompt(answers,input.dates,input.completeOutlineText);
 if(input.completeReview){const old=protectionView(input.completeReview.plan),review={...old,feedback:input.completeReview.feedback,context:null};
  prompt+=`\n\nUpdate the same saved week according to this explicit feedback. Preserve unchanged and explicitly kept work, exact ranges, order and recovery. Do not infer completed workouts. If the requested change conflicts with kept work or cannot be supported, return unavailable with the specific reason; the saved plan will remain unchanged. The revised complete draft requires acceptance again.\nFeedback:\n${input.completeReview.feedback}\nSaved week:\n${JSON.stringify(encodeCompleteWire({result:{kind:'plan',plan:input.completeReview.plan}}))}\nProtected work (original positions, not extra prescriptions):\n${JSON.stringify(reviewProtections(review,input.dates))}`;
 }
 const body=JSON.stringify({model:provider.model,store:false,stream:false,truncation:'disabled',service_tier:'default',reasoning:{effort:'low'},max_output_tokens:weeklyLimits.outputTokens,input:prompt,text:{format:{type:'json_schema',name:completeWireName,strict:true,schema:completeResponseSchema}}});
 if(Buffer.byteLength(body)>weeklyLimits.inputBytes)throw new OnboardingError(422,'planning_context_limit');
 return {body,reserveMicro:provider.cost({input:Buffer.byteLength(body),output:weeklyLimits.outputTokens,cached:0,cacheWrite:0})};
}
function checkActivity(e:Exercise,input:PlanningInput,position:DiagnosticPosition){
 let a;try{a=activity(e.activityId)}catch{invalidComplete('catalog_coverage','catalog','lookup',position,e)}
 const m=trackingModes(a),mode={repetitions:'repetitions',duration:'seconds',distance:'meters',count:'count'}[e.target.kind] as keyof typeof m;
 if(!m[mode])invalidComplete('catalog_coverage','catalog','tracking',position,e,supportedTargetKinds(a));
 const load=String(a['Load convention']).toLowerCase();
 if(e.load&&(!/(?:\blb\b|\bkg\b|mass.*unit|pack mass|ball mass|sled mass)/.test(load)||/band|no external|no added|water resistance/.test(load)))invalidComplete('invalid_plan:load','catalog','load',position,e);
 // Known explicit exclusions are enforceable; free-text feasibility remains model judgment.
 const equipment=intakeAnswers(input.summary)?.[2].toLowerCase()??'';
 const requirements=String(a['Equipment']).toLowerCase();
 if(/^(?:none|no equipment|bodyweight only|floor only)[.!]?$/i.test(equipment.trim())&&/dumbbell|barbell|kettlebell|band|machine|pool|bench/.test(requirements))invalidComplete('catalog_coverage','catalog','equipment',position,e);
 for(const item of ['dumbbells','barbell','bench','bands','kettlebell','pool','treadmill','machine','partner'])if(new RegExp(`\\b(?:no|without) ${item}\\b`).test(equipment)&&requirements.includes(item))invalidComplete('catalog_coverage','catalog','equipment',position,e);
}
function diagnoseStructure(plan:WeeklyPlan,dates:string[]):never{
 const base:WeeklyPlan={days:dates.map(date=>({date,sessions:[]})),catalogGaps:[{goal:'diagnostic',reason:'diagnostic'}]};
 if(!Boolean(validOverview(plan,dates))){
  for(const [day,d] of plan.days.entries()){
   if(d.date!==dates[day])invalidComplete('invalid_plan:week_schema','structure','overview',{day});
   for(const [session,s] of d.sessions.entries()){const probe=structuredClone(base);probe.days[day]!.sessions=[s];if(!validOverview(probe,dates))invalidComplete('invalid_plan:week_schema','structure','overview',{day,session});}
  }
  invalidComplete('invalid_plan:week_schema','structure','overview');
 }
 for(const [day,d] of plan.days.entries())for(const [session,s] of d.sessions.entries())for(const [block,b] of s.blocks.entries()){
  for(const [exercise,e] of b.exercises.entries())if(!validExercise(e))invalidComplete('invalid_plan:week_schema','structure','exercise',{day,session,block,exercise},e);
  if(b.recovery?.activity&&!validExercise(b.recovery.activity))invalidComplete('invalid_plan:week_schema','structure','exercise',{day,session,block,recovery:true},b.recovery.activity);
  const probe=structuredClone(base);probe.days[day]!.sessions=[{...s,blocks:[b]}];
  if(!Boolean(validCompletePlan(probe,dates))){const withoutRecovery=structuredClone(probe);withoutRecovery.days[day]!.sessions[0]!.blocks[0]!.recovery=null;
   invalidComplete('invalid_plan:week_schema','structure',validCompletePlan(withoutRecovery,dates)?'recovery':'block',{day,session,block,...(validCompletePlan(withoutRecovery,dates)?{recovery:true as const}:{})});}
 }
 invalidComplete('invalid_plan:week_schema','structure','empty_plan');
}
export function checkComplete(raw:unknown,input:PlanningInput):PlanResponse{
 if(!validate(raw)){
  const position=schemaPosition(validate.errors),candidate=raw as WireResponse;
  const b=candidate?.result?.kind==='plan'&&position.day!==undefined&&position.session!==undefined&&position.block!==undefined?candidate.result.days?.[position.day]?.sessions?.[position.session]?.blocks?.[position.block]:undefined;
  const e=b?(position.recovery?b.recoveryActivity:position.exercise!==undefined?b.exercises?.[position.exercise]:undefined):undefined;
  invalidComplete('invalid_plan:week_schema','schema','shape',position,e?{activityId:e.activityId,target:{kind:e.targetKind}}:undefined);
 }
 let result:PlanResponse;try{result=decodeCompleteWire(raw)}catch(error){if(error instanceof CompleteValidationError)throw error;invalidComplete('invalid_plan:week_schema','conversion','decode')}
 if(result.result.kind==='unavailable')return result;
 const plan=result.result.plan;
 // Fresh decoded output only. Saved canonical records are never rewritten or rescaled.
 for(const d of plan.days)for(const s of d.sessions)for(const b of s.blocks)for(const e of [...b.exercises,...(b.recovery?.activity?[b.recovery.activity]:[])]){
  let a;try{a=activity(e.activityId)}catch{continue;}
  if(e.target.kind==='repetitions'&&repetitionCountAlias(a))e.target={kind:'count',count:{...e.target.reps}};
 }
 if(!validCompletePlan(plan,input.dates))diagnoseStructure(plan,input.dates);
 if(Buffer.byteLength(JSON.stringify(plan))>400000)invalidComplete('planning_context_limit','integrity','size');
 plan.days.forEach((d,day)=>d.sessions.forEach((s,session)=>s.blocks.forEach((b,block)=>{b.exercises.forEach((e,exercise)=>checkActivity(e,input,{day,session,block,exercise}));if(b.recovery?.activity)checkActivity(b.recovery.activity,input,{day,session,block,recovery:true});})));
 if(input.completeOutlineText){
  const expected=completeOutline(input.completeOutlineText,input.dates);
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  expected.forEach((d,day)=>{
   if(d.sessions.length!==plan.days[day]!.sessions.length)throw new OnboardingError(422,'outlined_schedule_changed');
   d.sessions.forEach((s,session)=>{const actual=plan.days[day]!.sessions[session]!;
    if(s.title!==actual.title||s.goal!==null&&s.goal!==actual.goal||s.timing!==actual.timing||s.optional!==actual.optional||!same(s.durationMinutes,actual.durationMinutes))throw new OnboardingError(422,'outlined_schedule_changed');
   });
  });
 }
 if(input.completeReview){const old=protectionView(input.completeReview.plan),next=protectionView(plan);checkReviewProtections({...old,feedback:input.completeReview.feedback,context:null},input.dates,next.days,next.outline);}
 return result;
}
export function completeActivities(plan:WeeklyPlan){return Object.fromEntries([...new Set(plan.days.flatMap(d=>d.sessions.flatMap(s=>s.blocks.flatMap(b=>[...b.exercises,...(b.recovery?.activity?[b.recovery.activity]:[])].map(e=>e.activityId)))))].map(id=>{const a=activity(id);return [id,{name:String(a['Exercise name']),loadConvention:String(a['Load convention'])}]}));}
export { completePlanVersion,catalog };
