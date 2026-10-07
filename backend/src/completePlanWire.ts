import type { Exercise,PlanResponse,Range,Target,WeeklyPlan } from './completePlanContract.js';
// Wire-only flattening keeps the deepest active-recovery target below the
// provider's ten-container limit. One explicit lossless mapping owns both directions.
const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const arr=(items:unknown,maxItems:number,minItems=0)=>({type:'array',items,minItems,maxItems});
const num=(minimum:number,maximum:number)=>({type:'number',minimum,maximum});
const integer=(minimum:number,maximum:number)=>({type:'integer',minimum,maximum});
const str=(maxLength=600)=>({type:'string',minLength:1,maxLength});
const en=(...values:string[])=>({type:'string',enum:values});
const nil=(schema:unknown)=>({anyOf:[{type:'null'},schema]});
const bool={type:'boolean'};
const range=obj({min:num(1,1440),max:num(1,1440)});
const exerciseSchema={description:'Each target is per round, and perSide means this target on each side. Equal min/max is exact. Non-distance targets use distanceUnit null. Load value/unit are both null when unspecified; numeric loads follow the catalog convention. RPE is 1–10, RIR is only for repetitions. Absent effort pairs and cue are null.',...obj({activityId:{type:'string',pattern:'^FQ-ACT-\\d{5}$'},targetKind:en('repetitions','duration','distance','count'),targetMin:num(0.001,200000),targetMax:num(0.001,200000),distanceUnit:nil(en('mi','km','m','yd')),perSide:bool,loadValue:nil(num(0.001,1102)),loadUnit:nil(en('lb','kg')),loadInstruction:nil(str()),rpeMin:nil(num(1,10)),rpeMax:nil(num(1,10)),rirMin:nil(integer(0,10)),rirMax:nil(integer(0,10)),effortCue:nil(str())})};
const exercise={$ref:'#/$defs/exercise'};
const block={description:'An ordered set, interval or circuit. Recovery occurs between rounds (rounds minus one events) or after each round. Choose active recoveryActivity OR passive rest min/max OR instruction-only recovery, never both activity and rest. Instruction may qualify recovery but cannot prescribe an uncataloged activity. No recovery means all recovery fields null. Rest day has no sessions.',...obj({phase:en('warmup','main','cooldown'),optional:bool,rounds:integer(1,100),exercises:arr(exercise,24,1),recoveryPlacement:nil(en('between_rounds','after_each_round')),recoveryActivity:nil(exercise),recoveryRestMin:nil(num(1,3600)),recoveryRestMax:nil(num(1,3600)),recoveryInstruction:nil(str())})};
export const completeResponseSchema={...obj({result:{anyOf:[obj({kind:en('plan'),days:arr(obj({date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},sessions:arr(obj({title:str(160),goal:str(),timing:nil(str()),durationMinutes:range,optional:bool,blocks:arr(block,24,1)}),12)}),7,7),catalogGaps:arr(obj({goal:str(),reason:str()}),24)}),obj({kind:en('unavailable'),reason:str()})]}}),$defs:{exercise:exerciseSchema}};
type WireExercise={activityId:string;targetKind:Target['kind'];targetMin:number;targetMax:number;distanceUnit:'mi'|'km'|'m'|'yd'|null;perSide:boolean;loadValue:number|null;loadUnit:'lb'|'kg'|null;loadInstruction:string|null;rpeMin:number|null;rpeMax:number|null;rirMin:number|null;rirMax:number|null;effortCue:string|null};
type WireBlock={phase:'warmup'|'main'|'cooldown';optional:boolean;rounds:number;exercises:WireExercise[];recoveryPlacement:'between_rounds'|'after_each_round'|null;recoveryActivity:WireExercise|null;recoveryRestMin:number|null;recoveryRestMax:number|null;recoveryInstruction:string|null};
export type WireResponse={result:{kind:'unavailable';reason:string}|{kind:'plan';days:{date:string;sessions:(Omit<WeeklyPlan['days'][number]['sessions'][number],'blocks'>&{blocks:WireBlock[]})[]}[];catalogGaps:WeeklyPlan['catalogGaps']}};
function pair(min:number|null,max:number|null):Range|null {if((min===null)!==(max===null))throw Error('wire_pair');return min===null?null:{min,max:max!};}
function decodeExercise(e:WireExercise):Exercise{
 const r={min:e.targetMin,max:e.targetMax};if((e.targetKind==='distance')!==(e.distanceUnit!==null)||(e.loadValue===null)!==(e.loadUnit===null))throw Error('wire_unit');
 const target:Target=e.targetKind==='repetitions'?{kind:e.targetKind,reps:r}:e.targetKind==='duration'?{kind:e.targetKind,seconds:r}:e.targetKind==='count'?{kind:e.targetKind,count:r}:{kind:e.targetKind,distance:r,unit:e.distanceUnit!};
 const rpe=pair(e.rpeMin,e.rpeMax),rir=pair(e.rirMin,e.rirMax);
 return {activityId:e.activityId,target,perSide:e.perSide,load:e.loadValue===null?null:{value:e.loadValue,unit:e.loadUnit!},loadInstruction:e.loadInstruction,effort:rpe===null&&rir===null&&e.effortCue===null?null:{rpe,rir,cue:e.effortCue}};
}
export function decodeCompleteWire(w:WireResponse):PlanResponse{
 if(w.result.kind==='unavailable')return {result:w.result};
 return {result:{kind:'plan',plan:{catalogGaps:w.result.catalogGaps,days:w.result.days.map(d=>({...d,sessions:d.sessions.map(s=>({...s,blocks:s.blocks.map(b=>{
  const restSeconds=pair(b.recoveryRestMin,b.recoveryRestMax);
  if(b.recoveryPlacement===null&&(b.recoveryActivity!==null||restSeconds!==null||b.recoveryInstruction!==null))throw Error('wire_recovery');
  return {phase:b.phase,optional:b.optional,rounds:b.rounds,exercises:b.exercises.map(decodeExercise),recovery:b.recoveryPlacement===null?null:{placement:b.recoveryPlacement,activity:b.recoveryActivity===null?null:decodeExercise(b.recoveryActivity),restSeconds,instruction:b.recoveryInstruction}};
 })}))}))}}};
}
function encodeExercise(e:Exercise):WireExercise{const t=e.target,r=t.kind==='repetitions'?t.reps:t.kind==='duration'?t.seconds:t.kind==='distance'?t.distance:t.count;return {activityId:e.activityId,targetKind:t.kind,targetMin:r.min,targetMax:r.max,distanceUnit:t.kind==='distance'?t.unit:null,perSide:e.perSide,loadValue:e.load?.value??null,loadUnit:e.load?.unit??null,loadInstruction:e.loadInstruction,rpeMin:e.effort?.rpe?.min??null,rpeMax:e.effort?.rpe?.max??null,rirMin:e.effort?.rir?.min??null,rirMax:e.effort?.rir?.max??null,effortCue:e.effort?.cue??null};}
export function encodeCompleteWire(p:PlanResponse):WireResponse{if(p.result.kind==='unavailable')return {result:p.result};return {result:{kind:'plan',catalogGaps:p.result.plan.catalogGaps,days:p.result.plan.days.map(d=>({...d,sessions:d.sessions.map(s=>({...s,blocks:s.blocks.map(b=>({phase:b.phase,optional:b.optional,rounds:b.rounds,exercises:b.exercises.map(encodeExercise),recoveryPlacement:b.recovery?.placement??null,recoveryActivity:b.recovery?.activity?encodeExercise(b.recovery.activity):null,recoveryRestMin:b.recovery?.restSeconds?.min??null,recoveryRestMax:b.recovery?.restSeconds?.max??null,recoveryInstruction:b.recovery?.instruction??null}))}))}))}};}
