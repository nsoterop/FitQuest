import { Pressable,Text,TextInput,View } from 'react-native';
import { useRef } from 'react';
import { useConversationScroll } from './ConversationScrollView';
export type FixedIntakeFormProps={questions:readonly string[];answers:string[];text:string;editIndex:number|null;disabled:boolean;canGenerate:boolean;onText:(text:string)=>void;onEdit:(index:number)=>void;onCancel:()=>void;onSave:(index:number)=>void;onGenerate:()=>void};
export function FixedIntakeForm(p:FixedIntakeFormProps){
  const composer=useRef<View>(null),question=useRef<View>(null),scroll=useConversationScroll();
  const index=p.editIndex??p.answers.length;
  const reveal=(focus=false)=>scroll.reveal({composer,question},focus);
  const button=(label:string,fn:()=>void,disabled=p.disabled)=><Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={fn} style={{minHeight:44,padding:12,borderRadius:12,backgroundColor:'#176B5B',opacity:disabled ? .5 : 1}}><Text style={{color:'#fff',fontSize:16}}>{label}</Text></Pressable>;
  return <View style={{gap:16}}>
    {p.questions.slice(0,Math.min(5,p.answers.length+(p.editIndex===null?1:0))).map((q,i)=><View key={q} style={{gap:10}}>
      <View ref={i===index?question:undefined} collapsable={false}><Text style={{fontSize:16,lineHeight:25,color:'#193B34'}}>{q}</Text></View>
      {i===index?<View ref={composer} collapsable={false} onLayout={()=>reveal()} style={{gap:10}}>
        <TextInput accessibilityLabel={`Answer ${i+1}`} value={p.text} onChangeText={p.onText} multiline editable={!p.disabled} maxLength={4000} onFocus={()=>reveal(true)} onContentSizeChange={()=>reveal()} style={{minHeight:48,maxHeight:180,borderWidth:1,borderColor:'#91A69B',borderRadius:12,padding:12,fontSize:17,color:'#193B34'}}/>
        {button(p.editIndex===null?'Send':'Save answer',()=>p.onSave(i),p.disabled||!p.text.trim())}
        {p.editIndex!==null&&button('Cancel edit',p.onCancel)}
      </View>:<View style={{gap:6}}><Text style={{fontSize:16,lineHeight:25,color:'#193B34',backgroundColor:'#E5EEE8',padding:12,borderRadius:12}}>{p.answers[i]}</Text>{button(`Edit answer ${i+1}`,()=>p.onEdit(i))}</View>}
    </View>)}
    {p.answers.length===5&&<View ref={index===5?composer:undefined} collapsable={false} onLayout={()=>reveal()}>{button('Generate plan',p.onGenerate,!p.canGenerate||p.disabled||p.editIndex!==null||!!p.text.trim())}</View>}
  </View>;
}
