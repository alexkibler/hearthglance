import test from 'node:test';
import assert from 'node:assert/strict';
import {Slideshow} from '../static/slideshow.js';

const photo=id=>({id,display:`./api/photos/${id}/display`});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

function rig({fail=new Set(),manual=false}={}){
 const timers=new Map();let nextTimer=0;
 const loads=[],pendingLoads=[];
 const layers=[0,1].map(n=>({n,src:null,visible:false,
  load(url){this.src=url;loads.push(url);
   if(manual)return new Promise((resolve,reject)=>pendingLoads.push({url,resolve,reject}));
   return [...fail].some(id=>url.includes(id))?Promise.reject(new Error('offline')):Promise.resolve();},
  show(){this.visible=true;},hide(){this.visible=false;},clear(){this.visible=false;this.src=null;}}));
 let empty=null;
 const s=new Slideshow({layers,interval:10000,fade:1000,empty:v=>{empty=v;},
  timers:{set:(f,ms)=>{const id=++nextTimer;timers.set(id,{f,ms});return id;},clear:id=>timers.delete(id)}});
 const fire=async ms=>{for(const [id,t] of [...timers]){if(t.ms===ms){timers.delete(id);await t.f();}}await flush();};
 const shown=()=>layers.find(l=>l.visible)?.src?.split('/')[3]||null;
 return {s,layers,loads,pendingLoads,fire,shown,timers,isEmpty:()=>empty};
}

test('plays in order with one preloaded slide and never more than two images',async()=>{
 const r=rig();
 await r.s.start(['a','b','c'].map(photo));
 assert.equal(r.shown(),'a');
 await r.fire(1000);                                    // after the fade, preload b into the back layer
 assert.equal(r.loads.at(-1),'./api/photos/b/display');
 await r.fire(10000);assert.equal(r.shown(),'b');
 await r.fire(1000);await r.fire(10000);assert.equal(r.shown(),'c');
 await r.fire(1000);await r.fire(10000);assert.equal(r.shown(),'a');          // wraps around
 assert.equal(r.layers.filter(l=>l.src).length<=2,true);
});

test('removing the photo on screen advances immediately; removing the preloaded one re-preloads',async()=>{
 const r=rig();
 await r.s.start(['a','b','c','d'].map(photo));await r.fire(1000);
 assert.equal(r.s.pending,'b');
 await r.s.update(['a','c','d'].map(photo));await r.fire(0);await r.fire(0);
 assert.equal(r.s.pending,'c');assert.equal(r.shown(),'a');
 await r.s.update(['c','d'].map(photo));await r.fire(0);
 assert.equal(r.shown(),'c');                           // current photo removed: it leaves playback now
 await r.fire(1000);await r.fire(10000);assert.equal(r.shown(),'d');
});

test('new uploads join the rotation without a restart',async()=>{
 const r=rig();
 await r.s.start([photo('a')]);
 assert.equal(r.shown(),'a');await r.fire(10000);assert.equal(r.shown(),'a');   // a single photo stays up
 r.s.update(['a','b'].map(photo));await flush();
 assert.equal(r.s.pending,'b');
 await r.fire(10000);assert.equal(r.shown(),'b');
});

test('an empty album shows the empty state and recovers when photos arrive',async()=>{
 const r=rig();
 await r.s.start([]);assert.equal(r.isEmpty(),true);assert.equal(r.shown(),null);
 await r.s.update([photo('a')]);await flush();
 assert.equal(r.isEmpty(),false);assert.equal(r.shown(),'a');
 await r.s.update([]);assert.equal(r.isEmpty(),true);assert.equal(r.layers.every(l=>!l.src),true);
});

test('a failed load keeps the last view and retries the following photo',async()=>{
 const r=rig({fail:new Set(['b'])});
 await r.s.start(['a','b','c'].map(photo));await r.fire(1000);
 assert.equal(r.shown(),'a');
 await r.fire(10000);assert.equal(r.shown(),'a');                              // b failed: a stays visible
 await r.fire(5000);assert.equal(r.shown(),'c');
});

test('a slow preload is reused, not restarted, and stop releases both images',async()=>{
 const r=rig({manual:true});
 const started=r.s.start(['a','b'].map(photo));
 assert.equal(r.pendingLoads.length,1);r.pendingLoads.shift().resolve();await started;await flush();
 assert.equal(r.shown(),'a');
 await r.fire(1000);assert.equal(r.pendingLoads.length,1);                     // b loading slowly
 const advancing=r.s.advance();await flush();
 assert.equal(r.pendingLoads.length,1);                                        // same in-flight load reused
 r.pendingLoads.shift().resolve();await advancing;await flush();
 assert.equal(r.shown(),'b');
 r.s.stop();
 assert.equal(r.layers.every(l=>!l.src&&!l.visible),true);assert.equal(r.timers.size,0);
});
