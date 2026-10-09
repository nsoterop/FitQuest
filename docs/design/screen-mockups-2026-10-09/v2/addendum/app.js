function go(s){
 if(scene==='revision'&&document.querySelector('#revisionfeedback'))feedback=document.querySelector('#revisionfeedback').value;
 if(scene==='recipeedit')captureRecipe();
 if(s==='recipeedit'&&scene!=='ingredientadd'){editAmounts=[...recipeAmounts];editYield=recipeYield;}
 if(s==='foodcorrection')correcting=true;
 if(s==='manual'&&scene!=='diaryerror'){editingDraft=null;}
 scene=s;render();
}
function captureRecipe(){if(!document.querySelector('#recipeyield'))return;editYield=Number(document.querySelector('#recipeyield').value);editAmounts=ingredientData.map((_,i)=>Number(document.querySelector('#ing'+i).value));}
function saveEntry(entry){const at=entries.findIndex(e=>e.id===entry.id);if(at>=0){setComplete(entries[at].date,false);entries[at]=entry;}else entries.push(entry);setComplete(entry.date,false);selectedEntry=entry.id;date=entry.date;pendingEntry=null;editingDraft=null;deleted=null;}
function readNutrition(prefix){return Object.fromEntries(['kcal','p','c','f'].map(k=>{const val=document.querySelector('#'+prefix+k).value;return[k,val===''?null:Number(val)]}));}
function render(){
 document.querySelector('#core').checked=core;
 document.querySelector('#switcher').innerHTML=scenes.map(([title,items])=>`<details ${items.some(([id])=>id===scene)?'open':''}><summary>${title}</summary><nav>${items.map(([id,label])=>`<button data-scene="${id}" class="${id===scene?'active':''}">${label}</button>`).join('')}</nav></details>`).join('');
 let body=scene==='account'?accountView():scene==='profile'?profileView():scene==='signout'?signoutView():['restorefailed','signoutfailed','reauth'].includes(scene)?authView():['day','pastday'].includes(scene)?dayView():scene==='week'?weekView():scene==='workout'?workoutView():scene==='revision'?revisionView():trainingStates[scene]||scene==='loading'?trainingStateView():['foodchat','clarify','foodunsupported'].includes(scene)?foodChatView():['foodreview','hypothetical'].includes(scene)?foodReviewView():scene==='foodcorrection'?foodCorrectionView():scene==='foodreceipt'?receiptView():['diary','diarypast','diaryempty','completed'].includes(scene)?diaryView():scene==='entry'?entryView():scene==='entryedit'?entryFormView():scene==='manual'?entryFormView(true):scene==='entrydelete'?deleteView():['diarysaving','diaryerror','diaryloadfailed'].includes(scene)?diaryStateView():scene==='library'?libraryView():scene==='savemeal'?saveMealView():scene==='recipe'?recipeView():scene==='recipeedit'?recipeEditView():scene==='ingredientadd'?ingredientAddView():scene==='recipeportion'?portionView():scene==='savedportion'?portionView(true):scene==='recipechanged'?recipeChangedView():scene==='trends'?trendsView():accountView();
 document.querySelector('#app').innerHTML=body;
 document.querySelectorAll('[data-action="none"]').forEach(b=>b.disabled=true);
 if(scene==='foodreview'&&!foodConsumed)document.querySelector('[data-action="none"]').disabled=true;
 if(scene==='revision')document.querySelector('[data-action="send-revision"]').disabled=!feedback.trim();
 document.querySelector('#revisionfeedback')?.addEventListener('input',e=>{feedback=e.target.value;document.querySelector('[data-action="send-revision"]').disabled=!feedback.trim()});
 document.querySelector('#diarydate')?.addEventListener('change',e=>{if(e.target.value&&e.target.value<=referenceDay){date=e.target.value;notice='';deleted=null;go('diary')}});
 document.querySelector('#servings')?.addEventListener('change',e=>{const n=Number(e.target.value);if(n>0&&n<=100){portion=n;render()}});
 document.querySelector('#portiondate')?.addEventListener('change',e=>{if(e.target.value&&e.target.value<=referenceDay)date=e.target.value});
 document.querySelector('#authform')?.addEventListener('submit',e=>{e.preventDefault();go('account')});
 document.querySelector('#entryform')?.addEventListener('submit',e=>{e.preventDefault();const name=document.querySelector('#entryname').value.trim(),part=document.querySelector('#entryportion').value.trim();if(!name||!part){document.querySelector('#entryerror').textContent='Enter a meal name and portion.';return;}const previous=scene==='entryedit'?getEntry():null;const entry={...(previous||{}),id:previous?.id||'manual-'+Date.now(),name,portion:part,date:document.querySelector('#entrydate').value,time:document.querySelector('#entrytime').value,meal:previous?.meal||'Meal',...readNutrition('entry'),source:'Manually entered values',estimated:document.querySelector('#entryestimated').checked};if(previous&&['kcal','p','c','f'].every(k=>previous[k]===entry[k]))entry.source=previous.source;else delete entry.recipeVersion;saveEntry(entry);notice='Entry saved in this preview. This day is open for logging.';go('diary')});
 document.querySelector('#ingredientform')?.addEventListener('submit',e=>{e.preventDefault();const name=document.querySelector('#ingredientname').value.trim(),amount=Number(document.querySelector('#ingredientamount').value);if(!name||amount<=0)return;ingredientData.push({name,unit:'g',base:amount,...readNutrition('ingredient')});editAmounts.push(amount);go('recipeedit')});
}
document.querySelector('#core').addEventListener('change',e=>{core=e.target.checked;go('day')});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.scene){scene=b.dataset.scene;seed(scene);if(scene==='recipeedit'){editAmounts=[...recipeAmounts];editYield=recipeYield}render();return;}
 if(b.dataset.go){go(b.dataset.go);return;}
 if(b.dataset.trainingday!==undefined){selectedTraining=Number(b.dataset.trainingday);featured=0;go('day');return;}
 if(b.dataset.feature!==undefined){featured=Number(b.dataset.feature);render();return;}
 if(b.dataset.entry){selectedEntry=b.dataset.entry;go('entry');return;}
 if(b.dataset.intent){foodConsumed=b.dataset.intent==='consumed';scene=foodConsumed?'foodreview':'hypothetical';render();return;}
 if(b.dataset.library){libraryTab=b.dataset.library;render();return;}
 if(b.dataset.portion){portion=Number(b.dataset.portion);render();return;}
 if(b.dataset.removeingredient!==undefined){captureRecipe();editAmounts[Number(b.dataset.removeingredient)]=0;render();return;}
 const action=b.dataset.action;
 if(['week','reauth','diary','recipe'].includes(action)){go(action);return;}
 if(action==='signoutconfirm'){go('reauth');return;}
 if(action==='cancel-signout'){go('account');return;}
 if(action==='retry-signout'){go('reauth');return;}
 if(action==='onboarding'){location.href='../onboarding.html?screen=privacy';return;}
 if(action==='reload-training'){go('day');return;}
 if(action==='openworkout'){go('workout');return;}
 if(action==='send-revision'||action==='retry-revision'){go('revisionpending');return;}
 if(action==='check-revision'){go('revisionfailed');return;}
 if(action==='edit-revision'){go('revision');return;}
 if(action==='load-latest'){notice='Latest version loaded. Feedback preserved.';go('revision');document.querySelector('.eyebrow').textContent='October 5–11 · revision 2';return;}
 if(action==='clear-feedback'){feedback='';render();return;}
 if(action==='check-acceptance'||action==='retry-acceptance'){currentPlanAccepted=true;go('week');return;}
 if(action==='prevday'||action==='nextday'){date=isoAdd(date,action==='prevday'?-1:1);notice='';deleted=null;go('diary');return;}
 if(action==='toggle-complete'){setComplete(date,!isComplete(date));go('diary');return;}
 if(action==='open-completion'){date=referenceDay;go('diary');return;}
 if(action==='food-chat'){foodDraftId='food-'+Date.now();unknownPortions=false;correcting=false;foodConsumed=true;go('foodchat');return;}
 if(action==='manual-entry'){go('manual');return;}
 if(action==='open-library'){go('library');return;}
 if(action==='reset-foodexample'){foodText='I had a tub of Greek yogurt with oats and blueberries for breakfast. The yogurt label says 120 kcal, 20 g protein, 8 g carbs and 0 g fat.';go('foodchat');return;}
 if(action==='analyze-food'){foodText=document.querySelector('#foodtext').value.trim();if(!foodText)return;if(!/yogurt/i.test(foodText)||!foodText.includes('120')){go('foodunsupported');return;}foodConsumed=!/what if|might|planning|plan to|would|tomorrow/i.test(foodText);go('clarify');return;}
 if(action==='unknown-portions'){unknownPortions=true;go(foodConsumed?'foodreview':'hypothetical');return;}
 if(action==='review-food'){portionText=document.querySelector('#foodtext').value.trim();if(!portionText)return;if(!/40\s*g.*80\s*g/i.test(portionText)){go('foodunsupported');return;}candidateOats=40;unknownPortions=false;go(foodConsumed?'foodreview':'hypothetical');return;}
 if(action==='review-correction'){const amount=Number(document.querySelector('#oatsamount').value);if(amount>0&&amount<=1000){candidateOats=amount;correcting=true;go('foodreview')}return;}
 if(action==='log-food'){if(!foodConsumed)return;const before=entries.find(e=>e.id===foodDraftId);saveEntry({...(before||{}),id:before?.id||foodDraftId,name:'Yogurt, oats & berries',date,time:'08:15',meal:'Breakfast',portion:unknownPortions?'Bowl · portions unknown':`1 bowl · ${candidateOats} g oats`,...candidate(),estimated:true,source:unknownPortions?'Supplied yogurt label; other nutrients unknown':'Supplied yogurt label + AI estimates',snapshot:true});correcting=false;go('foodreceipt');return;}
 if(action==='correct-saved'){editingDraft=copyEntry(getEntry());go('entryedit');return;}
 if(action==='save-meal'){go('savemeal');return;}
 if(action==='commit-savedmeal'){const name=document.querySelector('#savedmealname').value.trim();if(!name)return;mealName=name;savedMealSnapshot={...copyEntry(getEntry()),name};savedMeal=true;libraryTab='meals';go('library');return;}
 if(action==='log-savedmeal'){portion=1;go('savedportion');return;}
 if(action==='recipe-portion'){portion=1;go('recipeportion');return;}
 if(action==='save-recipe'){captureRecipe();if(!(editYield>0&&editYield<=100)||editAmounts.some(n=>!Number.isFinite(n)||n<0||n>10000)||!editAmounts.some(n=>n>0)){document.querySelector('#recipeerror').textContent='Add at least one ingredient and a valid serving yield.';return;}recipeOld={values:recipeValues(),version:recipeVersion};recipeAmounts=[...editAmounts];recipeYield=editYield;recipeVersion++;go('recipechanged');return;}
 if(action==='log-recipe'||action==='log-savedportion'){const saved=action==='log-savedportion';const values=saved?['kcal','p','c','f'].map(k=>savedMealSnapshot[k]===null?null:savedMealSnapshot[k]*portion):recipeValues(recipeAmounts,recipeYield,portion);saveEntry({id:'portion-'+Date.now(),name:saved?mealName:'Rice & bean bowl',date,time:'18:30',meal:'Meal',portion:fmt(portion)+(saved?' × saved portion':' servings'),kcal:values[0],p:values[1],c:values[2],f:values[3],estimated:saved?savedMealSnapshot.estimated:false,source:saved?savedMealSnapshot.source:`Recipe v${recipeVersion} · ${recipeYield}-serving yield`,...(saved?{}:{recipeVersion})});go('foodreceipt');return;}
 if(action==='edit-entry'){editingDraft=copyEntry(getEntry());go('entryedit');return;}
 if(action==='confirm-delete'){go('entrydelete');return;}
 if(action==='keep-entry'){go('entry');return;}
 if(action==='delete-entry'){const at=entries.findIndex(e=>e.id===selectedEntry);if(at<0)return;deleted={entry:copyEntry(entries[at]),index:at,complete:isComplete(entries[at].date)};date=entries[at].date;entries.splice(at,1);setComplete(date,false);go('diary');return;}
 if(action==='undo-delete'){if(deleted){entries.splice(deleted.index,0,deleted.entry);setComplete(deleted.entry.date,deleted.complete);deleted=null;render()}return;}
 if(action==='reload-diary'){go('diary');return;}
 if(action==='retry-food-save'){if(pendingEntry){saveEntry(pendingEntry);notice='Saved in this preview.'}go('diary');return;}
 if(action==='edit-failed-entry'){editingDraft=copyEntry(pendingEntry);go('manual');return;}
});
render();
