import type { ErrorObject } from 'ajv';
import { OnboardingError } from './onboardingError.js';

export const diagnosticRules={
 schema:['shape'],conversion:['pair','unit','recovery','decode'],structure:['overview','block','exercise','recovery','empty_plan'],
 catalog:['lookup','tracking','equipment','load'],integrity:['kept_work','size','validation'],
} as const;
export type DiagnosticStage=keyof typeof diagnosticRules;
export type DiagnosticPosition={day?:number;session?:number;block?:number;exercise?:number;recovery?:true};
export const targetKinds=['repetitions','duration','distance','count'] as const;
export type TargetKind=typeof targetKinds[number];
export type ValidationDiagnostic=DiagnosticPosition&{version:1;stage:DiagnosticStage;rule:string;activityId?:string;actualKind?:TargetKind|'invalid';allowedKinds?:TargetKind[]};
// Reconstruct from a closed vocabulary on both capture and persistence. Never copy
// validator errors/params, arbitrary paths, object keys, messages or model values.
export function safeValidationDiagnostic(value:unknown):ValidationDiagnostic|undefined{
 if(!value||typeof value!=='object')return;
 const v=value as ValidationDiagnostic;
 if(!Object.hasOwn(diagnosticRules,v.stage)||!(diagnosticRules[v.stage] as readonly string[]).includes(v.rule))return;
 const out:ValidationDiagnostic={version:1,stage:v.stage,rule:v.rule};
 for(const [key,max] of [['day',6],['session',11],['block',23],['exercise',23]] as const){const n=v[key];if(Number.isInteger(n)&&n!>=0&&n!<=max)out[key]=n;}
 if(v.recovery===true){out.recovery=true;delete out.exercise;}
 if(typeof v.activityId==='string'&&/^FQ-ACT-\d{5}$/.test(v.activityId))out.activityId=v.activityId;
 if(targetKinds.includes(v.actualKind as TargetKind)||v.actualKind==='invalid')out.actualKind=v.actualKind;
 if(Array.isArray(v.allowedKinds))out.allowedKinds=targetKinds.filter(k=>v.allowedKinds!.includes(k));
 return out;
}
export class CompleteValidationError extends OnboardingError{
 readonly diagnostic:ValidationDiagnostic;
 constructor(code:string,diagnostic:Omit<ValidationDiagnostic,'version'>){super(422,code);this.diagnostic=safeValidationDiagnostic({...diagnostic,version:1})!;}
}
export function invalidComplete(code:string,stage:DiagnosticStage,rule:string,position:DiagnosticPosition={},activity?:{activityId?:unknown;target?:{kind?:unknown}},allowedKinds?:TargetKind[]):never{
 throw new CompleteValidationError(code,{stage,rule,...position,...(activity?{activityId:activity.activityId as string,actualKind:targetKinds.includes(activity.target?.kind as TargetKind)?activity.target!.kind as TargetKind:'invalid'}:{}),...(allowedKinds?{allowedKinds}:{})});
}
export function schemaPosition(errors:ErrorObject[]|null|undefined):DiagnosticPosition{
 let best:DiagnosticPosition={};
 for(const error of errors??[]){
  // Only the known numeric structural prefix is interpreted; suffixes are discarded.
  const m=/^\/result\/days\/(\d+)(?:\/sessions\/(\d+)(?:\/blocks\/(\d+)(?:(?:\/exercises\/(\d+))|(\/recoveryActivity))?)?)?(?:\/|$)/.exec(error.instancePath);
  if(!m)continue;
  const p:DiagnosticPosition={};for(const [i,key] of ['day','session','block','exercise'].entries())if(m[i+1]!==undefined)p[key as keyof Omit<DiagnosticPosition,'recovery'>]=Number(m[i+1]);if(m[5])p.recovery=true;
  if(Object.keys(p).length>Object.keys(best).length)best=p;
 }
 const {version,stage,rule,...position}=safeValidationDiagnostic({stage:'schema',rule:'shape',...best})!;return position;
}
