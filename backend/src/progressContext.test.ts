import test from 'node:test';
import assert from 'node:assert/strict';
import {nextWeekDates} from './progressContext.js';
import {hasHistoryConsent,historyConsentVersion,historyConsentScope} from './progressConsent.js';
test('upcoming calendar weeks honor every weekday, DST, year boundaries and independent history permission',()=>{
 for(let i=5;i<=11;i++)assert.deepEqual(nextWeekDates('America/New_York',new Date(`2026-10-${String(i).padStart(2,'0')}T16:00:00Z`)),['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
 assert.equal(nextWeekDates('America/New_York',new Date('2026-11-01T06:30:00Z'))[0],'2026-11-02');
 assert.equal(nextWeekDates('America/New_York',new Date('2026-12-31T23:00:00Z'))[0],'2027-01-04');
 assert.equal(nextWeekDates('Pacific/Honolulu',new Date('2026-10-12T01:00:00Z'))[0],'2026-10-12');
 assert.equal(nextWeekDates('Pacific/Auckland',new Date('2026-10-12T01:00:00Z'))[0],'2026-10-19');
 assert(!hasHistoryConsent(null));assert(!hasHistoryConsent({version:'openai-workout-nutrition-v1',scope:'weekly-workout-nutrition-profile',granted:true,revision:1,updatedAt:new Date().toISOString()}));assert(hasHistoryConsent({version:historyConsentVersion,scope:historyConsentScope,granted:true,revision:1,updatedAt:new Date().toISOString()}));
});

test('progress serialization is stable through JSONB key reordering while keeping array order',async()=>{const {stableProgress}=await import('./progressContext.js');assert.equal(stableProgress({z:[{b:2,a:1}],a:'text'}),stableProgress({a:'text',z:[{a:1,b:2}]}));assert.notEqual(stableProgress([1,2]),stableProgress([2,1]));});
