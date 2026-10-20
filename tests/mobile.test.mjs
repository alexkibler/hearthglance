import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileMethods} from '../src/mobile.js';
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
