import type {Pool} from 'pg';
import type {OnboardingProvider} from './onboardingProvider.js';
import {planningStore} from './planningStore.js';
import {planningService} from './planning.js';
// Runs inside the existing always-on service. No public trigger or privileged credential.
export function weeklyScheduler(pool:Pool,provider:OnboardingProvider|undefined,onError:()=>void,clock=()=>new Date()){
 const service=planningService(planningStore(pool,true,clock),provider);let stopped=false,running:Promise<void>|null=null;
 async function scan(){let cursor:string|null=null;do{const rows:{user_id:string}[]=(await pool.query('SELECT user_id FROM fitquest.weekly_schedule_accounts($1)',[cursor])).rows;if(!rows.length)break;for(const row of rows){if(stopped)return;cursor=row.user_id;try{await service.scheduled({userId:row.user_id,sessionId:'00000000-0000-4000-8000-000000000000'})}catch{onError()}}if(rows.length<100)break;}while(!stopped)}
 const tick=()=>{if(stopped)return Promise.resolve();if(running)return running;running=scan().catch(onError).finally(()=>{running=null});return running};
 const timer=setInterval(()=>void tick(),60000);timer.unref();void tick();
 return {tick,stop:async()=>{stopped=true;clearInterval(timer);await running}};
}
