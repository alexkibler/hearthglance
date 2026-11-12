import test from 'node:test';
import assert from 'node:assert/strict';
import {IdleTimer,idleMinutes} from '../static/idle.js';

function timers(){const set=new Map();let n=0;return {set,api:{set:(f,ms)=>{set.set(++n,{f,ms});return n;},clear:id=>set.delete(id)},
 fire(){const [[id,t]]=set;set.delete(id);t.f();}};}

test('starts after the quiet period and any activity restarts the countdown',()=>{
 const t=timers();let idle=0;
 const timer=new IdleTimer({minutes:5,onIdle:()=>idle++,timers:t.api});
 timer.poke();assert.equal(t.set.size,1);assert.equal([...t.set.values()][0].ms,300000);
 timer.poke();timer.poke();assert.equal(t.set.size,1);                    // activity resets, never stacks
 t.fire();assert.equal(idle,1);assert.equal(t.set.size,0);
 timer.poke();timer.stop();assert.equal(t.set.size,0);                   // playing: no countdown
});

test('zero minutes keeps idle playback off',()=>{
 const t=timers();const timer=new IdleTimer({minutes:0,onIdle:()=>assert.fail('should not start'),timers:t.api});
 timer.poke();assert.equal(timer.enabled,false);assert.equal(t.set.size,0);
});

test('a kiosk can override the server setting with ?idle=',()=>{
 assert.equal(idleMinutes('',0),0);assert.equal(idleMinutes('',10),10);
 assert.equal(idleMinutes('?idle=3',10),3);assert.equal(idleMinutes('?idle=0',10),0);
 assert.equal(idleMinutes('?idle=9999',0),240);assert.equal(idleMinutes('?idle=-1',10),0);
 assert.equal(idleMinutes('?idle=soon',10),0);assert.equal(idleMinutes('?idle=2.7',0),2);
});
