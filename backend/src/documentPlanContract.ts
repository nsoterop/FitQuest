// Versioned display contracts. Legacy prose is never parsed into exercise records.
export const legacyDocumentPlanVersion='document-week-v1' as const;
export const documentPlanVersion='document-week-v2' as const;
export type DocumentVersion=typeof legacyDocumentPlanVersion|typeof documentPlanVersion;
export const isDocumentVersion=(v:unknown):v is DocumentVersion=>v===documentPlanVersion||v===legacyDocumentPlanVersion;
export type DocumentSession={title:string;goal:string;timing:string|null;durationMinutes:{min:number;max:number};optional:boolean;workoutMarkdown:string};
export type DocumentPlan={days:{date:string;sessions:DocumentSession[]}[]};
export type SessionOverview=Omit<DocumentSession,'workoutMarkdown'>;
export type ExerciseRow={exercise:string;prescription:string};
export type RowDocumentPlan={days:{date:string;sessions:(SessionOverview&{exercises:ExerciseRow[]})[]}[]};
export type SavedDocumentPlan=DocumentPlan|RowDocumentPlan;
export type DocumentOverview={days:{date:string;sessions:SessionOverview[]}[]};
const keys=(v:unknown,names:string[]):boolean=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(n=>Object.hasOwn(v,n));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
function validSessionOverview(s:SessionOverview){
 const r=s?.durationMinutes;
 return text(s.title,160)&&text(s.goal,600)&&(s.timing===null||text(s.timing,600))&&typeof s.optional==='boolean'&&keys(r,['min','max'])&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min>=1&&r.max<=1440&&r.min<=r.max;
}
export function documentOverview(plan:SavedDocumentPlan):DocumentOverview{return {days:plan.days.map(d=>({date:d.date,sessions:d.sessions.map(s=>({title:s.title,goal:s.goal,timing:s.timing,durationMinutes:{...s.durationMinutes},optional:s.optional}))}))};}
export function validDocument(v:unknown,dates:string[],details=true):v is DocumentPlan{
 const p=v as DocumentPlan;
 return keys(p,['days'])&&Array.isArray(p.days)&&p.days.length===7&&dates.length===7&&p.days.every((d,i)=>keys(d,['date','sessions'])&&d.date===dates[i]&&Array.isArray(d.sessions)&&d.sessions.length<=12&&d.sessions.every(s=>{
  return keys(s,['title','goal','timing','durationMinutes','optional',...(details?['workoutMarkdown']:[])])&&validSessionOverview(s)&&(!details||text(s.workoutMarkdown,12000));
 }));
}
export function validDocumentOverview(v:unknown,dates:string[]):v is DocumentOverview{return validDocument(v,dates,false);}

export function validSavedDocument(v:unknown,dates:string[],version:unknown):v is SavedDocumentPlan{
 if(version===legacyDocumentPlanVersion)return validDocument(v,dates);
 if(version!==documentPlanVersion)return false;
 const p=v as RowDocumentPlan;
 if(!keys(p,['days'])||!Array.isArray(p.days)||p.days.length!==7||dates.length!==7)return false;
 return p.days.every((d,i)=>keys(d,['date','sessions'])&&d.date===dates[i]&&Array.isArray(d.sessions)&&d.sessions.length<=12&&d.sessions.every(s=>{
  if(!keys(s,['title','goal','timing','durationMinutes','optional','exercises'])||!Array.isArray(s.exercises)||!s.exercises.length||s.exercises.length>64)return false;
  const {exercises,...overview}=s;
  return validSessionOverview(overview)&&exercises.every(r=>keys(r,['exercise','prescription'])&&text(r.exercise,160)&&text(r.prescription,1800))&&exercises.reduce((n,r)=>n+r.exercise.length+r.prescription.length,0)<=12000;
 }));
}
