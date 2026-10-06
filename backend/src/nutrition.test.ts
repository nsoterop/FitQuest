import type { PlanningInput } from './planningDomain.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNutrition,preserveNutrition,type NutritionProposal } from './nutrition.js';
import { checkedSummary } from './trainingSummary.js';
import { checkOverview,checkOverviewReview,overviewDays,prepareOverview } from './outlinePlanning.js';
import { checkWeek } from './weeklyPlanning.js';
import { outlineInput,overviewFixture,overviewWorkouts } from './outlinePlanningFixture.js';
import { applyProposal,emptyContext,recapTopic,readyToPlan } from './onboardingDomain.js';
import { renderOnboardingReply } from './onboardingReply.js';
import type { ModelProposal } from './onboardingDomain.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import { serializeInput } from './onboardingProvider.js';

export const nutritionProposal:NutritionProposal={status:'estimate',activityFactor:1.6,proteinPerKg:1.6,fatPercent:30,adjustmentPercent:0,rationale:'Maintenance supports mixed strength and walking goals; daily activity is assumed moderately active.',reason:null};
export const nutritionReport={category:'nutrition' as const,text:'Use male for my energy equation. Maintain my weight; no special nutrition circumstances.',origin:'user_report' as const,nutritionInput:{equationSex:'male' as const,weightIntent:'maintain' as const,safety:'general' as const}};
const input=():PlanningInput=>({...outlineInput(),summary:structuredClone([...outlineInput().summary,nutritionReport])});
const provider:OnboardingProvider={mode:'test',model:'mock',capMicro:7000000,prepare:()=>{throw Error()},call:async()=>{throw Error()},cost:u=>u.input+u.output};
test('mixed-goal adult nutrition uses exact profile conversions, equation, moderate activity and consistent rounded macro energy',()=>{
 const i=input(),n=checkNutrition(nutritionProposal,i),kg=155*.45359237,cm=68*2.54;
 assert.equal(n.status,'estimate');assert.equal(n.calories,Math.round((10*kg+6.25*cm-5*29+5)*1.6/50)*50);
 assert.equal(n.proteinGrams,Math.round(kg*1.6));assert(Math.abs(n.calories!-4*n.proteinGrams!-4*n.carbohydrateGrams!-9*n.fatGrams!)<=5);
 assert.match(n.assumptions,/Starting estimate/);assert.match(n.assumptions,/Daily average/);
 const female=input();female.summary.at(-1)!.nutritionInput={equationSex:'female',weightIntent:'maintain',safety:'general'};
 assert(checkNutrition(nutritionProposal,female).calories!<n.calories!);
});
test('missing, inferred, declined or sensitive nutrition context defers without losing useful training',()=>{
 for(const patch of [{equationSex:null},{weightIntent:null},{safety:'sensitive'},{safety:'unknown'}] as const){
  const i=input();i.summary=structuredClone(i.summary);Object.assign(i.summary.at(-1)!.nutritionInput!,patch);
  const o=checkOverview({...overviewFixture(),nutrition:nutritionProposal},i);assert.equal(o.nutrition!.status,'deferred');assert.equal(o.days[0]!.sessions.length,2);
 }
 const i=input();i.summary.at(-1)!.origin='model_inference';assert.throws(()=>checkedSummary(i.summary),{code:'invalid_summary'});
 assert.equal(checkNutrition(nutritionProposal,outlineInput()).status,'deferred');
 for(const profile of [{age:18,heightInches:68,weightLb:155},{age:30,heightInches:68,weightLb:95},{age:NaN,heightInches:68,weightLb:155}])assert.equal(checkNutrition(nutritionProposal,{...input(),profile}).status,'deferred');
 const deferred={...nutritionProposal,status:'deferred',activityFactor:null,proteinPerKg:null,fatPercent:null,adjustmentPercent:null,reason:'Pregnancy needs individualized nutrition guidance.'};
 assert.equal(checkNutrition(deferred,input()).calories,null);assert.throws(()=>checkNutrition({...deferred,activityFactor:1.6},input()));
});
test('numerical proposals reject negative, nonfinite, extreme and intention-inconsistent values rather than clamp silently',()=>{
 for(const patch of [{activityFactor:Infinity},{activityFactor:NaN},{activityFactor:0},{proteinPerKg:-1},{proteinPerKg:3},{fatPercent:10},{adjustmentPercent:-40},{adjustmentPercent:-5},{reason:'An estimate cannot also claim a deferral.'}])assert.throws(()=>checkNutrition({...nutritionProposal,...patch},input()),{code:'invalid_nutrition'});
 for(const intent of ['lose','gain'] as const){const i=input();i.summary=structuredClone(i.summary);i.summary.at(-1)!.nutritionInput!.weightIntent=intent;assert.equal(checkNutrition({...nutritionProposal,adjustmentPercent:intent==='lose'?-5:5},i).status,'estimate');assert.throws(()=>checkNutrition({...nutritionProposal,adjustmentPercent:intent==='lose'?5:-5},i));}
});
test('nutrition inputs retain source evidence through recap; inferred gender never becomes an equation input',()=>{
 const i=input(),proposal:ModelProposal={trainingSummary:i.summary,reply:'Your context is ready for review.',additions:[],nextQuestion:{topic:recapTopic,text:'Ready?',decision:'Training context is sufficient.'},planningCheck:{status:'ready',question:null,reason:null},readiness:'ready',limitations:[]};
 const sources=Object.fromEntries(i.summary.map((f,j)=>['m'+j,f.text]));const c=applyProposal(emptyContext(),proposal,sources,'');assert(readyToPlan(c));assert.deepEqual(c.trainingSummary?.at(-1),nutritionReport);assert.match(renderOnboardingReply(proposal),/Nutrition context:.*energy equation/);
 assert.throws(()=>applyProposal(emptyContext(),proposal,{m1:'My gender is male.'},''),{code:'invalid_evidence'});
 const wire=JSON.parse(serializeInput({context:c,sources,recent:[],knownProfileFields:['age','height','weight','gender']},'mock'));assert.match(wire.instructions,/Never re-ask a known or skipped input/);assert.match(wire.instructions,/Do not infer physiological sex from gender/);
 assert.equal(readyToPlan({...c,trainingSummary:i.summary.slice(0,-1)}),true);
});
test('nutrition survives training revisions and confirmation; explicit macro review uses the existing single request and cannot grant training edits',()=>{
 const i=input(),raw={...overviewFixture(),nutrition:nutritionProposal},outline=checkOverview(raw,i);i.review={feedback:'Shorten Thursday. Keep the rest unchanged.',context:null,outline,days:overviewDays(outline)};
 const changed=structuredClone(raw);changed.days[3]!.sessions[0]!.estimatedMinutes=15;changed.nutrition.activityFactor=1.8;
 const revised=checkOverviewReview({outline:changed,scope:[{date:i.dates[3],changeSessions:[0],evidence:'Shorten Thursday'}],reply:'Thursday is shorter, nutrition is unchanged.'},i).week!.outline;
 assert.deepEqual(revised.nutrition,outline.nutrition);
 i.review.feedback='Increase protein to 1.8 grams per kg. Keep all training unchanged.';
 const macro={...raw,nutrition:{...nutritionProposal,proteinPerKg:1.8}};
 const result=checkOverviewReview({outline:macro,scope:[],nutritionChangeEvidence:'Increase protein to 1.8 grams per kg',reply:'Protein is increased while calories and training remain unchanged.'},i).week!.outline;
 assert(result.nutrition!.proteinGrams!>outline.nutrition!.proteinGrams!);assert.deepEqual(result.days,outline.days);
 assert.throws(()=>preserveNutrition(result.nutrition!,i,'unrelated forged nutrition quote'));
 const detailsInput={...i,review:undefined,kind:'week' as const,outline:result,draftReview:true,qualityVersion:2 as const};assert.deepEqual(checkWeek(overviewWorkouts(detailsInput),detailsInput).outline.nutrition,result.nutrition);
 const wire=JSON.parse(prepareOverview(provider,i).body);assert.equal(wire.text.format.name,'training_overview_review');assert.equal(wire.max_output_tokens,2000);
});
test('separate reported answers are reused, and optional missing-input recovery stays inside outline review',()=>{
 const i=input();i.summary=i.summary.slice(0,-1);
 i.summary.push({category:'nutrition',text:'Use female for the equation.',origin:'user_report',nutritionInput:{equationSex:'female',weightIntent:null,safety:'unknown'}},{category:'nutrition',text:'Maintain weight, no special dietary needs.',origin:'user_report',nutritionInput:{equationSex:null,weightIntent:'maintain',safety:'general'}});
 checkedSummary(i.summary);assert.equal(checkNutrition(nutritionProposal,i).status,'estimate');
 const old=checkOverview(overviewFixture(),outlineInput());const r={...outlineInput(),review:{feedback:'For nutrition, use female for the equation; maintain my weight; no special dietary needs.',context:null,outline:old,days:overviewDays(old)}};
 const report={text:r.review.feedback,inputs:{equationSex:'female' as const,weightIntent:'maintain' as const,safety:'general' as const}};
 const next=checkOverviewReview({outline:{...overviewFixture(),nutrition:{...nutritionProposal,inputReport:report}},scope:[],nutritionChangeEvidence:r.review.feedback,reply:'Nutrition estimates are now available; your training stays unchanged.'},r).week!.outline;
 assert.equal(next.nutrition!.status,'estimate');assert.deepEqual(next.days,old.days);
 assert.throws(()=>checkNutrition({...nutritionProposal,inputReport:{...report,text:'An invented physiological report.'}},r),{code:'invalid_nutrition'});
 r.review.outline=next;r.review.feedback='Increase protein to 1.8 grams per kg.';
 const reused=checkNutrition({...nutritionProposal,proteinPerKg:1.8},r);assert.equal(reused.status,'estimate');assert.deepEqual(reused.reportedContext,next.nutrition!.reportedContext);
 // Partial answers can be retained without inventing their missing fields.
 const partial={...report,inputs:{equationSex:'female' as const,weightIntent:null,safety:'unknown' as const}};
 r.review.outline=old;r.review.feedback=partial.text;
 const deferred=checkNutrition({...nutritionProposal,inputReport:partial},r);assert.equal(deferred.status,'deferred');assert.equal(deferred.reportedContext!.equationSex,'female');
 r.review.outline={...old,nutrition:deferred};r.review.feedback='For nutrition, maintain weight with no special dietary needs.';
 const recovered=checkNutrition({...nutritionProposal,inputReport:{text:r.review.feedback,inputs:{equationSex:null,weightIntent:'maintain',safety:'general'}}},r);assert.equal(recovered.status,'estimate');assert.equal(recovered.reportedContext!.equationSex,'female');
});
test('nutrition review cannot use a keep as permission; individual calorie preservation allows protein redistribution',()=>{
 const i=input(),prior=checkNutrition(nutritionProposal,i);i.review={feedback:'Keep nutrition unchanged. Shorten Thursday.',context:null,outline:{...checkOverview(overviewFixture(),i),nutrition:prior},days:[]};
 const next=checkNutrition({...nutritionProposal,proteinPerKg:1.8},i);
 assert.throws(()=>preserveNutrition(next,i,'Keep nutrition unchanged'),{code:'saved_nutrition_changed'});
 i.review.feedback='Increase protein. Keep calories unchanged.';assert.equal(preserveNutrition(next,i,'Increase protein').calories,prior.calories);
 const higher=checkNutrition({...nutritionProposal,activityFactor:1.8},i);assert.throws(()=>preserveNutrition(higher,i,'Increase protein'),{code:'saved_nutrition_changed'});
 i.review.feedback="Don't change protein. Increase calories.";assert.throws(()=>preserveNutrition(next,i,'Increase calories'),{code:'saved_nutrition_changed'});
});
test('plain and partial answers resolve a saved nutrition deferral without a topic keyword, but not invented or unrelated inputs',()=>{
 const i=outlineInput();let outline=checkOverview(overviewFixture(),i);
 const review=(feedback:string,inputs:any,evidence:string|null=feedback)=>{
  i.review={feedback,context:null,outline,days:overviewDays(outline)};
  return checkOverviewReview({outline:{...overviewFixture(),nutrition:{...nutritionProposal,inputReport:{text:feedback,inputs}}},scope:[],nutritionChangeEvidence:evidence,reply:'The reported inputs are retained; training stays unchanged.'},i).week!.outline;
 };
 const all={equationSex:'male',weightIntent:'maintain',safety:'general'};
 for(const evidence of ['Male, maintain, no special circumstances.',null])assert.equal(review('Male, maintain, no special circumstances.',all,evidence).nutrition!.status,'estimate');
 outline=review('Male.',{equationSex:'male',weightIntent:null,safety:'unknown'},null);assert.equal(outline.nutrition!.status,'deferred');assert.equal(outline.nutrition!.reportedContext!.equationSex,'male');
 outline=review('Maintain.',{equationSex:null,weightIntent:'maintain',safety:'unknown'});assert.equal(outline.nutrition!.status,'deferred');
 outline=review('No special circumstances.',{equationSex:null,weightIntent:null,safety:'general'},null);assert.equal(outline.nutrition!.status,'estimate');
 outline=checkOverview(overviewFixture(),i);
 for(const text of ['Make Sunday shorter.','My gender is male.','My male friend maintains weight.']){
  assert.deepEqual(review(text,all,null).nutrition,outline.nutrition);
  assert.throws(()=>review(text,all,'A fabricated quote.'),{code:'invalid_nutrition'});
 }
 assert.throws(()=>review('Male, maintain, no special circumstances. Keep nutrition unchanged.',all),{code:'saved_nutrition_changed'});
});
