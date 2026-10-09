// Shared display/entry contract. Numeric nutrients are per recorded base portion.
export const nutrients=['calories','protein','carbs','fat'] as const;
export type Nutrient=typeof nutrients[number];
export type FoodValue={value:number|null;source:'supplied'|'estimated'|'user_estimated'|'unknown'};
export type FoodItem={name:string;portion:string;quantity:number|null;unit:string|null;nutrients:Record<Nutrient,FoodValue>};
export type FoodDocument={name:string;meal:string;date:string;time:string|null;timeZone:string;servings:number;items:FoodItem[];assumptions:string[]};
export type FoodCandidate={intent:'consumed'|'planned'|'unclear';question:string|null;document:FoodDocument|null};
export type FoodEntry={id:string;revision:number;document:FoodDocument;createdAt:string;updatedAt:string;deletedAt:string|null;undoUntil:string|null};
export type FoodDay={date:string;revision:number;complete:boolean};
export type FoodState={entries:FoodEntry[];days:FoodDay[];dates:string[];today:string};
export type FoodCommand={operationId:string}&(
 {kind:'interpret';message:string;date:string;timeZone:string;previousOperation:string|null;entryId:string|null;expectedRevision:number|null}|
 {kind:'save';document:FoodDocument;entryId:string|null;expectedRevision:number|null;candidateOperation:string|null;confirmConsumed:true}|
 {kind:'delete'|'undo';entryId:string;expectedRevision:number}|
 {kind:'complete';date:string;timeZone:string;expectedRevision:number;complete:boolean});
export type FoodOperation={id:string;status:'pending'|'completed'|'failed';error:string|null;candidate:FoodCandidate|null;entryId:string|null};
export const foodId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function foodDate(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v&&v>='2000-01-01'}
export function foodToday(zone:string,now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function foodZone(v:unknown):v is string{try{return typeof v==='string'&&v.length<=80&&!!new Intl.DateTimeFormat('en',{timeZone:v}).format()}catch{return false}}
export function shiftFoodDate(date:string,delta:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
export function foodWeek(date:string){const start=shiftFoodDate(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));return Array.from({length:7},(_,i)=>shiftFoodDate(start,i))}
const text=(v:unknown,n:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const keys=(v:unknown,list:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===list.length&&Object.keys(v).every(k=>list.includes(k));
export function validFoodDocument(v:unknown):v is FoodDocument{
 if(!keys(v,['name','meal','date','time','timeZone','servings','items','assumptions']))return false;const d=v as FoodDocument;
 return text(d.name,160)&&text(d.meal,50)&&foodDate(d.date)&&foodZone(d.timeZone)&&(d.time===null||/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))&&Number.isFinite(d.servings)&&d.servings>0&&d.servings<=100&&Math.abs(Math.round(d.servings*1000)-d.servings*1000)<1e-7&&Array.isArray(d.items)&&d.items.length>0&&d.items.length<=12&&d.items.every(i=>keys(i,['name','portion','quantity','unit','nutrients'])&&text(i.name,160)&&text(i.portion,250)&&(i.quantity===null||Number.isFinite(i.quantity)&&i.quantity>0&&i.quantity<=100000)&&(i.unit===null||text(i.unit,50))&&((i.quantity===null)===(i.unit===null))&&keys(i.nutrients,[...nutrients])&&nutrients.every(n=>{const x=i.nutrients[n];return keys(x,['value','source'])&&(x.value===null?x.source==='unknown':Number.isFinite(x.value)&&x.value>=0&&x.value<=(n==='calories'?100000:10000)&&['supplied','estimated','user_estimated'].includes(x.source)&&Math.abs(x.value*1000-Math.round(x.value*1000))<1e-7)}))&&Array.isArray(d.assumptions)&&d.assumptions.length<=8&&d.assumptions.every(a=>text(a,500));
}
export function validFoodCandidate(v:unknown):v is FoodCandidate{if(!keys(v,['intent','question','document']))return false;const c=v as FoodCandidate;return ['consumed','planned','unclear'].includes(c.intent)&&(c.question===null||text(c.question,600))&&(c.document===null||validFoodDocument(c.document))&&(c.document!==null||c.question!==null)}
// Integer thousandths and thousandth servings avoid floating-point accumulation. Round only the final display value.
export function foodTotal(docs:FoodDocument[],n:Nutrient){let micro=0n,unknown=0,estimated=false;for(const d of docs)for(const i of d.items){const v=i.nutrients[n];if(v.value===null)unknown++;else{micro+=BigInt(Math.round(v.value*1000))*BigInt(Math.round(d.servings*1000));estimated ||=v.source==='estimated'||v.source==='user_estimated'}}return {value:Number(micro)/1e6,unknown,estimated,hasEntries:docs.length>0}}
export function foodAverage(state:FoodState,n:Nutrient){const totals=state.dates.filter(d=>d<=state.today&&state.days.some(x=>x.date===d&&x.complete)).map(d=>foodTotal(state.entries.filter(e=>!e.deletedAt&&e.document.date===d).map(e=>e.document),n)).filter(x=>x.hasEntries&&!x.unknown);return {value:totals.length?totals.reduce((a,x)=>a+x.value,0)/totals.length:null,days:totals.length,estimated:totals.some(x=>x.estimated)}}
