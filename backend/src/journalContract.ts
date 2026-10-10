import {foodDate,foodId,foodToday} from './foodContract.ts';
export const loggingModes=['weighted_reps','reps','completion'] as const;
export type LoggingMode=typeof loggingModes[number];
export type JournalSource={planId:string;revision:number;date:string;sessionIndex:number};
export type SetGroup={id:string;weight:number|null;sets:number|null;reps:number|null;unit:'lb'|'kg';removed:boolean};
export type JournalResult={id:string;name:string;mode:LoggingMode;groups:SetGroup[];completed:boolean|null;removed:boolean};
export type JournalDocument={version:1;title:string;performedDate:string;timeZone:string;outcome:'in_progress'|'completed'|'partial'|'skipped';results:JournalResult[];notes:string};
export type JournalSnapshot={source:JournalSource|null;schemaVersion:string|null;acceptedAt:string|null;timeZone:string|null;session:unknown;fingerprint:string;exercises:{id:string;position:number;name:string;prescription:string;mode:LoggingMode}[];workoutMarkdown:string|null};
export type Journal={id:string;revision:number;createdAt:string;updatedAt:string;snapshot:JournalSnapshot;document:JournalDocument};
export type JournalList={items:{id:string;revision:number;title:string;performedDate:string;outcome:JournalDocument['outcome'];updatedAt:string}[];nextOffset:number|null};
export type JournalCommand={operationId:string;kind:'begin';source:JournalSource|null;repeat:boolean;title:string;performedDate:string;timeZone:string}|{operationId:string;kind:'save';journalId:string;expectedRevision:number;document:JournalDocument};
export type JournalReceipt={id:string;journalId:string;revision:number};
export const journalKeys=(v:unknown,names:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const text=(v:unknown,max:number,empty=false):v is string=>typeof v==='string'&&v.length<=max&&(empty||!!v.trim());
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000000;
const numeric=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1000000;
export function journalZone(v:unknown):v is string{try{return typeof v==='string'&&v.length<=80&&!!new Intl.DateTimeFormat('en-US',{timeZone:v}).format()}catch{return false}}
export function validJournalSource(v:unknown):v is JournalSource{const s=v as JournalSource;return journalKeys(s,['planId','revision','date','sessionIndex'])&&foodId(s.planId)&&integer(s.revision)&&s.revision>0&&foodDate(s.date)&&integer(s.sessionIndex)&&s.sessionIndex<12;}
export function validJournalDocument(v:unknown):v is JournalDocument{
 const d=v as JournalDocument;if(!journalKeys(d,['version','title','performedDate','timeZone','outcome','results','notes'])||d.version!==1||!text(d.title,160)||!foodDate(d.performedDate)||!journalZone(d.timeZone)||!['in_progress','completed','partial','skipped'].includes(d.outcome)||!text(d.notes,4000,true)||!Array.isArray(d.results)||d.results.length>96)return false;
 return new Set(d.results.map(r=>r?.id)).size===d.results.length&&d.results.every(r=>journalKeys(r,['id','name','mode','groups','completed','removed'])&&foodId(r.id)&&text(r.name,160)&&loggingModes.includes(r.mode)&&typeof r.removed==='boolean'&&(r.completed===null||typeof r.completed==='boolean')&&Array.isArray(r.groups)&&r.groups.length>=1&&r.groups.length<=24&&new Set(r.groups.map(g=>g?.id)).size===r.groups.length&&r.groups.every(g=>journalKeys(g,['id','weight','sets','reps','unit','removed'])&&foodId(g.id)&&numeric(g.weight)&&(g.sets===null||integer(g.sets))&&(g.reps===null||integer(g.reps))&&['lb','kg'].includes(g.unit)&&typeof g.removed==='boolean'));
}
export function validJournalCommand(v:unknown):v is JournalCommand{const c=v as JournalCommand;if(!c||!foodId(c.operationId))return false;if(c.kind==='begin')return journalKeys(c,['operationId','kind','source','repeat','title','performedDate','timeZone'])&&(c.source===null||validJournalSource(c.source))&&typeof c.repeat==='boolean'&&text(c.title,160,true)&&foodDate(c.performedDate)&&journalZone(c.timeZone);return c.kind==='save'&&journalKeys(c,['operationId','kind','journalId','expectedRevision','document'])&&foodId(c.journalId)&&integer(c.expectedRevision)&&c.expectedRevision>0&&validJournalDocument(c.document)}
export function validJournal(v:unknown):v is Journal{const j=v as Journal;return !!j&&foodId(j.id)&&integer(j.revision)&&j.revision>0&&validJournalDocument(j.document)&&!!j.snapshot&&Array.isArray(j.snapshot.exercises)&&j.snapshot.exercises.every(e=>foodId(e.id)&&text(e.name,160)&&text(e.prescription,1800)&&loggingModes.includes(e.mode))&&typeof j.snapshot.fingerprint==='string'&&(j.snapshot.source===null||validJournalSource(j.snapshot.source))&&(j.snapshot.workoutMarkdown===null||text(j.snapshot.workoutMarkdown,12000))&&Number.isFinite(Date.parse(j.updatedAt));}
export const journalToday=foodToday;
export const resultLogged=(r:JournalResult)=>!r.removed&&(r.mode==='completion'?r.completed!==null:r.groups.some(g=>!g.removed&&(g.sets!==null||g.reps!==null||(r.mode==='weighted_reps'&&g.weight!==null))));
