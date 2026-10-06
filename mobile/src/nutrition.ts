export type Nutrition={status:'estimate'|'deferred';calories:number|null;proteinGrams:number|null;carbohydrateGrams:number|null;fatGrams:number|null;rationale:string;assumptions:string;reason:string|null;basis:'mifflin-st-jeor-v1'|null};
export function validNutrition(n:Nutrition|undefined):boolean {
  if(n===undefined)return true; // Legacy plans have no nutrition component.
  if(!n||typeof n.rationale!=='string'||!n.rationale.trim()||n.rationale.length>250||typeof n.assumptions!=='string'||n.assumptions.length>500)return false;
  const values=[n.calories,n.proteinGrams,n.carbohydrateGrams,n.fatGrams];
  if(n.status==='deferred')return values.every(x=>x===null)&&n.basis===null&&typeof n.reason==='string'&&n.reason.length>=8&&n.reason.length<=250;
  if(n.status!=='estimate'||n.basis!=='mifflin-st-jeor-v1'||n.reason!==null||!values.every(x=>Number.isInteger(x)&&x!>0))return false;
  return n.calories!>=1500&&n.calories!<=5000&&n.carbohydrateGrams!>=130&&Math.abs(4*n.proteinGrams!+4*n.carbohydrateGrams!+9*n.fatGrams!-n.calories!)<=5;
}
export function nutritionText(n:Nutrition){
  return n.status==='deferred'?`Nutrition targets deferred: ${n.reason}`:`Daily starting estimate · ${n.calories} kcal · Protein ${n.proteinGrams} g · Carbs ${n.carbohydrateGrams} g · Fat ${n.fatGrams} g`;
}
