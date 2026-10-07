import { Ajv } from 'ajv';
import { activity,catalog,selectionCatalog,trackingModes } from './activityCatalog.js';
import { intakeAnswers } from './fixedIntake.js';
import { OnboardingError } from './onboardingError.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import type { PlanningInput,Detail,Outline } from './planningDomain.js';
import { weeklyLimits } from './weeklyPlanning.js';
import { completePlanVersion,validCompletePlan,type WeeklyPlan,type PlanResponse,type Exercise } from './completePlanContract.js';
import { completeResponseSchema,decodeCompleteWire,encodeCompleteWire,type WireResponse } from './completePlanWire.js';
import { checkReviewProtections,reviewProtections } from './reviewProtection.js';
const validate=new Ajv({strict:true}).compile<WireResponse>(completeResponseSchema);
export function completePrompt(answers:string[],dates:string[]):string{
 return `I want you to come up with an exercise plan for me.

My goals are: ${answers[0]}.
My current activity is: ${answers[1]}.
My available equipment is: ${answers[2]}.
My training preferences are: ${answers[3]}.
My limitations are: ${answers[4]}.

Build a complete plan for Monday ${dates[0]} through Sunday ${dates[6]}
to help me achieve my goals. Plan the entire week, even if some
of those days have already passed.

First, create the high-level weekly outline: each day's session(s),
with each session's name, goal, timing and approximate duration.
Choose the training structure and session distribution that best
fit my goals, availability and limitations.

Next, create the workout for every session in that outline,
including exercises or activities with appropriate sets,
repetitions, time, distance, recovery and effort targets.
Preserve the outline's days and separate sessions when adding
the workouts.

Select exercises and activities only from the supplied catalog.
Reference each selected activity by its exact catalog ID and
respect its equipment, setup and tracking requirements. You
choose the programming; the catalog supplies the available
activities, not predetermined routines.

If the catalog cannot support part of the plan, identify the
specific gap rather than inventing an exercise or catalog ID.

Finally, format the complete plan using the provided response
schema. Formatting must preserve the sessions and prescriptions,
not merge, drop, move or rewrite them. Return only the final
complete week, including all session details.

Exercise catalog:
${JSON.stringify({encoding:'Rows align with columns. Numeric cells index strings; string and array cells are literal.',...selectionCatalog})}`;
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
 let prompt=completePrompt(answers,input.dates);
 if(input.completeReview){const old=protectionView(input.completeReview.plan),review={...old,feedback:input.completeReview.feedback,context:null};
  prompt+=`\n\nUpdate the same saved week according to this explicit feedback. Preserve unchanged and explicitly kept work, exact ranges, order and recovery. Do not infer completed workouts. If the requested change conflicts with kept work or cannot be supported, return unavailable with the specific reason; the saved plan will remain unchanged. The revised complete draft requires acceptance again.\nFeedback:\n${input.completeReview.feedback}\nSaved week:\n${JSON.stringify(encodeCompleteWire({result:{kind:'plan',plan:input.completeReview.plan}}))}\nProtected work (original positions, not extra prescriptions):\n${JSON.stringify(reviewProtections(review,input.dates))}`;
 }
 const body=JSON.stringify({model:provider.model,store:false,stream:false,truncation:'disabled',service_tier:'default',reasoning:{effort:'low'},max_output_tokens:weeklyLimits.outputTokens,input:prompt,text:{format:{type:'json_schema',name:'complete_week',strict:true,schema:completeResponseSchema}}});
 if(Buffer.byteLength(body)>weeklyLimits.inputBytes)throw new OnboardingError(422,'planning_context_limit');
 return {body,reserveMicro:provider.cost({input:Buffer.byteLength(body),output:weeklyLimits.outputTokens,cached:0,cacheWrite:0})};
}
function checkActivity(e:Exercise,input:PlanningInput){
 const a=activity(e.activityId),m=trackingModes(a),mode={repetitions:'repetitions',duration:'seconds',distance:'meters',count:'count'}[e.target.kind] as keyof typeof m;
 if(!m[mode])throw new OnboardingError(422,'catalog_coverage');
 const load=String(a['Load convention']).toLowerCase();
 if(e.load&&(!/(?:\blb\b|\bkg\b|mass.*unit|pack mass|ball mass|sled mass)/.test(load)||/band|no external|no added|water resistance/.test(load)))throw new OnboardingError(422,'invalid_plan:load');
 // Known explicit exclusions are enforceable; free-text feasibility remains model judgment.
 const equipment=intakeAnswers(input.summary)?.[2].toLowerCase()??'';
 const requirements=String(a['Equipment']).toLowerCase();
 if(/^(?:none|no equipment|bodyweight only|floor only)[.!]?$/i.test(equipment.trim())&&/dumbbell|barbell|kettlebell|band|machine|pool|bench/.test(requirements))throw new OnboardingError(422,'catalog_coverage');
 for(const item of ['dumbbells','barbell','bench','bands','kettlebell','pool','treadmill','machine','partner'])if(new RegExp(`\\b(?:no|without) ${item}\\b`).test(equipment)&&requirements.includes(item))throw new OnboardingError(422,'catalog_coverage');
}
export function checkComplete(raw:unknown,input:PlanningInput):PlanResponse{
 if(!validate(raw))throw new OnboardingError(422,'invalid_plan:week_schema');
 let result:PlanResponse;try{result=decodeCompleteWire(raw)}catch{throw new OnboardingError(422,'invalid_plan:week_schema')}
 if(result.result.kind==='unavailable')return result;
 const plan=result.result.plan;
 if(!validCompletePlan(plan,input.dates))throw new OnboardingError(422,'invalid_plan:week_schema');
 if(Buffer.byteLength(JSON.stringify(plan))>400000)throw new OnboardingError(422,'planning_context_limit');
 for(const d of plan.days)for(const s of d.sessions)for(const b of s.blocks){b.exercises.forEach(e=>checkActivity(e,input));if(b.recovery?.activity)checkActivity(b.recovery.activity,input);}
 if(input.completeReview){const old=protectionView(input.completeReview.plan),next=protectionView(plan);checkReviewProtections({...old,feedback:input.completeReview.feedback,context:null},input.dates,next.days,next.outline);}
 return result;
}
export function completeActivities(plan:WeeklyPlan){return Object.fromEntries([...new Set(plan.days.flatMap(d=>d.sessions.flatMap(s=>s.blocks.flatMap(b=>[...b.exercises,...(b.recovery?.activity?[b.recovery.activity]:[])].map(e=>e.activityId)))))].map(id=>{const a=activity(id);return [id,{name:String(a['Exercise name']),loadConvention:String(a['Load convention'])}]}));}
export { completePlanVersion,catalog };
