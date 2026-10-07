// Synthetic data only. Shared by real wire, persistence and rendered-mobile tests.
import type { WeeklyPlan,Exercise } from './completePlanContract.js';
export const syntheticAnswers=['Build general strength and walking endurance.','Two easy walks weekly.','Floor, stable raised support, dumbbells and outdoor route.','Three days; open to multiple sessions; 20–40 minutes each.','None'];
export function completeFixture(dates:string[]):WeeklyPlan{
 const walk:Exercise={activityId:'FQ-ACT-00148',target:{kind:'duration',seconds:{min:60,max:90}},perSide:false,load:null,loadInstruction:null,effort:{rpe:{min:2,max:3},rir:null,cue:null}};
 return {days:dates.map((date,i)=>({date,sessions:[2,6].includes(i)?[]:[{title:'Steady practice',goal:'Build a consistent activity base',timing:null,durationMinutes:{min:20,max:30},optional:i===5,blocks:[{phase:'main',optional:false,rounds:3,exercises:[structuredClone(walk)],recovery:{placement:'between_rounds',activity:null,restSeconds:{min:30,max:45},instruction:null}}]},...(i===0?[{title:'Easy later session',goal:'Comfortable recovery',timing:'Evening',durationMinutes:{min:10,max:15},optional:true,blocks:[{phase:'cooldown' as const,optional:true,rounds:1,exercises:[structuredClone(walk)],recovery:null}]}]:[])]})),catalogGaps:[]};
}
