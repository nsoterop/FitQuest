// Design-only screenshot generation. No server, dependency installation or app code.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),deps='/Users/nicksoteropoulos/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const {chromium}=require(deps+'playwright'),sharp=require(deps+'sharp');
const dir=path.dirname(fileURLToPath(import.meta.url)),base=pathToFileURL(path.join(dir,'index.html')).href;
const browser=await chromium.launch({headless:true,executablePath:'/Users/nicksoteropoulos/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const checks=[],errors=[],external=[];
try{
const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2});
page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>{external.push(r.request().url());return r.abort()});
for(const screen of ['today','week','workout','nutrition','trends','meal','review','intake']){
 await page.goto(base+'?capture&screen='+screen);if(errors.length)throw Error(errors.join('; '));
 if(screen==='meal'){for(const [id,value] of Object.entries({mealname:'Salmon, rice & vegetables',portion:'1 plate',kcal:'620',p:'38',c:'72',f:'20'}))await page.locator('#'+id).fill(value);await page.locator('#estimate').check()}
 await page.locator('.scroll').evaluate(e=>e.scrollTop=0);await page.locator('.phone').screenshot({path:path.join(dir,'previews',screen+'.png')});
}
for(const screen of ['week','review','workout','trends','meal']){
 await page.goto(base+'?capture&expanded&screen='+screen);await page.locator('.phone').screenshot({path:path.join(dir,'previews',screen+'-full.png')});
}
await page.goto(base+'?capture&screen=review');if(await page.locator('.weeksection').count()!==7)throw Error('Missing day');if(await page.locator('.workoutdoc').count())throw Error('Preacceptance detail');await page.getByRole('button',{name:'Use this plan',exact:true}).click();await page.locator('[data-session]').first().click();if(!await page.locator('.workoutdoc').count())throw Error('No accepted detail');checks.push('Seven saved dates; review contains no workout detail; simulated acceptance reveals saved detail.');
await page.goto(base+'?capture&screen=meal');for(const [id,value] of Object.entries({mealname:'Synthetic dinner',portion:'1 plate',kcal:'620',p:'38',c:'72',f:'20'}))await page.locator('#'+id).fill(value);await page.getByRole('button',{name:'Add to food diary',exact:true}).click();if(!(await page.locator('.calorievalue').innerText()).includes('1,972'))throw Error('Wrong total');if(await page.locator('.mealrow').count()!==4)throw Error('No added meal');checks.push('Manual meal addition updates diary entries and totals in memory.');
await page.getByRole('button',{name:'Add meal',exact:true}).click();await page.locator('#mealname').fill('Unknown nutrition meal');await page.locator('#portion').fill('1 bowl');await page.getByRole('button',{name:'Add to food diary',exact:true}).click();if(!(await page.locator('.caloriehero').innerText()).includes('Some nutrition values are unknown'))throw Error('Unknown data misrepresented');checks.push('Unknown nutrition remains explicitly unknown; totals label known values only.');
await page.goto(base+'?capture&screen=trends');if(await page.locator('.partialbar').count()!==3||await page.locator('.missingbar').count()!==6)throw Error('Chart missingness');checks.push('Three labeled macro charts; partial current day; future placeholders; accessible data table.');
await page.goto(base+'?capture&screen=intake');for(let i=0;i<5;i++){await page.locator('#answer').fill('Synthetic answer '+i);await page.getByRole('button',{name:'Continue →',exact:true}).click()}if(!await page.getByRole('button',{name:'Generate plan',exact:true}).count())throw Error('Intake progression');checks.push('Five-question intake progression uses the existing exact question copy.');
for(const screen of ['today','week','workout','nutrition','trends','meal','review','intake']){await page.goto(base+'?capture&compact&large&screen='+screen);const overflow=await page.evaluate(()=>[...document.querySelectorAll('.phone,.scroll,input,.threefields,.macrogrid')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className||e.tagName));if(overflow.length)throw Error(screen+' overflow '+overflow);}
checks.push('No horizontal overflow at 320px and 125% text in eight screens.');
for(const [name,files] of [['training',['today','week','workout']],['nutrition',['nutrition','trends','meal']],['overview',['today','workout','nutrition','trends']]]){
 const n=files.length,w=n*393+(n+1)*30,h=1004,composite=[];
 const header=Buffer.from(`<svg width="${w}" height="100" xmlns="http://www.w3.org/2000/svg"><text x="30" y="38" font-family="Helvetica,Arial" font-weight="bold" font-size="23" fill="#191b20">fitquest. / ${name.toUpperCase()}</text><text x="30" y="67" font-family="Helvetica,Arial" font-size="13" fill="#626670">DESIGN STUDY 02 · SYNTHETIC CONTENT${name!=='training'?' · NUTRITION IS PROPOSED':''}</text></svg>`);composite.push({input:header,top:0,left:0});
 for(let i=0;i<n;i++)composite.push({input:await sharp(path.join(dir,'previews',files[i]+'.png')).resize(393,852).png().toBuffer(),top:100,left:30+i*423});
 await sharp({create:{width:w,height:h,channels:4,background:'#e3e5e8'}}).composite(composite).png().toFile(path.join(dir,'previews',name+'-board.png'));
}
if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));checks.push('No browser runtime errors; no external requests.');
await fs.writeFile(path.join(dir,'qa.json'),JSON.stringify({date:'2026-10-09',checks,limitations:['Design prototype, not application implementation','Nutrition proposed; all data synthetic','No native device, VoiceOver, account, storage or backend testing']},null,2)+'\n');console.log(JSON.stringify({checks,screens:8}));
}finally{await browser.close()}
