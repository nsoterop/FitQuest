import type {secureSessionStorage} from './secureSessionStorage';
import type {Journal,JournalCommand,JournalDocument,JournalSource} from '../../backend/src/journalContract';
export type JournalDraft={key:string;journal:Journal|null;document:JournalDocument|null;source:JournalSource|null;pending:JournalCommand|null;fields:Record<string,string>;dirty:boolean;savedAt:number};
// No expiry and no onboarding/sign-out cleanup. Every key is scoped to its verified account.
export function journalDrafts(storage:ReturnType<typeof secureSessionStorage>){let queue:Promise<unknown>=Promise.resolve();const run=<T>(fn:()=>Promise<T>)=>{const p=queue.then(fn);queue=p.catch(()=>{});return p};const index=(u:string)=>`journal-index.${u}`,key=(u:string,k:string)=>`journal.${u}.${k}`;
 const ids=async(u:string):Promise<string[]>=>{const v=await storage.getItem(index(u));if(!v)return [];const a=JSON.parse(v);if(!Array.isArray(a)||a.length>1000||a.some(x=>typeof x!=='string'||x.length>100))throw Error('Journal index unreadable');return a};
 async function read(u:string,k:string){const v=await storage.getItem(key(u,k));if(!v)return null;const d=JSON.parse(v);if(!d||d.key!==k||typeof d.dirty!=='boolean'||!d.fields||!Number.isFinite(d.savedAt))throw Error('Journal draft unreadable');return d as JournalDraft}
 return {list:(u:string)=>run(async()=>{const a=await ids(u),all=await Promise.all(a.map(k=>read(u,k)));return all.filter((d):d is JournalDraft=>!!d)}),read:(u:string,k:string)=>run(()=>read(u,k)),write:(u:string,d:JournalDraft)=>run(async()=>{const a=await ids(u);if(!a.includes(d.key)){if(a.length>=1000)throw Error('Journal draft capacity');await storage.setItem(index(u),JSON.stringify([...a,d.key]))}await storage.setItem(key(u,d.key),JSON.stringify(d))})};
}
