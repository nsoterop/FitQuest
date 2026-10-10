import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledDates} from './weeklySchedule.js';
const enrolled='2026-10-01T00:00:00Z';
test('Sunday 9 PM uses the saved zone, DST and year boundaries; catch-up never purchases older weeks',()=>{
 assert.equal(scheduledDates('America/New_York','2026-10-10T00:00:00Z',new Date('2026-10-12T00:59:59Z')),null);
 assert.equal(scheduledDates('America/New_York',enrolled,new Date('2026-10-12T01:00:00Z'))![0],'2026-10-12');
 assert.equal(scheduledDates('America/New_York',enrolled,new Date('2026-10-13T18:00:00Z'))![0],'2026-10-12');
 assert.equal(scheduledDates('America/New_York',enrolled,new Date('2026-11-02T02:00:00Z'))![0],'2026-11-02');
 assert.equal(scheduledDates('America/New_York',enrolled,new Date('2026-11-02T01:59:00Z'))![0],'2026-10-26');
 assert.equal(scheduledDates('America/New_York',enrolled,new Date('2027-01-04T02:00:00Z'))![0],'2027-01-04');
 assert.equal(scheduledDates('Pacific/Auckland',enrolled,new Date('2026-10-11T08:00:00Z'))![0],'2026-10-12');
 assert.equal(scheduledDates('UTC','2026-10-11T21:01:00Z',new Date('2026-10-12T12:00:00Z')),null);
 for(let day=12;day<=18;day++)assert.equal(scheduledDates('UTC',enrolled,new Date(`2026-10-${day}T12:00:00Z`))![0],'2026-10-12');
 assert.equal(scheduledDates('UTC',enrolled,new Date('2026-10-18T21:00:00Z'))![0],'2026-10-19');
});
