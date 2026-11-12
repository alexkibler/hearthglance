import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileMethods} from '../ui/mobile.js';
const methods=mobileMethods({});
test('phone swipes move a period only for deliberate horizontal gestures',()=>{
 const moves=[],ctx={_mobile:true,_navigatePeriod:n=>moves.push(n)};
 const start=(x,y)=>methods._phoneTouchStart.call(ctx,{touches:[{clientX:x,clientY:y}],target:{closest:()=>true}});
 const end=(x,y)=>methods._phoneTouchEnd.call(ctx,{changedTouches:[{clientX:x,clientY:y}]});
 start(300,100);end(80,110);assert.deepEqual(moves,[1]);
 start(80,100);end(300,110);assert.deepEqual(moves,[1,-1]);
 start(100,100);end(120,300);assert.deepEqual(moves,[1,-1]);
 start(100,100);end(150,105);assert.deepEqual(moves,[1,-1]);
 methods._phoneTouchStart.call(ctx,{touches:[{},{}]});end(300,100);assert.deepEqual(moves,[1,-1]);
});
test('mobile schedule navigation advances by the selected day count',()=>{
 const ctx={_mobile:true,_page:'calendar',_view:'schedule',_date:new Date(2026,9,20),_prefs:{scheduleDays:3},_loadCalendars(){this.loaded=true;},_scheduleDays:methods._scheduleDays};
 methods._navigatePeriod.call(ctx,1);assert.equal(ctx._date.getDate(),23);assert.equal(ctx.loaded,true);
 methods._navigatePeriod.call(ctx,-1);assert.equal(ctx._date.getDate(),20);
 ctx._mobile=false;methods._navigatePeriod.call(ctx,1);assert.equal(ctx._date.getDate(),27);
});
test('coming up lists an event that started yesterday under Today, groups by day and skips finished ones',()=>{
 const day=n=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+n);return d;};
 const at=(n,h)=>{const d=day(n);d.setHours(h);return d;};
 const events=[
  {title:'Recovery',start:day(-1),end:day(2),allDay:true},
  {title:'Done',start:day(-2),end:day(-1),allDay:true},
  {title:'Dentist',start:at(1,9),end:at(1,10),allDay:false},
  {title:'Soup',start:day(0),end:day(1),allDay:true},
  {title:'Trip',start:day(3),end:day(4),allDay:true},
 ];
 const m=mobileMethods({format:(d,o)=>d.toLocaleDateString('en-US',o)});
 const ctx={_visibleEvents:()=>events,_phoneEvent:e=>`[${e.title}]`};
 const items=m._upcoming.call(ctx);
 assert.deepEqual(items.map(i=>i.event.title),['Recovery','Soup','Dentist','Trip']);
 assert.equal(items[0].day.getTime(),day(0).getTime());
 const html=m._upcomingGroups.call(ctx,items);
 assert.match(html,/^<div class="phone-upcoming"><span>Today<\/span>\[Recovery\]\[Soup\]<\/div><div class="phone-upcoming"><span>Tomorrow<\/span>\[Dentist\]/);
 assert.ok(!html.includes('Done'));
});
