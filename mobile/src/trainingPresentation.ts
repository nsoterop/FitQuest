import type { TrainingDay } from './trainingApi';
type Session=TrainingDay['detail']['sessions'][number];
type Prescription=Session['activities'][number];
const factors={m:1,km:1000,mi:1609.344,yd:.9144};
export function validSessionMeaning(s:Session):boolean {
  if(s.estimatedMinutes!==undefined&&(!Number.isInteger(s.estimatedMinutes)||s.estimatedMinutes<1||s.estimatedMinutes>240))return false;
  if(s.timing!==undefined&&s.timing!==null&&!['morning','midday','evening','flexible'].includes(s.timing))return false;
  if(s.intervals!==undefined&&(!Array.isArray(s.intervals)||s.intervals.length>7))return false;
  for(const a of s.activities){
    if(a.repRange!=null&&(a.measure!=='repetitions'||!Number.isInteger(a.repRange.min)||!Number.isInteger(a.repRange.max)||a.repRange.min<1||a.repRange.max>100||a.repRange.min>=a.repRange.max||a.amount!==a.repRange.min))return false;
    if(a.rir!=null&&(a.measure!=='repetitions'||a.phase==='cooldown'||!Number.isInteger(a.rir)||a.rir<0||a.rir>5))return false;
    if(a.distanceTarget!=null){const t=a.distanceTarget;if(!Number.isFinite(t.value)||t.value<=0||!Object.hasOwn(factors,t.unit)||a.measure!=='meters'||Math.abs(a.amount-t.value*factors[t.unit])>1e-6)return false}
  }
  const used=new Set<number>();
  for(const p of s.intervals??[]){
    if(!p||!Number.isInteger(p.workIndex)||!Number.isInteger(p.recoveryIndex)||p.recoveryIndex!==p.workIndex+1||!['between','after_each'].includes(p.recoveries)||used.has(p.workIndex)||used.has(p.recoveryIndex))return false;
    const w=s.activities[p.workIndex],r=s.activities[p.recoveryIndex];
    if(!w||!r||w.sets<2||r.sets!==w.sets-(p.recoveries==='between'?1:0)||w.phase!==r.phase||w.restSeconds!==0||r.restSeconds!==0||r.effort!=='easy')return false;
    used.add(p.workIndex);used.add(p.recoveryIndex);
  }
  return true;
}
export function quantity(a:Prescription){
  let amount:string;
  if(a.repRange)return `${a.repRange.min}–${a.repRange.max}${a.side==='each'?' per side':''}`;
  if(a.measure==='meters'){
    const t=a.distanceTarget;
    // A legacy meter quantity has no selected display target. Preserve it exactly.
    amount=t?`${t.value} ${t.unit==='mi'?(t.value===1?'mile':'miles'):t.unit}`:`${a.amount} m`;
  }else if(a.measure==='seconds')amount=`${a.amount%60===0?a.amount/60:a.amount} ${a.amount%60===0?'min':'sec'}`;
  else amount=`${a.amount}${a.measure==='count'?' counts':''}`;
  return `${amount}${a.side==='each'?' per side':''}`;
}
export function sessionRows(s:Session,names:TrainingDay['detail']['activities']):{phase:string;text:string}[]{
  const rows:{phase:string;text:string}[]=[];
  for(let i=0;i<s.activities.length;i++){
    const a=s.activities[i]!,pair=s.intervals?.find(p=>p.workIndex===i);
    if(pair){
      const recovery=s.activities[pair.recoveryIndex]!;
      rows.push({phase:a.phase,text:`${a.sets} rounds: ${names[a.id]!.name} — ${quantity(a)} (${a.effort}) → ${names[recovery.id]!.name} — ${quantity(recovery)} easy recovery (${recovery.sets} recoveries${pair.recoveries==='between'?'; none after last round':'; after every round'})`});
      i=pair.recoveryIndex;
    }else rows.push({phase:a.phase,text:`${names[a.id]!.name} — ${a.sets>1||a.measure==='repetitions'?`${a.sets} × `:''}${quantity(a)}${a.rir!=null?` · ${a.rir} RIR`:['easy','moderate','challenging'].includes(a.effort)?` (${a.effort})`:''}${a.sets>1&&a.restSeconds>0?`; ${a.restSeconds} sec rest between sets`:''}`});
  }
  return rows;
}
