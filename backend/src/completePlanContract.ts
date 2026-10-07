// Pure shared contract: backend persistence and mobile consume this same object.
export const completePlanVersion='complete-week-v1' as const;
export type Range={min:number;max:number};
export type Target={kind:'repetitions';reps:Range}|{kind:'duration';seconds:Range}|{kind:'distance';distance:Range;unit:'mi'|'km'|'m'|'yd'}|{kind:'count';count:Range};
export type Exercise={activityId:string;target:Target;perSide:boolean;load:{value:number;unit:'lb'|'kg'}|null;loadInstruction:string|null;effort:{rpe:Range|null;rir:Range|null;cue:string|null}|null};
export type WorkoutBlock={phase:'warmup'|'main'|'cooldown';optional:boolean;rounds:number;exercises:Exercise[];recovery:{placement:'between_rounds'|'after_each_round';activity:Exercise|null;restSeconds:Range|null;instruction:string|null}|null};
export type CompleteSession={title:string;goal:string;timing:string|null;durationMinutes:Range;optional:boolean;blocks:WorkoutBlock[]};
export type WeeklyPlan={days:{date:string;sessions:CompleteSession[]}[];catalogGaps:{goal:string;reason:string}[]};
export type PlanResponse={result:{kind:'plan';plan:WeeklyPlan}|{kind:'unavailable';reason:string}};
export type PlanOverview={days:{date:string;sessions:Omit<CompleteSession,'blocks'>[]}[];catalogGaps:WeeklyPlan['catalogGaps']};
export function planOverview(plan:WeeklyPlan):PlanOverview{return {days:plan.days.map(d=>({date:d.date,sessions:d.sessions.map(({blocks,...s})=>s)})),catalogGaps:plan.catalogGaps};}
export const targetRange=(t:Target):Range=>t.kind==='repetitions'?t.reps:t.kind==='duration'?t.seconds:t.kind==='distance'?t.distance:t.count;
export const distanceMeters=(value:number,unit:'mi'|'km'|'m'|'yd')=>value*({mi:1609.344,km:1000,m:1,yd:0.9144}[unit]);
export const recoveryCount=(b:WorkoutBlock)=>b.recovery?(b.recovery.placement==='between_rounds'?b.rounds-1:b.rounds):0;
const text=(v:unknown,max=600):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const nullableText=(v:unknown)=>v===null||text(v);
export function validRange(v:unknown,min:number,max:number,integer=false):v is Range{const r=v as Range;return !!r&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min>=min&&r.max<=max&&r.min<=r.max&&(!integer||Number.isInteger(r.min)&&Number.isInteger(r.max));}
export function validExercise(v:unknown):v is Exercise{
 const e=v as Exercise;if(!e||!/^FQ-ACT-\d{5}$/.test(e.activityId)||typeof e.perSide!=='boolean'||!nullableText(e.loadInstruction))return false;
 const t=e.target;if(!t||!(t.kind==='repetitions'?validRange(t.reps,1,100,true):t.kind==='count'?validRange(t.count,1,10000,true):t.kind==='duration'?validRange(t.seconds,1,86400):t.kind==='distance'?['mi','km','m','yd'].includes(t.unit)&&validRange(t.distance,0.001,200000)&&distanceMeters(t.distance.max,t.unit)<=200000:false))return false;
 if(e.load!==null&&(!e.load||!Number.isFinite(e.load.value)||e.load.value<=0||!['lb','kg'].includes(e.load.unit)||e.load.value*(e.load.unit==='lb'?0.45359237:1)>500))return false;
 if(e.effort!==null){const f=e.effort;if(!f||!nullableText(f.cue)||f.rpe!==null&&!validRange(f.rpe,1,10)||f.rir!==null&&(!validRange(f.rir,0,10,true)||t.kind!=='repetitions')||f.rpe===null&&f.rir===null&&f.cue===null)return false;}
 return true;
}
export function validOverview(v:unknown,dates:string[]):v is PlanOverview{
 const p=v as PlanOverview;return !!p&&Array.isArray(p.days)&&p.days.length===7&&p.days.length===dates.length&&p.days.every((d,i)=>d.date===dates[i]&&Array.isArray(d.sessions)&&d.sessions.length<=12&&d.sessions.every(s=>text(s.title,160)&&text(s.goal)&&nullableText(s.timing)&&typeof s.optional==='boolean'&&validRange(s.durationMinutes,1,1440)))&&Array.isArray(p.catalogGaps)&&p.catalogGaps.length<=24&&p.catalogGaps.every(g=>text(g.goal)&&text(g.reason));
}
export function validCompletePlan(v:unknown,dates:string[]):v is WeeklyPlan{
 if(!validOverview(v,dates))return false;const p=v as WeeklyPlan;
 return p.days.every(d=>d.sessions.every(s=>Array.isArray(s.blocks)&&s.blocks.length>=1&&s.blocks.length<=24&&s.blocks.every(b=>{
  if(!['warmup','main','cooldown'].includes(b.phase)||typeof b.optional!=='boolean'||!Number.isInteger(b.rounds)||b.rounds<1||b.rounds>100||!Array.isArray(b.exercises)||b.exercises.length<1||b.exercises.length>24||!b.exercises.every(validExercise))return false;
  const r=b.recovery;if(r===null)return true;
  if(!r||!['between_rounds','after_each_round'].includes(r.placement)||r.placement==='between_rounds'&&b.rounds===1||!nullableText(r.instruction))return false;
  if(r.activity!==null&&!validExercise(r.activity)||r.restSeconds!==null&&!validRange(r.restSeconds,1,3600))return false;
  // One recovery event: active OR passive OR an instruction. Instruction may qualify either.
  return !(r.activity!==null&&r.restSeconds!==null)&&(r.activity!==null||r.restSeconds!==null||r.instruction!==null);
 })))&& (p.days.some(d=>d.sessions.length)||p.catalogGaps.length>0);
}
