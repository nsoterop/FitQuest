import {planDates} from './trainingSummary.js';
import {shiftDate} from './progressContext.js';
function localStamp(zone:string,date:Date){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${String(date.getUTCMilliseconds()).padStart(3,'0')}`}
// Only the latest eligible trigger is considered. Earlier missed weeks are never purchased.
export function scheduledDates(zone:string,enabledAt:string,now=new Date()):string[]|null{
 const week=planDates(zone,now),stamp=localStamp(zone,now),sunday=week[6]!;
 const dates=stamp>=sunday+'T21:00:00.000'?week.map(d=>shiftDate(d,7)):week;
 const trigger=shiftDate(dates[0]!,-1)+'T21:00:00.000';
 return localStamp(zone,new Date(enabledAt))<=trigger&&stamp>=trigger?dates:null;
}
