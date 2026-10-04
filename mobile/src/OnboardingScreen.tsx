import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { isDeletedOnboarding, type DeletedOnboarding, type RecoveryRequest, OnboardingApiError, onboardingErrorText, onboardingRequest, operationId, type OnboardingCommand, type OnboardingConversation } from './onboardingApi';
import { useConversationScroll } from './ConversationScrollView';
import { privateDrafts } from './onboardingDraftStorage';
import type { OnboardingDraftStore } from './onboardingDraft';

export function OnboardingScreen({userId,accessToken,onSessionEnded,onClose,recovery,drafts=privateDrafts}: {
  recovery?:RecoveryRequest;userId:string;accessToken:()=>Promise<string>;onSessionEnded?:()=>void;onClose:(message?:string,summarySaved?:boolean)=>void;drafts?:OnboardingDraftStore;
}) {
  const [accepted,setAccepted]=useState(!!recovery);
  const [conversation,setConversation]=useState<OnboardingConversation|null>(null);
  const [text,setText]=useState('');const [pending,setPending]=useState<OnboardingCommand|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [draftError,setDraftError]=useState('');
  const [needsRefresh,setNeedsRefresh]=useState(false);const [optionsOpen,setOptionsOpen]=useState(false);
  const [deleteRequested,setDeleteRequested]=useState(false);
  const alive=useRef(true);const request=useRef<AbortController|null>(null);const tokenGetter=useRef(accessToken);tokenGetter.current=accessToken;
  const sending=useRef(false);const ending=useRef(false);
  const [cleanup,setCleanup]=useState<DeletedOnboarding|null>(null);
  const [cleanupError,setCleanupError]=useState(false);
  const composer=useRef<View>(null), question=useRef<View>(null);
  const {reveal}=useConversationScroll();
  const answerLayout=()=>reveal({composer,question});
  const ended=useRef(onSessionEnded);ended.current=onSessionEnded;
  const current=useRef<OnboardingConversation|null>(null);current.current=conversation;

  async function saveDraft(nextText:string,nextPending:OnboardingCommand|null,id=current.current?.id??null) {
    if(!alive.current||ending.current)return;
    try{await drafts.write(userId,{conversationId:id,text:nextText,pending:nextPending,savedAt:Date.now()});if(alive.current)setDraftError('')}
    catch{if(alive.current)setDraftError('Could not save your draft. Keep this screen open and try again.')}
  }
  async function finishDeleted(result:DeletedOnboarding) {
    if(!alive.current)return;
    ending.current=true;setCleanup(result);setCleanupError(false);
    setConversation(null);current.current=null;setText('');setPending(null);setError('');setDraftError('');
    try {
      await drafts.clear(userId,result.id);
      if(alive.current)onClose(result.message,result.summarySaved===true);
    } catch {if(alive.current)setCleanupError(true)}
  }
  async function perform(action:(token:string,signal:AbortSignal)=>Promise<OnboardingConversation|DeletedOnboarding|null>,after?:(result:OnboardingConversation|null)=>Promise<void>|void) {
    if(request.current)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setError('');setNeedsRefresh(false);
    const timeout=setTimeout(()=>controller.abort(),75000);
    try{
      const token=await tokenGetter.current();if(!alive.current||controller.signal.aborted)return;
      const result=await action(token,controller.signal);
      if(!alive.current||controller.signal.aborted||request.current!==controller)return;
      if(isDeletedOnboarding(result)){await finishDeleted(result);return}
      if(result===null&&current.current){await finishDeleted({id:current.current.id,deleted:true,message:'Conversation deleted.'});return}
      setConversation(result);current.current=result;await after?.(result);
    }catch(error){if(request.current!==controller)return;if(alive.current&&!controller.signal.aborted){
      if(error instanceof OnboardingApiError&&error.sessionEnded){ended.current?.();return}
      if(error instanceof OnboardingApiError&&error.code==='not_found'&&current.current){await finishDeleted({id:current.current.id,deleted:true,message:'This conversation is no longer stored.'});return}
      setError(error instanceof OnboardingApiError?error.message:'Could not load the conversation. Try again.');
      setNeedsRefresh(!(error instanceof OnboardingApiError&&['context_limit','storage_limit'].includes(error.code)));
    }else if(alive.current){setError('This is taking longer than expected. Try again.');setNeedsRefresh(true)}}
    finally{clearTimeout(timeout);if(request.current===controller){request.current=null;if(alive.current)setBusy(false)}}
  }
  async function start() {
    await perform((token,signal)=>onboardingRequest('POST',null,null,token,signal,fetch,recovery),async result=>{
      const draft=await drafts.read(userId);if(!alive.current)return;
      if(draft&&draft.conversationId===result?.id){setText(draft.text);setPending(draft.pending)}
      else if(draft)await drafts.clear(userId,draft.conversationId??undefined);
      setAccepted(true);
    });
  }
  useEffect(()=>{alive.current=true;if(recovery)void start();return()=>{alive.current=false;request.current?.abort();request.current=null}},[]);
  async function refresh() {
    if(!conversation)return;
    await perform((token,signal)=>onboardingRequest('GET',conversation.id,null,token,signal));
  }
  async function send(command:OnboardingCommand) {
    if(!conversation||request.current||sending.current||ending.current)return;
    command={...command,timeZone:command.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone};
    sending.current=true;setBusy(true);setDraftError('');
    setPending(command);
    // Await durable operation ID before dispatch. A lost response replays this same command.
    try{await drafts.write(userId,{conversationId:conversation.id,text,pending:command,savedAt:Date.now()})}
    catch{if(alive.current){setError('Could not save your answer on this device. Try again.');setBusy(false)}sending.current=false;return}
    if(!alive.current||request.current||ending.current){sending.current=false;return}
    await perform(async(token,signal)=>{
      try{return await onboardingRequest('POST',conversation.id,command,token,signal)}
      catch(error){
        // Explicit bound/revision rejections roll back. Unknown outcomes retain the same pending ID.
        if(error instanceof OnboardingApiError&&['context_limit','storage_limit','revision_conflict','clarification_required','summary_changed'].includes(error.code)&&alive.current&&!signal.aborted){
          await drafts.write(userId,{conversationId:conversation.id,text,pending:null,savedAt:Date.now()});
          if(alive.current&&!signal.aborted)setPending(null);
        }
        throw error;
      }
    },async()=>{
      setPending(null);setText('');
      await drafts.clear(userId,conversation.id);if(alive.current)setDraftError('');
      // Failed responses remain visible; only an explicit retry can call AI again.
    });
    sending.current=false;
  }
  function command(fields:{kind:'message';text:string}|{kind:'retry';turnId:string}) {
    if(conversation)void send({...fields,operationId:operationId(),expectedRevision:conversation.revision});
  }
  function button(label:string,onPress:()=>void,disabled=busy,secondary=false) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.secondary,disabled&&styles.disabled]}><Text style={secondary?styles.secondaryText:styles.buttonText}>{label}</Text></Pressable>;
  }
  const activeTurn=conversation?.turns.find(t=>t.state==='pending');const latest=conversation?.turns.at(-1);
  const failure=latest?.state==='failed'?onboardingErrorText(latest.error??'provider_error'):'';
  if(cleanup)return <View style={styles.section}>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{cleanup.message}</Text>
    {cleanupError&&<><Text accessibilityRole="alert" style={styles.error}>Could not clear the device draft. Try again.</Text>{button('Finish cleanup',()=>void finishDeleted(cleanup),false,true)}</>}
  </View>;
  return <View style={styles.section}>
    <View style={styles.optionsRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Conversation options" accessibilityState={{expanded:optionsOpen}} onPress={()=>{setOptionsOpen(!optionsOpen);setDeleteRequested(false)}} style={styles.optionsButton}><Text style={styles.optionsText}>···</Text></Pressable>
    </View>
    {optionsOpen&&<View style={styles.menu}>
      {deleteRequested?<>
        <Text style={styles.copy}>Delete this conversation and device draft? Your profile and account remain. Provider retention, backups and usage records are separate.</Text>
        {button('Delete conversation permanently',()=>{
          request.current?.abort();request.current=null;
          void perform((token,signal)=>onboardingRequest('DELETE',conversation!.id,null,token,signal));
        },false)}
        {button('Keep conversation',()=>setDeleteRequested(false),busy,true)}
      </>:<>
        {button('Back to greeting',onClose,false,true)}
        {conversation&&button('Delete conversation',()=>setDeleteRequested(true),false,true)}
      </>}
    </View>}
    {recovery&&!conversation&&<><Text style={styles.copy}>{busy?'Loading clarification…':error||'Continue from your saved summary.'}</Text>{!busy&&button('Load clarification',()=>void start())}</>}
    {!accepted?<>
      <Text accessibilityRole="header" style={styles.title}>Before we begin</Text>
      <Text style={styles.copy}>AI onboarding is for adults 18+. Your messages and relevant profile information are shared with OpenAI. Unfinished conversations stay until you finish or delete them. Completing onboarding keeps a concise editable training summary and plans, and deletes the chat. The summary and relevant profile facts are shared with OpenAI for planning. Provider retention and backups are separate.</Text>
      {button('Continue to onboarding',()=>void start())}
    </>:conversation?<>
      {conversation.turns.length===0&&<View ref={question} collapsable={false} onLayout={answerLayout}><Text style={styles.copy}>{conversation.opening}</Text></View>}
      {conversation.turns.map(turn=><View key={turn.id} style={styles.turn}>
        <View style={styles.answer}><Text style={styles.copy}>{turn.message}</Text></View>
        {turn.reply&&<View ref={turn.id===latest?.id?question:undefined} collapsable={false} onLayout={turn.id===latest?.id?answerLayout:undefined}><Text style={styles.copy}>{turn.reply}</Text></View>}
      </View>)}
      {(busy||activeTurn)&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{pending||activeTurn?'Thinking…':'Loading…'}</Text>}
      <View ref={composer} collapsable={false} style={styles.composer} onLayout={answerLayout}>
        <TextInput accessibilityLabel="Onboarding message" placeholder="Your answer" onFocus={()=>reveal({composer,question},true)} value={text} multiline maxLength={4000} editable={!busy&&!pending&&!activeTurn}
          onChangeText={next=>{setText(next);void saveDraft(next,null)}} style={styles.input}/>
        {button('Send',()=>command({kind:'message',text:text.trim()}),busy||!text.trim()||!!pending||!!activeTurn||needsRefresh)}
      </View>
      {!busy&&<>
        {!!(error||failure)&&<Text accessibilityRole="alert" style={styles.error}>{error||failure}</Text>}
        {pending?button('Try again',()=>void send(pending),false,true):
          activeTurn||needsRefresh?button('Check for reply',()=>void refresh(),false,true):
          latest?.state==='failed'&&conversation.generationEnabled&&button('Retry reply',()=>command({kind:'retry',turnId:latest.id}),false,true)}
      </>}
      {!!draftError&&<Text accessibilityRole="alert" style={styles.error}>{draftError}</Text>}
    </>:null}
    {!accepted&&!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}
const styles=StyleSheet.create({
  section:{marginTop:16,gap:16},title:{fontSize:24,fontWeight:'600',color:'#193B34'},
  copy:{fontSize:16,lineHeight:25,color:'#193B34'},notice:{fontSize:15,lineHeight:23,color:'#52655E'},
  turn:{gap:14},answer:{alignSelf:'flex-end',maxWidth:'92%',backgroundColor:'#E5EEE8',borderRadius:14,padding:12},
  composer:{flexDirection:'row',alignItems:'flex-end',gap:10},
  input:{flex:1,minHeight:48,maxHeight:180,borderWidth:1,borderColor:'#91A69B',borderRadius:12,padding:12,color:'#193B34',fontSize:17,backgroundColor:'#FFFFFF'},
  button:{minHeight:44,borderRadius:12,backgroundColor:'#176B5B',paddingHorizontal:16,paddingVertical:12,alignItems:'center',justifyContent:'center'},
  buttonText:{color:'#FFFFFF',fontSize:16,fontWeight:'600'},secondary:{backgroundColor:'transparent',alignSelf:'flex-start'},secondaryText:{color:'#176B5B',fontSize:16},
  optionsRow:{alignItems:'flex-end'},optionsButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},optionsText:{fontSize:24,color:'#52655E'},
  menu:{borderWidth:1,borderColor:'#DDE5DD',borderRadius:12,padding:12,gap:8,backgroundColor:'#FFFFFF'},
  disabled:{opacity:0.5},error:{fontSize:15,lineHeight:23,color:'#9B302C'},
});
