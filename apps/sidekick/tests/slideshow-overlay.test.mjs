import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {SlideshowOverlay} from '../slideshow-overlay.js';

const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const photo=id=>({id,display:`./api/photos/${id}/display`});

function rig({search='',photos=['a','b'],settings={idle:5},kiosk=true,device}={}){
 const {document}=parseHTML('<html><body><section id="slideshow" hidden><img class="slide"><img class="slide"><p class="slideshow-empty" hidden></p></section></body></html>');
 const timers=new Map();let n=0;
 const api={set:(f,ms)=>{timers.set(++n,{f,ms});return n;},clear:id=>timers.delete(id)};
 const streams=[];
 class FakeEventSource{
  constructor(url){this.url=url;this.readyState=0;this.listeners={};this.closed=false;streams.push(this);}
  addEventListener(type,f){(this.listeners[type]||=[]).push(f);}
  emit(type,data){if(type==='error'&&data==='closed')this.readyState=2;for(const f of this.listeners[type]||[])f({data});}
  close(){this.closed=true;this.readyState=2;}
 }
 const shown=[];
 const layers=[0,1].map(i=>({load:async url=>{layers[i].src=url;},show(){shown.push(this.src);},hide(){},clear(){this.src=null;}}));
 const library={photos:photos.map(photo),version:1,busy:false,loads:0,listeners:new Set(),
  async load(){this.loads++;},subscribe(f){this.listeners.add(f);return ()=>this.listeners.delete(f);},
  set(ids,version){this.photos=ids.map(photo);this.version=version;for(const f of this.listeners)f(this);}};
 const overlay=new SlideshowOverlay({root:document.querySelector('#slideshow'),search,base:'https://app.test/hearthglance/',
  EventSourceImpl:FakeEventSource,timers:api,layers,doc:document});
 overlay.attach({library,settings,kiosk:()=>kiosk,device});
 const fireIdle=async()=>{const entry=[...timers].find(([,t])=>t.ms===(settings.idle||0)*60000);assert.ok(entry,'idle timer armed');timers.delete(entry[0]);await entry[1].f();await tick();};
 return {overlay,document,library,streams,timers,shown,fireIdle,root:document.querySelector('#slideshow')};
}

test('Play opens the slideshow over the dashboard and a tap returns to it',async()=>{
 const r=rig();
 r.overlay.ready();
 r.overlay.start();await tick();
 assert.equal(r.root.hidden,false);assert.ok(r.document.documentElement.classList.contains('slideshow-open'));
 assert.equal(r.shown[0],'./api/photos/a/display');
 assert.equal(r.library.loads,1);
 assert.equal(r.streams.length,1);assert.equal(r.streams[0].url,'https://app.test/hearthglance/api/photos/events');
 r.root.dispatchEvent(new r.document.defaultView.Event('click'));
 assert.equal(r.root.hidden,true);assert.equal(r.streams[0].closed,true);
 assert.ok(!r.document.documentElement.classList.contains('slideshow-open'));
 assert.ok([...r.timers.values()].some(t=>t.ms===300000),'idle countdown restarts after returning');
});

test('live notices reload the album only when the version changed, and changes reach playback',async()=>{
 const r=rig();r.overlay.start();await tick();
 const stream=r.streams[0];
 stream.emit('open');assert.equal(r.library.loads,2);                        // catch anything missed
 stream.emit('photos','{"version":1}');assert.equal(r.library.loads,2);
 stream.emit('photos','{"version":2}');assert.equal(r.library.loads,3);
 r.library.set(['b'],2);await tick();                                          // 'a' (on screen) was removed
 assert.equal(r.shown.at(-1),'./api/photos/b/display');
});

test('a refused stream is reopened with backoff only while playing; a dropped one shows reconnecting',async()=>{
 const r=rig();r.overlay.start();await tick();
 r.streams[0].emit('error');
 assert.ok(r.root.classList.contains('reconnecting'));assert.equal(r.overlay.events,r.streams[0]);  // browser retries itself
 r.streams[0].emit('error','closed');assert.equal(r.overlay.events,null);
 r.overlay.stop();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(r.streams.length,1);
});

test('idle starts on wall-sized screens with photos, never on phones, empty albums or during uploads',async()=>{
 let r=rig();r.overlay.ready();await r.fireIdle();
 assert.equal(r.root.hidden,false);
 r=rig({kiosk:false});r.overlay.ready();await r.fireIdle();
 assert.equal(r.root.hidden,true);
 r=rig({photos:[]});r.overlay.ready();await r.fireIdle();
 assert.equal(r.root.hidden,true);assert.equal(r.library.loads,1);
 assert.ok([...r.timers.values()].some(t=>t.ms===300000),'checks again after another quiet period');
 r=rig();r.library.busy=true;r.overlay.ready();await r.fireIdle();
 assert.equal(r.root.hidden,true);
});

test('idle defaults to 5 minutes, the server can turn it off, a kiosk can override it, and ?slideshow=1 plays',async()=>{
 let r=rig({settings:{}});r.overlay.ready();
 assert.ok([...r.timers.values()].some(t=>t.ms===300000));
 r=rig({settings:{idle:0}});r.overlay.ready();
 assert.equal(r.timers.size,0);
 r=rig({settings:{},search:'?idle=2'});r.overlay.ready();
 assert.ok([...r.timers.values()].some(t=>t.ms===120000));
 r=rig({search:'?slideshow=1'});r.overlay.ready();await tick();
 assert.equal(r.root.hidden,false);
});

test('signing out detaches the library and stops playback; a new sign-in attaches the new one',async()=>{
 const r=rig();r.overlay.start();await tick();
 r.overlay.detach();
 assert.equal(r.root.hidden,true);assert.equal(r.library.listeners.size,0);
 r.overlay.start();assert.equal(r.root.hidden,true);                        // nothing to play while signed out
 const next={...r.library,photos:[photo('z')],listeners:new Set(),loads:0};
 r.overlay.attach({library:next,settings:{idle:5}});
 r.overlay.start();await tick();
 assert.equal(r.shown.at(-1),'./api/photos/z/display');assert.equal(next.listeners.size,1);
});

test('the device setting picks the idle time, changes apply at once, and an ?idle= address still wins',()=>{
 const armed=r=>[...r.timers.values()].map(t=>t.ms).filter(ms=>ms>=60000);
 let r=rig({settings:{idle:5},device:15});r.overlay.ready();
 assert.deepEqual(armed(r),[900000]);assert.equal(r.overlay.idleSetting.source,'device');
 r.overlay.setDeviceIdle(2);assert.deepEqual(armed(r),[120000]);
 r.overlay.setDeviceIdle(0);assert.deepEqual(armed(r),[]);                    // Off on this device
 r=rig({settings:{idle:5},device:15,search:'?idle=1'});r.overlay.ready();
 assert.deepEqual(armed(r),[60000]);assert.equal(r.overlay.idleSetting.source,'address');
 r.overlay.setDeviceIdle(30);assert.deepEqual(armed(r),[60000]);
});
