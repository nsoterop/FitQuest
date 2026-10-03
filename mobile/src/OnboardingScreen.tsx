import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OnboardingApiError, onboardingErrorText, onboardingRequest, operationId, type OnboardingCommand, type OnboardingConversation, type UnderstandingItem } from './onboardingApi';
import { privateDrafts } from './onboardingDraftStorage';
import type { OnboardingDraftStore } from './onboardingDraft';

const origins:Record<UnderstandingItem['origin'],string>={profile:'Saved profile report',user_report:'Athlete report',model_inference:'Model inference',assumption:'Assumption',unknown:'Unknown'};
export function OnboardingScreen({userId,accessToken,onSessionEnded,onClose,drafts=privateDrafts}: {
  userId:string;accessToken:()=>Promise<string>;onSessionEnded?:()=>void;onClose:()=>void;drafts?:OnboardingDraftStore;
}) {
  const [accepted,setAccepted]=useState(false);
  const [conversation,setConversation]=useState<OnboardingConversation|null>(null);
  const [text,setText]=useState('');const [pending,setPending]=useState<OnboardingCommand|null>(null);
  const [review,setReview]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [draftStatus,setDraftStatus]=useState('');
  const [editing,setEditing]=useState<string|null|undefined>(undefined);const [topic,setTopic]=useState('');const [value,setValue]=useState('');
  const [deleteRequested,setDeleteRequested]=useState(false);
  const alive=useRef(true);const request=useRef<AbortController|null>(null);const tokenGetter=useRef(accessToken);tokenGetter.current=accessToken;
  const sending=useRef(false);
  const ended=useRef(onSessionEnded);ended.current=onSessionEnded;
  const current=useRef<OnboardingConversation|null>(null);current.current=conversation;

  async function saveDraft(nextText:string,nextPending:OnboardingCommand|null,id=current.current?.id??null) {
    if(!alive.current)return;
    setDraftStatus('Saving draft…');
    try{await drafts.write(userId,{conversationId:id,text:nextText,pending:nextPending,savedAt:Date.now()});if(alive.current)setDraftStatus('Draft saved securely on this device.')}
    catch{if(alive.current)setDraftStatus('Draft could not be saved on this device. Keep this screen open and try again.')}
  }
  async function perform(action:(token:string,signal:AbortSignal)=>Promise<OnboardingConversation|null>,after?:(result:OnboardingConversation|null)=>Promise<void>|void) {
    if(request.current)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setError('');
    const timeout=setTimeout(()=>controller.abort(),75000);
    try{
      const token=await tokenGetter.current();if(!alive.current||controller.signal.aborted)return;
      const result=await action(token,controller.signal);
      if(!alive.current||controller.signal.aborted||request.current!==controller)return;
      setConversation(result);current.current=result;await after?.(result);
    }catch(error){if(request.current!==controller)return;if(alive.current&&!controller.signal.aborted){
      if(error instanceof OnboardingApiError&&error.sessionEnded){ended.current?.();return}
      setError(error instanceof OnboardingApiError?error.message:'Conversation is unavailable. Please retry.');
    }else if(alive.current)setError('Request timed out. Refresh or recover the saved operation before sending again.')}
    finally{clearTimeout(timeout);if(request.current===controller){request.current=null;if(alive.current)setBusy(false)}}
  }
  async function start() {
    await perform((token,signal)=>onboardingRequest('POST',null,null,token,signal),async result=>{
      const draft=await drafts.read(userId);if(!alive.current)return;
      if(draft&&draft.conversationId===result?.id){setText(draft.text);setPending(draft.pending);setDraftStatus('Recovered your secure device draft.')}
      else if(draft)await drafts.clear(userId);
      setAccepted(true);
    });
  }
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort();request.current=null}},[]);
  async function refresh() {
    if(!conversation)return;
    await perform((token,signal)=>onboardingRequest('GET',conversation.id,null,token,signal));
  }
  async function send(command:OnboardingCommand,recover=false) {
    if(!conversation||request.current||sending.current)return;
    sending.current=true;setBusy(true);
    Keyboard.dismiss();setPending(command);
    // Await durable operation ID before dispatch. A lost response replays this same command.
    try{await drafts.write(userId,{conversationId:conversation.id,text,pending:command,savedAt:Date.now()})}
    catch{setError('Unable to save your pending operation securely. Please retry before sending.');sending.current=false;setBusy(false);return}
    if(!alive.current||request.current){sending.current=false;return}
    await perform(async(token,signal)=>{
      try{return await onboardingRequest('POST',conversation.id,command,token,signal)}
      catch(error){
        // These explicit rejections guarantee rollback. Preserve the draft but unlock editing
        // and review; unknown/lost responses still retain the idempotent pending operation.
        if(error instanceof OnboardingApiError&&['context_limit','storage_limit'].includes(error.code)&&alive.current&&!signal.aborted){
          await drafts.write(userId,{conversationId:conversation.id,text,pending:null,savedAt:Date.now()});
          if(alive.current&&!signal.aborted)setPending(null);
        }
        throw error;
      }
    },async result=>{
      setPending(null);setText('');setEditing(undefined);
      await drafts.clear(userId);if(alive.current)setDraftStatus('');
      if(command.kind==='confirm')setReview(true);
      // Server-side failures have already saved the message; do not automatically call AI again.
      const last=result?.turns.at(-1);if(last?.state==='failed'&&(command.kind==='message'||command.kind==='retry'||recover))setError(onboardingErrorText(last.error??'provider_error'));
    });
    sending.current=false;
  }
  function command(fields:Omit<OnboardingCommand,'operationId'|'expectedRevision'>) {
    if(conversation)void send({...fields,operationId:operationId(),expectedRevision:conversation.revision} as OnboardingCommand);
  }
  function button(label:string,onPress:()=>void,disabled=busy) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  }
  const activeTurn=conversation?.turns.find(t=>t.state==='pending');const latest=conversation?.turns.at(-1);
  const questionTopic=conversation?.turns.filter(t=>t.questionTopic).at(-1)?.questionTopic??'Goals';
  return <View style={styles.section}>
    {!accepted?<>
      <Text accessibilityRole="header" style={styles.title}>Get to know you</Text>
      <Text style={styles.copy}>Describe what you want to improve. You can skip questions, correct your understanding, and review at any time. This saves an understanding of you; it does not generate a training plan or medical clearance.</Text>
      <Text style={styles.copy}>Live AI requires owner activation. When enabled, relevant profile facts, your messages and evolving understanding will be sent to OpenAI. App history stays until you delete it; provider retention and infrastructure backups are separate. No promise of zero retention. AI onboarding is for adults 18 and older. Account and profile access remain available to others.</Text>
      {button('Continue to onboarding',()=>void start())}
    </>:conversation?<>
      <Text accessibilityRole="header" style={styles.title}>{review?'Your understanding':'Your conversation'}</Text>
      {!conversation.generationEnabled&&<Text style={styles.notice}>AI conversation is not activated. You can record, review and confirm your understanding.</Text>}
      {conversation.generationEnabled&&<Text style={styles.notice}>{conversation.disclosure}</Text>}
      {conversation.profileChanged&&<Text style={styles.notice}>Your saved profile changed. Review and correct its references before confirming.</Text>}
      {conversation.state==='confirmed'&&<Text accessibilityLiveRegion="polite" style={styles.notice}>Understanding saved. Reports remain reports; this is not medical clearance or a generated plan.</Text>}
      {button(review?'Back to conversation':'Review understanding',()=>{setReview(!review);setEditing(undefined)},false)}
      {button('Refresh conversation',()=>void refresh())}
      {review?<>
        <Text style={styles.copy}>Review version {conversation.revision}. {conversation.context.readiness.replaceAll('_',' ')}. Confirmation saves exactly this version, including its unknowns.</Text>
        {conversation.context.items.map(item=><View key={item.id} style={styles.card}>
          <Text style={styles.label}>{item.topic}</Text><Text style={styles.copy}>{item.value}</Text>
          <Text style={styles.provenance}>{origins[item.origin]} · {item.review}{item.supersedes?` · corrects ${item.supersedes}`:''}</Text>
          <Text style={styles.provenance}>Source {item.source}: {item.quote}</Text>
          {button(`Edit ${item.id}`,()=>{setEditing(item.id);setTopic(item.topic);setValue(item.value)})}
        </View>)}
        {conversation.context.limitations.map((limitation,i)=><Text key={i} style={styles.notice}>{limitation}</Text>)}
        {conversation.context.skipped.length>0&&<Text style={styles.notice}>Skipped: {conversation.context.skipped.join(', ')}</Text>}
        {button('Add a correction or detail',()=>{setEditing(null);setTopic('');setValue('')})}
        {editing!==undefined&&<View style={styles.card}>
          <Text style={styles.label}>Topic</Text><TextInput accessibilityLabel="Understanding topic" value={topic} onChangeText={setTopic} maxLength={80} editable={!busy} style={styles.input}/>
          <Text style={styles.label}>Your words</Text><TextInput accessibilityLabel="Understanding correction" value={value} onChangeText={setValue} maxLength={4000} multiline editable={!busy} style={styles.input}/>
          {button('Save correction',()=>command({kind:'edit',itemId:editing,topic:topic.trim(),value:value.trim()} as Omit<OnboardingCommand,'operationId'|'expectedRevision'>),busy||!topic.trim()||!value.trim()||!!pending)}
        </View>}
        {button('Confirm this understanding',()=>command({kind:'confirm',reviewedRevision:conversation.revision} as Omit<OnboardingCommand,'operationId'|'expectedRevision'>),busy||!!pending||conversation.profileChanged||conversation.state==='confirmed')}
      </>:<>
        {conversation.turns.length===0&&!conversation.context.skipped.includes('Goals')&&<Text style={styles.copy}>{conversation.opening}</Text>}
        {conversation.turns.map(turn=><View key={turn.id} style={styles.card}>
          <Text style={styles.label}>You</Text><Text style={styles.copy}>{turn.message}</Text>
          {turn.reply&&<><Text style={styles.label}>FitQuest</Text><Text style={styles.copy}>{turn.reply}</Text></>}
          {turn.state==='failed'&&<Text style={styles.notice}>{onboardingErrorText(turn.error??'provider_error')}</Text>}
        </View>)}
        {(busy||activeTurn)&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{activeTurn||(busy&&conversation.generationEnabled&&(pending?.kind==='message'||pending?.kind==='retry'))?'Thinking…':'Saving…'}</Text>}
        <TextInput accessibilityLabel="Onboarding message" placeholder="What would you like to improve?" value={text} multiline maxLength={4000} editable={!busy&&!pending&&!activeTurn}
          onChangeText={next=>{setText(next);void saveDraft(next,null)}} style={styles.input}/>
        {button('Send message',()=>command({kind:'message',text:text.trim()} as Omit<OnboardingCommand,'operationId'|'expectedRevision'>),busy||!text.trim()||!!pending||!!activeTurn)}
        {button('Skip this topic',()=>command({kind:'skip',topic:questionTopic} as Omit<OnboardingCommand,'operationId'|'expectedRevision'>),busy||!!pending||!!activeTurn||conversation.context.skipped.includes(questionTopic))}
        {latest?.state==='failed'&&button('Retry AI response',()=>command({kind:'retry',turnId:latest.id} as Omit<OnboardingCommand,'operationId'|'expectedRevision'>),busy||!!pending||!conversation.generationEnabled)}
      </>}
      {pending&&<>
        <Text style={styles.notice}>A saved operation needs recovery. Replaying it uses the same operation ID.</Text>
        {button('Recover saved operation',()=>void send(pending,true))}
        {button('Discard device draft',()=>{void drafts.clear(userId).then(()=>{if(alive.current){setPending(null);setText('');setDraftStatus('')}}).catch(()=>setError('Unable to remove device draft. Please retry.'))})}
      </>}
      {draftStatus&&<Text accessibilityLiveRegion="polite" style={styles.provenance}>{draftStatus}</Text>}
      {button('Delete onboarding',()=>setDeleteRequested(true),false)}
      {deleteRequested&&<>
        <Text style={styles.notice}>Delete this conversation, its understanding and device draft? Your profile and account remain. Provider retention, infrastructure backups and outstanding usage accounting are separate.</Text>
        {button('Delete conversation permanently',()=>{
          request.current?.abort();request.current=null;
          void perform((token,signal)=>onboardingRequest('DELETE',conversation.id,null,token,signal),async()=>{await drafts.clear(userId);if(alive.current)onClose()});
        },false)}
        {button('Keep conversation',()=>setDeleteRequested(false),false)}
      </>}
    </>:null}
    {error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {button('Back to greeting',onClose,false)}
  </View>;
}
const styles=StyleSheet.create({
  section:{marginTop:24,gap:14},title:{fontSize:28,fontWeight:'600',color:'#193B34'},
  copy:{fontSize:16,lineHeight:25,color:'#193B34'},notice:{fontSize:15,lineHeight:23,color:'#52655E'},
  provenance:{fontSize:14,lineHeight:21,color:'#52655E'},label:{fontSize:16,fontWeight:'600',color:'#193B34'},
  card:{backgroundColor:'#FFFFFF',borderRadius:16,padding:16,gap:10,borderWidth:1,borderColor:'#DDE5DD'},
  input:{minHeight:60,borderWidth:1,borderColor:'#91A69B',borderRadius:12,padding:12,color:'#193B34',fontSize:17,backgroundColor:'#FFFFFF'},
  button:{minHeight:48,borderRadius:12,backgroundColor:'#176B5B',padding:14,alignItems:'center',justifyContent:'center'},
  buttonText:{color:'#FFFFFF',fontSize:16,fontWeight:'600'},disabled:{opacity:0.5},error:{fontSize:16,lineHeight:24,color:'#9B302C'},
});
