import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.')&&!specifier.endsWith('.ts'))return next(specifier+'.ts',context);throw error}}});
const {sessionRows,validSessionMeaning}=await import('./trainingPresentation.ts');
test('range/RIR rows stay concise, old targets remain readable and malformed ranges fail closed',()=>{
 const a={id:'strength',phase:'main',sets:3,amount:8,measure:'repetitions',side:'both',restSeconds:60,effort:'moderate',repRange:{min:8,max:12},rir:2};const names={strength:{name:'Push-up'}},s={activities:[a]};
 assert.equal(validSessionMeaning(s),true);assert.equal(sessionRows(s,names)[0].text,'Push-up — 3 × 8–12 · 2 RIR; 60 sec rest between sets');
 const old={...a};delete old.repRange;delete old.rir;assert.equal(validSessionMeaning({activities:[old]}),true);assert.match(sessionRows({activities:[old]},names)[0].text,/3 × 8 \(moderate\)/);
 for(const patch of [{repRange:{min:12,max:8}},{amount:9},{rir:6},{rir:1.5},{measure:'seconds'}])assert.equal(validSessionMeaning({activities:[{...a,...patch}]}),false);
});
