// Synthetic data only. Shared by real wire, persistence and rendered-mobile tests.
import type { WeeklyPlan,Exercise } from './completePlanContract.js';
export const syntheticAnswers=['Build general strength and walking endurance.','Two easy walks weekly.','Floor, stable raised support, dumbbells and outdoor route.','Three days; open to multiple sessions; 20–40 minutes each.','None'];
export function completeFixture(dates:string[]):WeeklyPlan{
 const walk:Exercise={activityId:'FQ-ACT-00148',target:{kind:'duration',seconds:{min:60,max:90}},perSide:false,load:null,loadInstruction:null,effort:{rpe:{min:2,max:3},rir:null,cue:null}};
 return {days:dates.map((date,i)=>({date,sessions:[2,6].includes(i)?[]:[{title:'Steady practice',goal:'Build a consistent activity base',timing:null,durationMinutes:{min:20,max:30},optional:i===5,blocks:[{phase:'main',optional:false,rounds:3,exercises:[structuredClone(walk)],recovery:{placement:'between_rounds',activity:null,restSeconds:{min:30,max:45},instruction:null}}]},...(i===0?[{title:'Easy later session',goal:'Comfortable recovery',timing:'Evening',durationMinutes:{min:10,max:15},optional:true,blocks:[{phase:'cooldown' as const,optional:true,rounds:1,exercises:[structuredClone(walk)],recovery:null}]}]:[])]})),catalogGaps:[]};
}

import { encodeCompleteWire } from './completePlanWire.js';
// Synthetic producer and independent canonical expectation used across persistence/UI.
export function unitWireFixture(dates:string[],shorter=false){
 const expected=completeFixture(dates);
 const first=expected.days[0]!.sessions[0]!.blocks[0]!;
 const later=expected.days[1]!.sessions[0]!;
 later.blocks[0]!.exercises[0]!.target={kind:'duration',seconds:{min:120,max:180}};
 later.blocks[0]!.recovery={placement:'between_rounds',activity:{...structuredClone(first.exercises[0]!),target:{kind:'duration',seconds:{min:30,max:60}}},restSeconds:null,instruction:null};
 if(shorter)later.durationMinutes={min:15,max:20};
 expected.days[0]!.sessions[1]!.blocks[0]!.exercises.push({activityId:'FQ-ACT-00184',target:{kind:'count',count:{min:5,max:8}},perSide:true,load:{value:4,unit:'kg'},loadInstruction:null,effort:{rpe:{min:6,max:7},rir:null,cue:null}});
 const wire=encodeCompleteWire({result:{kind:'plan',plan:expected}});if(wire.result.kind!=='plan')throw Error('Synthetic plan required');
 const rest=wire.result.days[0]!.sessions[0]!.blocks[0]!;rest.recoveryRestMin=.5;rest.recoveryRestMax=.75;rest.recoveryRestUnit='minutes';
 const active=wire.result.days[1]!.sessions[0]!.blocks[0]!;Object.assign(active.exercises[0]!,{targetMin:2,targetMax:3,durationUnit:'minutes'});Object.assign(active.recoveryActivity!,{targetMin:.5,targetMax:1,durationUnit:'minutes'});
 wire.result.days[0]!.sessions[1]!.blocks[0]!.exercises[1]!.targetKind='repetitions';
 return {wire,expected};
}

export function completeOutlineFixture(plan:WeeklyPlan):string{
 const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 return plan.days.map(d=>`${weekdays[new Date(d.date+'T12:00:00Z').getUTCDay()]} ${d.date}\n${d.sessions.length?d.sessions.map(s=>`- ${s.title}\n${s.optional?'  Optional\n':''}  Goal: ${s.goal}\n  Duration: ${s.durationMinutes.min}–${s.durationMinutes.max} minutes${s.timing?'\n  Timing: '+s.timing:''}`).join('\n'):'Rest day'}`).join('\n\n');
}
