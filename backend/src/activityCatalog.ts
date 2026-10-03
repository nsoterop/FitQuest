import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OnboardingError } from './onboardingError.js';

export type Activity=Record<string,string|string[]>;
export const catalog=JSON.parse(readFileSync(new URL('../catalog/fitquest-v1.json',import.meta.url),'utf8')) as {
  version:string;sourceSha256:string;review:string;excluded:string[];activities:Activity[];
};
const blocked=new Set(['FQ-ACT-00161','FQ-ACT-00176','FQ-ACT-00188','FQ-ACT-00206']);
export const eligibleActivities=catalog.activities.filter(a=>a['Review status']==='AI consistency reviewed'&&!blocked.has(String(a['Activity ID'])));
const byId=new Map(eligibleActivities.map(a=>[String(a['Activity ID']),a]));
if(catalog.activities.length!==255||byId.size!==251||new Set(catalog.activities.map(a=>a['Activity ID'])).size!==255)throw Error('Invalid catalog export');
for(const a of eligibleActivities)for(const field of ['Easier alternative IDs','Harder alternative IDs']) {
  if(!(a[field] as string[]).every(id=>byId.has(id)))throw Error('Invalid catalog alternative');
}
export const catalogDigest=createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
export function activity(id:string):Activity {
  const a=byId.get(id);if(!a)throw new OnboardingError(422,'catalog_coverage');return a;
}
// Complete discovery index, not a goal-to-type ranking. Full constraints are checked in
// each day request before prescribing any selected activity.
export const catalogIndex=eligibleActivities.map(a=>[a['Activity ID'],a['Exercise name'],a['Training qualities'],a['Equipment']]);
export function trackingModes(a:Activity) {
  const tracking=String(a['Tracking measures']).toLowerCase();
  return {repetitions:/repetition|knee drives/.test(tracking),seconds:/time|duration|hold|cycles/.test(tracking),
    meters:/distance/.test(tracking),count:/steps|passes|throws|catches|shots|serves|contacts|jumps|turns|reaches|cues|routes|attempt|swings|touches|taps|completions/.test(tracking)};
}
