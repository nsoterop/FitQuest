// Shared display contract. Workout prose is never converted into exercise records.
export const documentPlanVersion='document-week-v1' as const;
export type DocumentSession={title:string;goal:string;timing:string|null;durationMinutes:{min:number;max:number};optional:boolean;workoutMarkdown:string};
export type DocumentPlan={days:{date:string;sessions:DocumentSession[]}[]};
export type DocumentOverview={days:{date:string;sessions:Omit<DocumentSession,'workoutMarkdown'>[]}[]};
const keys=(v:unknown,names:string[]):boolean=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(n=>Object.hasOwn(v,n));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export function documentOverview(plan:DocumentPlan):DocumentOverview{return {days:plan.days.map(d=>({date:d.date,sessions:d.sessions.map(s=>({title:s.title,goal:s.goal,timing:s.timing,durationMinutes:{...s.durationMinutes},optional:s.optional}))}))};}
export function validDocument(v:unknown,dates:string[],details=true):v is DocumentPlan{
 const p=v as DocumentPlan;
 return keys(p,['days'])&&Array.isArray(p.days)&&p.days.length===7&&dates.length===7&&p.days.every((d,i)=>keys(d,['date','sessions'])&&d.date===dates[i]&&Array.isArray(d.sessions)&&d.sessions.length<=12&&d.sessions.every(s=>{
  const r=s?.durationMinutes;
  return keys(s,['title','goal','timing','durationMinutes','optional',...(details?['workoutMarkdown']:[])])&&text(s.title,160)&&text(s.goal,600)&&(s.timing===null||text(s.timing,600))&&typeof s.optional==='boolean'&&keys(r,['min','max'])&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min>=1&&r.max<=1440&&r.min<=r.max&&(!details||text(s.workoutMarkdown,12000));
 }));
}
export function validDocumentOverview(v:unknown,dates:string[]):v is DocumentOverview{return validDocument(v,dates,false);}
