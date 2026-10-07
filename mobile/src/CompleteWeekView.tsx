import React from 'react';
import { View,Text,StyleSheet } from 'react-native';
import { recoveryCount,type Exercise,type Range } from '../../backend/src/completePlanContract';
import type { TrainingPlan } from './trainingApi';
const calendarDate=(date:string)=>new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export const rangeText=(r:Range)=>r.min===r.max?`${r.min}`:`${r.min}–${r.max}`;
export function exerciseText(e:Exercise,names:NonNullable<TrainingPlan['activityNames']>){
 const t=e.target,target=t.kind==='repetitions'?`${rangeText(t.reps)} reps`:t.kind==='duration'?`${rangeText(t.seconds)} sec`:t.kind==='distance'?`${rangeText(t.distance)} ${t.unit}`:`${rangeText(t.count)} count`;
 const convention=names[e.activityId]?.loadConvention??'';
 const loadScope=/per dumbbell/i.test(convention)?' per dumbbell':/per stack|working stack/i.test(convention)?' per stack':/assistance/i.test(convention)?' assistance':/total|bar and plates/i.test(convention)?' total':/per side/i.test(convention)?' per side':'';
 return [names[e.activityId]?.name??e.activityId,target,e.perSide?'each side':null,e.load?`${e.load.value} ${e.load.unit}${loadScope}`:null,e.loadInstruction,e.effort?.rpe?`RPE ${rangeText(e.effort.rpe)}`:null,e.effort?.rir?`${rangeText(e.effort.rir)} RIR`:null,e.effort?.cue].filter(Boolean).join(' · ');
}
export function CompleteWeekView({plan,dates}:{plan:TrainingPlan;dates:string[]}){
 const o=plan.overview;if(!o)return null;
 return <View style={styles.group}>
  {o.catalogGaps.map((g,i)=><Text key={i} style={styles.copy}>{g.goal}: {g.reason}</Text>)}
  {!dates.length&&<Text style={styles.copy}>No remaining days in this saved week. The full week is still saved.</Text>}
  {o.days.filter(d=>dates.includes(d.date)).map(d=><View key={d.date} accessibilityLabel={`Training day ${d.date}`} style={styles.group}>
   <Text accessibilityRole="header" style={styles.title}>{calendarDate(d.date)}</Text>
   {!d.sessions.length&&<Text style={styles.copy}>Rest — no planned session.</Text>}
   {d.sessions.map((s,i)=><View key={i} accessibilityLabel={`Session ${i+1} on ${d.date}`} style={styles.session}>
    <Text style={styles.title}>{s.title}</Text>
    {s.optional&&<Text style={styles.small}>Optional session</Text>}
    <Text style={styles.copy}>{s.goal}</Text>
    {!!s.timing&&<Text style={styles.small}>{s.timing}</Text>}
    <Text style={styles.copy}>About {rangeText(s.durationMinutes)} min</Text>
    {plan.reviewState==='accepted'&&plan.completePlan?.days.find(day=>day.date===d.date)?.sessions[i]?.blocks.map((b,j)=><View key={j} style={styles.group}>
      <Text style={styles.small}>{b.phase==='warmup'?'Warm-up':b.phase==='cooldown'?'Cool-down':'Main'}{b.optional?' · Optional':''} · {b.rounds} {b.exercises.length===1?'sets':'rounds'} · targets per round</Text>
      {b.exercises.map((e,k)=><Text key={k} style={styles.copy}>{exerciseText(e,plan.activityNames??{})}</Text>)}
      {b.recovery&&<Text style={styles.copy}>{b.recovery.placement==='between_rounds'?'Between rounds':'After each round'} ({recoveryCount(b)} {recoveryCount(b)===1?'recovery':'recoveries'}): {[
        b.recovery.activity?exerciseText(b.recovery.activity,plan.activityNames??{}):null,
        b.recovery.restSeconds?`Rest ${rangeText(b.recovery.restSeconds)} sec`:null,
        b.recovery.instruction,
      ].filter(Boolean).join(' · ')}</Text>}
    </View>)}
   </View>)}
  </View>)}
 </View>;
}
const styles=StyleSheet.create({group:{gap:10,paddingVertical:8},session:{gap:6,padding:12,borderRadius:12,backgroundColor:'#EDF2ED'},title:{fontSize:16,color:'#193B34',fontWeight:'600'},copy:{fontSize:16,lineHeight:23,color:'#52655E'},small:{fontSize:13,lineHeight:19,color:'#52655E'}});
