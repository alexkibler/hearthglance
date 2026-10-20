import test from 'node:test';
import assert from 'node:assert/strict';
import {localDate,dateKey,addDays,rangeFor,normalizeEvent,eventsOn,uniqueEvents,escapeHTML,taskMeta,dueToday} from '../src/model.js';
process.env.TZ='America/New_York';
const calendar={entity:'calendar.test',person:'family'};
test('all-day events occupy local dates and exclude their end date',()=>{
 const event=normalizeEvent({start:{date:'2026-11-01'},end:{date:'2026-11-03'},summary:'Trip'},calendar);
 assert.equal(event.allDay,true);
 assert.equal(eventsOn([event],localDate('2026-11-01')).length,1);
 assert.equal(eventsOn([event],localDate('2026-11-02')).length,1);
 assert.equal(eventsOn([event],localDate('2026-11-03')).length,0);
});
test('calendar day navigation survives both DST changes',()=>{
 for(const key of ['2026-03-08','2026-11-01']){
  const date=localDate(key),tomorrow=addDays(date,1);
  assert.equal(tomorrow.getHours(),0);
  assert.equal(addDays(tomorrow,-1).getTime(),date.getTime());
 }
 assert.equal((addDays(localDate('2026-11-01'),1)-localDate('2026-11-01'))/3600000,25);
 assert.equal((addDays(localDate('2026-03-08'),1)-localDate('2026-03-08'))/3600000,23);
});
test('six-week month grid covers dates across year boundaries',()=>{
 const r=rangeFor('month',localDate('2027-01-31'));
 assert.equal(dateKey(r.start),'2026-12-27');assert.equal(dateKey(r.end),'2027-02-07');assert.equal(r.days.length,42);
 assert.equal(dateKey(rangeFor('week',localDate('2026-10-20')).start),'2026-10-18');
 assert.equal(dateKey(rangeFor('schedule',localDate('2026-10-20')).start),'2026-10-20');
});
test('overlapping Google and subscription entries collapse while distinct times survive',()=>{
 const raw={start:'2026-10-21T15:30:00-04:00',end:'2026-10-21T16:30:00-04:00',summary:'Therapy'};
 const a=normalizeEvent(raw,calendar),b=normalizeEvent({...raw}, {...calendar,entity:'calendar.other'}),c=normalizeEvent({...raw,start:'2026-10-21T17:30:00-04:00',end:'2026-10-21T18:30:00-04:00'},calendar);
 assert.equal(uniqueEvents([a,b,c]).length,2);
});
test('untrusted event names and malformed task metadata remain inert',()=>{
 assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
 assert.deepEqual(taskMeta({description:'not JSON'}),{});
 assert.equal(dueToday({due:'2026-10-21'},localDate('2026-10-20')),false);
 assert.equal(dueToday({due:'2026-10-19'},localDate('2026-10-20')),true);
});
test('yesterday’s completed chores do not count as done today',()=>{
 const today=localDate('2026-10-20');
 assert.equal(dueToday({status:'completed',due:'2026-10-19',description:'{"hearthglance":{"completed_on":"2026-10-19"}}'},today),false);
 assert.equal(dueToday({status:'completed',due:'2026-10-19',description:'{"hearthglance":{"completed_on":"2026-10-20"}}'},today),true);
 assert.equal(dueToday({status:'needs_action',due:'2026-10-19'},today),true);
});

const {monthWeekLayout,scheduleLayout}=await import('../src/model.js');
test('month bars stay joined across days and split cleanly at week boundaries',()=>{
 const trip=normalizeEvent({start:'2026-10-23',end:'2026-10-27',summary:'Trip'},calendar);
 const first=monthWeekLayout([trip],localDate('2026-10-18')).segments[0];
 const next=monthWeekLayout([trip],localDate('2026-10-25')).segments[0];
 assert.deepEqual([first.column,first.span],[6,2]);assert.deepEqual([next.column,next.span],[1,2]);
 const busy=Array.from({length:5},(_,i)=>normalizeEvent({start:'2026-10-20',end:'2026-10-21',summary:`Event ${i}`},calendar));
 const layout=monthWeekLayout(busy,localDate('2026-10-18'));
 assert.equal(layout.segments.length,3);assert.equal(layout.overflow[2],2);assert.equal(layout.overflow[3],0);
});
test('hourly schedule separates overlapping events and clips overnight events',()=>{
 const event=(title,start,end)=>normalizeEvent({summary:title,start,end},calendar);
 const rows=scheduleLayout([
  event('A','2026-10-20T09:00:00-04:00','2026-10-20T10:00:00-04:00'),
  event('B','2026-10-20T09:30:00-04:00','2026-10-20T11:00:00-04:00'),
  event('C','2026-10-20T10:00:00-04:00','2026-10-20T10:30:00-04:00'),
  event('D','2026-10-20T12:00:00-04:00','2026-10-20T13:00:00-04:00'),
  event('Overnight','2026-10-19T23:00:00-04:00','2026-10-20T01:00:00-04:00'),
 ],localDate('2026-10-20'));
 const a=rows.find(r=>r.event.title==='A'),b=rows.find(r=>r.event.title==='B'),c=rows.find(r=>r.event.title==='C'),d=rows.find(r=>r.event.title==='D');
 assert.notEqual(a.column,b.column);assert.equal(c.column,a.column);assert.equal(a.columns,2);assert.equal(c.columns,2);assert.equal(d.columns,1);
 assert.deepEqual([rows[0].start,rows[0].end],[0,60]);
});

test('metadata only accepts an object in the package namespace',()=>{
 for(const description of ['null','{"hearthglance":null}','{"hearthglance":[]}','{"hearthglance":"bad"}'])assert.deepEqual(taskMeta({description}),{});
 assert.equal(taskMeta({description:'{"hearthglance":{"repeat":"weekly"}}'}).repeat,'weekly');
});
