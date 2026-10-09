import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {Pool,PoolClient} from 'pg';
import type {Account} from './auth.js';
import {OnboardingError} from './onboardingError.js';
import {foodId,foodToday,nutrients} from './foodContract.js';
import {validLibraryCommand,libraryFromEntry,libraryFood,type LibraryCommand,type LibraryState,type LibraryItem,type LibraryReceipt} from './foodContract.js';
const fail=(code:string,status=409):never=>{throw new OnboardingError(status,code)};
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as any)[k])).join(',')+'}':JSON.stringify(v);
const receipt=(r:any):LibraryReceipt=>({id:r.id,libraryId:r.library_id,entryId:r.entry_id});
export function foodLibraryStore(pool:Pool){
 async function tx<T>(a:Account,fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fitquest.user_id',$1,true)",[a.userId]);if(!(await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active',[a.sessionId,a.userId])).rows[0]?.active)fail('session_ended',401);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.userId]);const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
 return {
 read:(a:Account):Promise<LibraryState>=>tx(a,async c=>({items:(await c.query('SELECT id,revision,document FROM fitquest.food_library WHERE user_id=$1 ORDER BY updated_at DESC,id',[a.userId])).rows})),
 readOperation:(a:Account,id:string)=>{if(!foodId(id))fail('invalid_request',400);return tx(a,async c=>{const r=(await c.query('SELECT * FROM fitquest.food_library_operations WHERE user_id=$1 AND id=$2',[a.userId,id])).rows[0];if(!r)fail('food_operation_missing',404);return receipt(r)})},
 command:(a:Account,command:LibraryCommand)=>{if(!validLibraryCommand(command))fail('invalid_request',400);const cmd=command,digest=createHash('sha256').update(canonical(cmd)).digest('hex');return tx(a,async c=>{
  const old=(await c.query('SELECT * FROM fitquest.food_library_operations WHERE user_id=$1 AND id=$2',[a.userId,cmd.operationId])).rows[0];if(old){if(old.digest!==digest)fail('operation_conflict');return receipt(old)}
  let libraryId:string,entryId:string|null=null;
  const item:LibraryItem|undefined=cmd.kind!=='saveEntry'&&cmd.libraryId?(await c.query('SELECT id,revision,document FROM fitquest.food_library WHERE user_id=$1 AND id=$2',[a.userId,cmd.libraryId])).rows[0]:undefined;
  if(cmd.kind!=='saveEntry'&&cmd.libraryId&&(!item||item.revision!==cmd.expectedRevision))fail('library_changed');
  if(cmd.kind==='log'){
   if(cmd.date>foodToday(cmd.timeZone))fail('future_food',422);libraryId=item!.id;entryId=randomUUID();const document=libraryFood(item!,cmd.servings,cmd.date,cmd.time,cmd.timeZone);
   await c.query('INSERT INTO fitquest.food_entries(user_id,id,revision,consumed_date,document) VALUES($1,$2,1,$3,$4)',[a.userId,entryId,cmd.date,document]);
   await c.query('INSERT INTO fitquest.food_days(user_id,date,revision,complete) VALUES($1,$2,1,false) ON CONFLICT(user_id,date) DO UPDATE SET revision=food_days.revision+1,complete=false',[a.userId,cmd.date]);
  }else{
   let document;
   if(cmd.kind==='saveEntry'){
    const entry=(await c.query('SELECT document,revision,deleted_at FROM fitquest.food_entries WHERE user_id=$1 AND id=$2',[a.userId,cmd.entryId])).rows[0];if(!entry||entry.deleted_at||entry.revision!==cmd.expectedRevision)fail('food_changed');document=libraryFromEntry(entry.document);
   }else{
    document=cmd.document;
    for(const ingredient of document.ingredients)for(const n of nutrients)if(ingredient.item.nutrients[n].source==='estimated'&&!item?.document.ingredients.some(i=>i.item.name===ingredient.item.name&&i.item.portion===ingredient.item.portion&&i.item.quantity===ingredient.item.quantity&&i.item.unit===ingredient.item.unit&&isDeepStrictEqual(i.item.nutrients[n],ingredient.item.nutrients[n])))fail('food_source_changed',422);
   }
   if(!item&&(await c.query('SELECT count(*)::int AS count FROM fitquest.food_library WHERE user_id=$1',[a.userId])).rows[0].count>=200)fail('library_full',422);
   libraryId=item?.id??randomUUID();await c.query('INSERT INTO fitquest.food_library(user_id,id,revision,document) VALUES($1,$2,1,$3) ON CONFLICT(user_id,id) DO UPDATE SET revision=food_library.revision+1,document=$3,updated_at=now()',[a.userId,libraryId,document]);
  }
  const r=(await c.query('INSERT INTO fitquest.food_library_operations(user_id,id,digest,library_id,entry_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[a.userId,cmd.operationId,digest,libraryId,entryId])).rows[0];return receipt(r);
 })}
 };
}
export type FoodLibraryStore=ReturnType<typeof foodLibraryStore>;
