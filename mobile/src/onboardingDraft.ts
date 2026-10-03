import type { secureSessionStorage } from './secureSessionStorage';
import type { OnboardingCommand } from './onboardingApi';
export type OnboardingDraft={conversationId:string|null;text:string;pending:OnboardingCommand|null;savedAt:number};
export function onboardingDrafts(storage:ReturnType<typeof secureSessionStorage>) {
  const key=(userId:string)=>`onboarding.${userId}`;
  const valid=(x:unknown):x is OnboardingDraft=>{
    if(!x||typeof x!=='object')return false;const d=x as OnboardingDraft;
    return (d.conversationId===null||typeof d.conversationId==='string')&&typeof d.text==='string'&&d.text.length<=4000&&Number.isFinite(d.savedAt)&&
      (d.pending===null||typeof d.pending==='object'&&typeof d.pending.operationId==='string'&&Number.isInteger(d.pending.expectedRevision)&&['message','retry','edit','skip','confirm'].includes(d.pending.kind))&&JSON.stringify(d).length<=10000;
  };
  return {
    async read(userId:string):Promise<OnboardingDraft|null>{
      const raw=await storage.getItem(key(userId));if(!raw)return null;
      try{const value:unknown=JSON.parse(raw);if(valid(value)&&Date.now()-value.savedAt<86400000&&value.savedAt<=Date.now())return value}catch{}
      await storage.removeItem(key(userId));return null;
    },
    async write(userId:string,draft:OnboardingDraft){if(!valid(draft))throw new Error('Draft exceeds limits.');await storage.setItem(key(userId),JSON.stringify(draft))},
    clear:(userId:string)=>storage.removeItem(key(userId)),
  };
}
export type OnboardingDraftStore=ReturnType<typeof onboardingDrafts>;
