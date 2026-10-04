import { useConversationScroll } from './ConversationScrollView';
import { sessionRows } from './trainingPresentation';
import type { RecoveryRequest } from './onboardingApi';
import { privateDrafts } from './onboardingDraftStorage';
import { useEffect,useRef,useState } from 'react';
import { Pressable,StyleSheet,Text,TextInput,View } from 'react-native';
import { needsClarification,weekComplete,TrainingError,trainingError,trainingRequest,type TrainingState,type TrainingPlan,type TrainingFact,type TrainingDay } from './trainingApi';

const coverageText:Record<string,string>={missing_catalog_coverage:'The catalog does not cover the requested work.',equipment_or_facility_unknown:'Equipment or facility access needs clarification.',skill_partner_or_supervision_unknown:'Skill, partner or supervision requirements need clarification.',limitations_need_clarification:'Relevant limitations need clarification.',summary_needs_correction:'Update the training summary before planning.'};
const originText:Record<string,string>={user_report:'Reported',model_inference:'AI inference',assumption:'Assumption',unknown:'Unknown'};
const calendarDate=(date:string)=>`${new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))}, ${date}`;
type TrainingProps={userId:string;accessToken:()=>Promise<string>;onClose:()=>void;onSessionEnded?:()=>void;onClarify?:(request:RecoveryRequest)=>void;generateOnOpen?:boolean};
export function TrainingScreen(props:TrainingProps){return <AccountTrainingScreen key={props.userId} {...props}/>}
function AccountTrainingScreen({userId,accessToken,onClose,onSessionEnded,onClarify,generateOnOpen=false}:TrainingProps) {
  const [state,setState]=useState<TrainingState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false),[facts,setFacts]=useState<TrainingFact[]>([]),[showSummary,setShowSummary]=useState(false),[selected,setSelected]=useState(''),[feedback,setFeedback]=useState('');
  const alive=useRef(true),pending=useRef<AbortController|null>(null),token=useRef(accessToken),ended=useRef(onSessionEnded);token.current=accessToken;ended.current=onSessionEnded;
  const initial=useRef(generateOnOpen);
  const composer=useRef<View|null>(null),question=useRef<View|null>(null),scroll=useConversationScroll();
  const reveal=(focus=false)=>scroll.reveal({composer,question},focus);
  const submitted=useRef<{planId:string;planRevision:number;feedback:string}|null>(null);
  function update(s:TrainingState){if(alive.current){setState(s);const sent=submitted.current;if(sent){const result=s.plans.find(p=>p.id===sent.planId);if(result&&result.planRevision!==sent.planRevision){setFeedback(old=>old===sent.feedback?'':old);submitted.current=null}}const p=s.plans.find(x=>x.id===selected)??s.plans.find(x=>x.summaryRevision===s.summary?.revision);const job=p?.jobs.find(j=>j.target===`review:${p.planRevision}`&&j.status!=='completed');if(job?.feedback)setFeedback(old=>old||job.feedback!)}}
  async function run(work:(request:(path:string,method:'GET'|'POST'|'PUT',body?:unknown)=>Promise<TrainingState>)=>Promise<void>) {
    if(pending.current)return;const c=new AbortController();pending.current=c;setBusy(true);setError('');
    const timer=setTimeout(()=>c.abort(),210000);
    try {
      const t=await token.current();if(!alive.current||c.signal.aborted)return;
      const request=async(path:string,method:'GET'|'POST'|'PUT',body?:unknown)=>{if(!alive.current||c.signal.aborted)throw Error();const next=await trainingRequest(path,method,body,t,c.signal);if(!alive.current||c.signal.aborted)throw Error();if(next.summary?.sourceConversation)await privateDrafts.clear(userId,next.summary.sourceConversation);if(!alive.current||c.signal.aborted||pending.current!==c)throw Error();update(next);return next};
      await work(request);
    }catch(e){if(alive.current&&!c.signal.aborted&&pending.current===c){if(e instanceof TrainingError&&e.code==='session_ended')ended.current?.();else setError(e instanceof TrainingError?e.message:'Could not finish loading or clearing the device draft. Reload saved training to retry.')}}
    finally{clearTimeout(timer);if(pending.current===c){pending.current=null;if(alive.current)setBusy(false)}}
  }
  const current=state?.plans.find(p=>p.summaryRevision===state.summary?.revision);
  const shown=state?.plans.find(p=>p.id===selected)??current??state?.plans[0];
  const reviewing=shown?.reviewState==='draft'||shown?.reviewState==='accepted';
  const reviewJob=shown?.jobs.find(j=>j.target===`review:${shown.planRevision}`);
  const inFlight=shown?.jobs.some(j=>j.status==='pending');
  type Request=Parameters<Parameters<typeof run>[0]>[0];
  async function initialPlan(request:Request,s:TrainingState,retry=false) {
    if(!s.summary)return;
    let p=s.plans.find(x=>x.summaryRevision===s.summary!.revision);
    if(!p){s=await request('/plans','POST',{revision:s.summary.revision});p=s.plans.find(x=>x.summaryRevision===s.summary!.revision)}
    if(!p)return;
    setSelected(p.id);
    // A completion callback may be replayed after a lost response. Only a pristine
    // plan auto-generates; saved/failed/pending work needs an explicit weekly action.
    if(!retry&&(p.outline||p.days.length||p.jobs.length))return;
    const job=p.jobs.find(j=>j.target==='week');
    await request('/generate','POST',{summaryRevision:s.summary!.revision,planId:p.id,target:'week',retryAttempt:retry&&job?.status==='failed'?job.attemptId:null});
  }
  useEffect(()=>{alive.current=true;void run(async request=>{const s=await request('','GET');if(initial.current){initial.current=false;await initialPlan(request,s)}});return()=>{alive.current=false;pending.current?.abort();pending.current=null}},[userId]);
  const button=(label:string,press:()=>void,secondary=false,disabled=false)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} disabled={busy||disabled} onPress={press} style={[styles.button,secondary&&styles.secondary,(busy||disabled)&&{opacity:.5}]}><Text style={secondary?styles.copy:styles.buttonText}>{label}</Text></Pressable>;
  function clarification(value:{clarification?:{question:string;reason:string}|null;coverage:string[]},target:string,plan=shown) {
    if(!plan||!state?.summary)return null;
    return <View style={styles.day}>
      <Text style={styles.copy}>{value.clarification?.reason??'This saved plan needs a clarification check before it can be used.'}</Text>
      {value.clarification&&<Text style={styles.label}>{value.clarification.question}</Text>}
      {plan.summaryRevision===state.summary.revision&&onClarify&&button('Continue clarification',()=>onClarify({planId:plan.id,summaryRevision:state.summary!.revision,target}))}
    </View>;
  }
  function showDay(day:TrainingDay) {
    const d=day.detail;
    if(needsClarification(d))return clarification(d,day.date);
    return <View key={day.date} style={styles.day}>
      {d.coverage.map(code=><Text key={code} style={styles.copy}>{coverageText[code]??'Catalog coverage is limited.'}</Text>)}
      {!d.sessions.length&&!d.coverage.length&&<Text style={styles.copy}>Rest — no prescribed session.</Text>}
      {d.sessions.map((s,i)=><View key={i} style={styles.day}>
        <Text style={styles.label}>{shown?.outline?.days.find(x=>x.date===day.date)?.sessions[i]?.focus??`Session ${i+1}`}{s.timing?` · ${s.timing[0]!.toUpperCase()}${s.timing.slice(1)}`:''}</Text>
        {sessionRows(s,d.activities).map((row,j,rows)=><View key={j} style={styles.exercise}>
          {(j===0||rows[j-1]?.phase!==row.phase)&&row.phase!=='main'&&<Text style={styles.small}>{({warmup:'Warm-up',cooldown:'Cool-down',optional:'Optional'} as Record<string,string>)[row.phase]??row.phase}</Text>}
          {j>0&&rows[j-1]?.phase!==row.phase&&row.phase==='main'&&<Text style={styles.small}>Main</Text>}
          <Text style={styles.copy}>{row.text}</Text>
        </View>)}
      </View>)}
    </View>;
  }
  return <View style={styles.screen}>
    <Text accessibilityRole="header" style={styles.title}>Your training</Text>
    <Text style={styles.small}>Prescribed work, not a record of completed workouts. Catalog activities are AI consistency reviewed, not expert validated.</Text>
    {busy&&<Text accessibilityLiveRegion="polite" style={styles.copy}>Loading or generating…</Text>}
    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {button('Reload saved training',()=>void run(async request=>{await request('','GET')}),true)}
    {state&&!state.summary&&<Text style={styles.copy}>Complete onboarding to save a training summary and create your week.</Text>}
    {state?.summary&&<>
      {button(showSummary?'Hide training summary':'Training summary',()=>setShowSummary(!showSummary),true)}
      {!!state.summary.preferences?.length&&<Text style={styles.small}>Saved future preferences: {state.summary.preferences.join(" ")}</Text>}
      {showSummary&&<View style={styles.day}><Text style={styles.small}>Concise saved context; AI inferences and unknowns have not been confirmed by you.</Text>
        {(editing?facts:state.summary.document).map((f,i)=><View key={i} style={styles.exercise}><Text style={styles.label}>{f.category} · {originText[f.origin]}</Text>
          {editing?<TextInput accessibilityLabel={`${f.category} ${i+1}`} value={f.text} multiline maxLength={350} editable={!busy} style={styles.input} onChangeText={text=>setFacts(old=>old.map((x,j)=>j===i?{...x,text,origin:'user_report',...(x.category==='goals'?{goals:undefined}:{})}:x))}/>:<Text style={styles.copy}>{f.text}</Text>}
        </View>)}
        {editing?<>
          <Text style={styles.small}>Corrections apply to future generation. Existing outlines and sessions remain saved; create a new week explicitly after saving.</Text>
          {button('Save summary',()=>void run(async request=>{await request('/summary','PUT',{revision:state.summary!.revision,document:facts,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});setEditing(false)}))}
          {button('Cancel summary edit',()=>setEditing(false),true)}
        </>:button('Edit summary',()=>{setFacts(structuredClone(state.summary!.document));setEditing(true)},true)}
      </View>}
      {!current&&button('Create week from updated summary',()=>void run(request=>initialPlan(request,state,true)))}
      {current&&!current.outline&&current.jobs.some(j=>j.error==='summary_needs_correction')?clarification({coverage:['summary_needs_correction']},'outline',current):
        current&&!weekComplete(current)&&!current.jobs.some(j=>j.status==='pending')&&
        !(current.outline&&(needsClarification(current.outline)||current.outline.coverage.length))&&
        !current.days.some(d=>needsClarification(d.detail)||d.detail.coverage.length)&&
        button(current.jobs.some(j=>j.target==='week'&&j.status==='failed')?'Retry weekly plan':current.outline?'Complete weekly plan':'Generate weekly plan',()=>void run(request=>initialPlan(request,state,true)))}
    </>}
    {shown&&<View style={styles.day}><Text style={styles.label}>{shown.outline&&(needsClarification(shown.outline)||shown.outline.coverage.length)||shown.days.some(d=>needsClarification(d.detail)||d.detail.coverage.length)?'Planning needs attention':`${weekComplete(shown)?'Seven days':'Week incomplete'} · ${shown.timeZone}`}</Text>
      {reviewing&&<Text style={styles.label}>{shown.reviewState==='accepted'?'Accepted plan':'Draft plan — review your week'}</Text>}
      {shown.reviewState==='legacy'&&<Text style={styles.small}>Saved plan — acceptance was not recorded.</Text>}
      {!!shown.outline?.arrangementNote&&<Text style={styles.copy}>{shown.outline.arrangementNote}</Text>}
      {!!shown.reviewNote&&<Text style={styles.copy}>{shown.reviewNote}</Text>}
      {shown.summaryRevision!==state?.summary?.revision&&<Text style={styles.small}>Saved before your summary correction. Its existing sessions remain unchanged. Create a new week for future generation.</Text>}
      {shown.outline&&needsClarification(shown.outline)?clarification(shown.outline,'outline'):shown.outline?.coverage.map(code=><Text key={code} style={styles.error}>{coverageText[code]??'Catalog coverage is limited.'} A usable outline has not been created.</Text>)}
      {shown.outline?.goalDecisions?.filter(g=>g.status!=='addressed').map((g,i)=><Text key={`goal-${i}`} style={styles.small}>{g.goal}: {g.reason}</Text>)}
      {shown.jobs.filter(j=>j.status!=='completed'&&(j.target===`review:${shown.planRevision}`||j.target==='week'||!shown.jobs.some(x=>x.target==='week'))).map(j=><Text key={j.target} style={styles.copy}>{j.target.startsWith('review:')?'Changes':j.target==='week'?'Week':j.target}: {j.status==='pending'?'Generation in progress. Reload to check.':trainingError(j.error??'unavailable')}</Text>)}
      {shown.outline&&!needsClarification(shown.outline)&&!shown.outline.coverage.length&&shown.outline.days.map(d=><View key={d.date} style={styles.day}><Text style={styles.label}>{calendarDate(d.date)} · {d.sessions.length?d.sessions.map(s=>s.focus).join(' + '):'Rest'}</Text>
        {shown.days.some(x=>x.date===d.date)?shown.reviewState==='draft'?<View style={styles.exercise}>{shown.days.find(x=>x.date===d.date)!.detail.sessions.length?shown.days.find(x=>x.date===d.date)!.detail.sessions.map((session,i)=><Text key={i} style={styles.copy}>{session.timing?session.timing[0]!.toUpperCase()+session.timing.slice(1):'Flexible'} · {d.sessions[i]?.focus} · About {session.estimatedMinutes} min</Text>):<Text style={styles.copy}>Rest — no prescribed session.</Text>}</View>:showDay(shown.days.find(x=>x.date===d.date)!):<Text style={styles.copy}>Details not generated.</Text>}
      </View>)}
      {reviewing&&weekComplete(shown)&&shown.summaryRevision===state?.summary?.revision&&<View style={styles.day}>
        <View ref={question} collapsable={false}><Text accessibilityRole={shown.reviewQuestion?"alert":undefined} style={styles.copy}>{shown.reviewQuestion??'What would you change, and what should stay?'}</Text></View>
        <View ref={composer} collapsable={false} style={styles.exercise} onLayout={()=>reveal()}>
        <TextInput onFocus={()=>reveal(true)} onContentSizeChange={()=>reveal()} accessibilityLabel="Plan feedback" value={feedback} multiline maxLength={2000} editable={!busy&&!inFlight} style={[styles.input,{maxHeight:140}]} onChangeText={setFeedback} placeholder="Tell me what to change or keep" />
        <Text style={styles.small}>Feedback and the saved plan are shared with OpenAI for a revision. Only context needed for review and recovery is retained. Acceptance makes no AI request.</Text>
        {button(reviewJob?.status==='failed'?'Retry changes':'Update this week',()=>void run(async request=>{
          submitted.current={planId:shown.id,planRevision:shown.planRevision!,feedback};
          const result=await request('/review','POST',{planId:shown.id,summaryRevision:shown.summaryRevision,planRevision:shown.planRevision,feedback,retryAttempt:reviewJob?.status==='failed'?reviewJob.attemptId:null});
          const next=result.plans.find(p=>p.id===shown.id);if(next?.planRevision!==shown.planRevision)setFeedback('');
        }),false,!feedback.trim()||!!inFlight)}
        {shown.reviewState==='draft'&&button('Use this plan',()=>void run(async request=>{await request('/accept','POST',{planId:shown.id,summaryRevision:shown.summaryRevision,planRevision:shown.planRevision})}),false,!!feedback.trim()||!!inFlight||!!shown.reviewQuestion)}
        </View>
      </View>}
    </View>}
    {state&&state.plans.length>1&&<View>{state.plans.filter(p=>p.id!==shown?.id).map(p=>button(`View saved week ${p.dates[0]} · revision ${p.summaryRevision}`,()=>{setSelected(p.id);setFeedback(p.jobs.find(j=>j.target===`review:${p.planRevision}`)?.feedback??'')},true))}</View>}
    {button('Back to greeting',onClose,true)}
  </View>;
}
const styles=StyleSheet.create({screen:{gap:14,marginTop:20},title:{fontSize:26,color:'#193B34',fontWeight:'600'},label:{fontSize:16,color:'#193B34',fontWeight:'600'},copy:{fontSize:16,lineHeight:23,color:'#52655E'},small:{fontSize:13,lineHeight:19,color:'#52655E'},day:{gap:12,paddingVertical:12,borderTopWidth:1,borderColor:'#DDE5DD'},exercise:{gap:6},button:{padding:14,borderRadius:12,backgroundColor:'#176B5B',minHeight:46},buttonText:{fontSize:16,color:'#fff',textAlign:'center'},secondary:{backgroundColor:'#EDF2ED'},input:{borderWidth:1,borderColor:'#91A69B',borderRadius:8,padding:10,color:'#193B34',fontSize:16,minHeight:65},error:{color:'#9B302C',fontSize:16}});
