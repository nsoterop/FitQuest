// Synthetic data only; usable by local tests and metered evaluations.
import type { TrainingSummary } from './trainingSummary.js';
import type { Outline,Detail,Prescription } from './planningDomain.js';
export const trainingFixture:TrainingSummary=[
  {category:'goals',goals:['Comfortable walking','General strength'],text:'General strength and comfortable walking; walking comes first.',origin:'user_report'},
  {category:'availability',text:'Three flexible 25-minute days weekly; tomorrow is available.',origin:'user_report'},
  {category:'equipment',text:'Clear floor, stable wall and safe level walking path. No gym or partner.',origin:'user_report'},
  {category:'experience',text:'Walks 20 minutes twice a week; beginner at strength exercises.',origin:'user_report'},
  {category:'limitations',text:'No restrictions reported; this is not medical clearance.',origin:'unknown'},
];
export function fixtureOutline(dates:string[]):Outline {return {days:dates.map((date,i)=>({date,sessions:i===0||i===3?[{focus:'Mobility',activityIds:['FQ-ACT-00112']},{focus:'Endurance',activityIds:['FQ-ACT-00148']}]:i===5?[{focus:'Strength',activityIds:['FQ-ACT-00003']}]:[]})),coverage:[]}}
export function fixturePrescription(id:string,measure:Prescription['measure']='seconds'):Prescription{return{id,phase:'main',sets:1,measure,amount:measure==='seconds'?120:8,effort:'easy',restSeconds:30,load:'none',loadKg:null,side:'both'}}
export function fixtureDetail(outline:Outline,date:string):Detail{return {date,coverage:[],sessions:outline.days.find(d=>d.date===date)!.sessions.map(s=>({activities:s.activityIds.map(id=>fixturePrescription(id,id==='FQ-ACT-00003'?'repetitions':'seconds'))}))}}
