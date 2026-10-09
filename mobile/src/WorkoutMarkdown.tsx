import React from 'react';
import {Text,View,StyleSheet} from 'react-native';
// Deliberately text-only: no WebView, HTML interpreter, image, link handler or network loader.
// Unrecognized Markdown (including HTML) remains literal text rather than executable content.
function inline(source:string):React.ReactNode[]{
 const display=source.replace(/!\[([^\]]*)\]\([^\n]*?\)/g,'$1').replace(/\[([^\]]+)\]\([^\n]*?\)/g,'$1');
 return display.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*)/g).filter(Boolean).map((part,i)=>{
  const bold=/^(?:\*\*[^*]+\*\*|__[^_]+__)$/.test(part),code=/^`[^`]+`$/.test(part),italic=/^\*[^*]+\*$/.test(part);
  return <Text key={i} style={bold?styles.bold:code?styles.code:italic?styles.italic:undefined}>{bold?part.slice(2,-2):code||italic?part.slice(1,-1):part}</Text>;
 });
}
export function WorkoutMarkdown({source}:{source:string}){
 const lines=source.replace(/\r\n?/g,'\n').split('\n');let fenced=false;
 return <View style={styles.group}>{lines.map((line,i)=>{
  if(/^\s*```/.test(line)){fenced=!fenced;return null;}
  if(!line.trim())return null;
  const heading=!fenced&&/^(#{1,6})\s+(.+)$/.exec(line),bullet=!fenced&&/^\s*[-+*]\s+(.+)$/.exec(line),ordered=!fenced&&/^\s*(\d+)[.)]\s+(.+)$/.exec(line);
  if(!fenced&&/^\s*(?:---+|\*\*\*+)\s*$/.test(line))return <View key={i} style={styles.rule}/>;
  return <Text key={i} accessibilityRole={heading?'header':undefined} style={[styles.copy,heading&&styles.heading,fenced&&styles.code,(bullet||ordered)&&styles.item]}>{fenced?line:<>{bullet?'• ':ordered?`${ordered[1]}. `:''}{inline(heading?heading[2]!:bullet?bullet[1]!:ordered?ordered[2]!:line)}</>}</Text>;
 })}</View>;
}
const styles=StyleSheet.create({group:{gap:7,paddingTop:8},copy:{fontSize:16,lineHeight:25,color:'#363B43'},heading:{fontSize:20,lineHeight:28,fontWeight:'700',color:'#191B20',marginTop:7},item:{paddingLeft:8},bold:{fontWeight:'600'},italic:{fontStyle:'italic'},code:{fontFamily:'Courier',fontSize:14},rule:{height:1,backgroundColor:'#DCDFE4',marginVertical:5}});
