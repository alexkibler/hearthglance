import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {appleMobile,installed,PWA} from '../pwa.js';
import {OfflineStore} from '../offline-store.js';

const template=await readFile(new URL('../service-worker.js',import.meta.url),'utf8');
const base='https://app.test/hearthglance/';
class Cache {
 constructor(){this.rows=new Map();}
 key(request){return typeof request==='string'?request:request.url;}
 async match(request){return this.rows.get(this.key(request))?.clone();}
 async put(request,response){this.rows.set(this.key(request),response.clone());}
 async delete(request){return this.rows.delete(this.key(request));}
 async keys(){return [...this.rows.keys()].map(url=>new Request(url));}
 async addAll(requests){for(const request of requests)await this.put(request,new Response('shell '+request.url));}
}
function storage(){
 const rows=new Map();
 return {rows,async open(name){if(!rows.has(name))rows.set(name,new Cache());return rows.get(name);},
  async keys(){return [...rows.keys()];},async delete(name){return rows.delete(name);}};
}
function worker({version='one',store=storage(),network=async()=>new Response('photo',{headers:{'Content-Type':'image/jpeg','Content-Length':'5'}})}={}){
 const events={},messages=[];let skipped=0,claimed=0;
 const context={URL,Request,Response,Promise,Set,Number,caches:store,fetch:(...args)=>network(...args),
  self:{registration:{scope:base},addEventListener:(type,callback)=>{events[type]=callback;},
   skipWaiting:async()=>{skipped++;},clients:{claim:async()=>{claimed++;},matchAll:async()=>[{postMessage:message=>messages.push(message)}]}}};
 vm.runInNewContext(template.replace('__BUILD_ID__',version),context);
 async function dispatch(type,values={}){
  let work=Promise.resolve(),response;
  events[type]({...values,waitUntil:promise=>{work=Promise.all([work,promise]);},respondWith:promise=>{response=promise;}});
  const result=response?await response:undefined;await work;return result;
 }
 return {store,messages,dispatch,skipped:()=>skipped,claimed:()=>claimed,
  fetch:(path,options)=>dispatch('fetch',{request:new Request(new URL(path,base),options)}),
  async message(type){let result;await dispatch('message',{data:{type},ports:[{postMessage:value=>{result=value;}}]});return result;}};
}
const photo=(id=0,account='a'.repeat(24),variant='thumb')=>`api/hearthglance_recipes/image/${id.toString(16).padStart(64,'0')}/${variant}?v=1&cache=${account}`;

test('iPhone/iPad installation detection includes desktop-mode iPad and installed Home Screen mode',()=>{
 assert.equal(appleMobile({userAgent:'iPhone',platform:'iPhone'}),true);
 assert.equal(appleMobile({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}),true);
 assert.equal(appleMobile({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}),false);
 assert.equal(installed({matchMedia:()=>({matches:false})},{standalone:true}),true);
 assert.equal(installed({matchMedia:()=>({matches:true})},{}),true);
});

test('updates never interrupt a running page; reload is requested only after the user applies it',()=>{
 const win=new EventTarget(),sw=new EventTarget();let reloads=0;const messages=[];
 win.self=win;win.top=win;win.matchMedia=()=>({matches:false});
 globalThis.window=win;Object.defineProperty(globalThis,'navigator',{value:{userAgent:'iPhone',serviceWorker:sw},configurable:true});
 globalThis.location={reload:()=>reloads++};
 const pwa=new PWA();sw.dispatchEvent(new Event('controllerchange'));assert.equal(reloads,0);
 pwa.registration={waiting:{postMessage:message=>messages.push(message)}};
 pwa.update();assert.deepEqual(messages,[{type:'SKIP_WAITING'}]);
 sw.dispatchEvent(new Event('controllerchange'));assert.equal(reloads,1);
});

test('shell updates are atomic and wait for user activation, preserving unrelated HA caches',async()=>{
 const store=storage();await store.open('home-assistant-cache');
 const old=worker({store,version:'old'});await old.dispatch('install');await old.dispatch('activate');
 assert.equal(old.skipped(),0);assert.equal(old.claimed(),1);
 const next=worker({store,version:'next'});await next.dispatch('install');
 assert.equal(next.skipped(),0);
 assert.match(await (await old.fetch('./?page=recipes')).text(),/shell/);
 await next.message('SKIP_WAITING');assert.equal(next.skipped(),1);
 await next.dispatch('activate');
 assert.deepEqual((await store.keys()).sort(),['hearthglance-shell-next','home-assistant-cache']);
 const cache=await store.open('hearthglance-shell-next');
 assert.ok(await cache.match(base+'apple-touch-icon.png'));
});

test('app shell and cached photos work offline, with photo caches isolated by account',async()=>{
 let online=true;const w=worker({network:async()=>{if(!online)throw new Error('offline');return new Response('private photo',{headers:{'Content-Type':'image/jpeg','Content-Length':'13'}});}});
 await w.dispatch('install');await w.dispatch('activate');
 assert.equal((await w.fetch(photo())).status,200);online=false;
 assert.match(await (await w.fetch('./?source=pwa')).text(),/shell/);
 assert.equal(await (await w.fetch(photo())).text(),'private photo');
 assert.equal((await w.fetch(photo(0,'b'.repeat(24)))).status,503);
 assert.equal(await w.fetch('api/session'),undefined);
 assert.equal(await w.fetch('auth/callback?code=secret'),undefined);
 assert.equal(await w.fetch('api/command',{method:'POST',body:'{}'}),undefined);
 assert.equal(await w.fetch('https://app.test/api/states'),undefined);
});

test('Wall routes always use the network and never enter the Sidekick shell or photo caches',async()=>{
 const w=worker();await w.dispatch('install');await w.dispatch('activate');
 const before=JSON.stringify(await Promise.all((await w.store.keys()).map(async name=>[name,(await (await w.store.open(name)).keys()).map(r=>r.url)])));
 for(const path of ['wall','wall/','wall/?kiosk=1','wall/wall.js','wall/wall.css','wall/events','wall/photos/next'])
  assert.equal(await w.fetch(path),undefined,path);
 assert.equal(await w.fetch('wall/',{headers:{Accept:'text/event-stream'}}),undefined);
 const after=JSON.stringify(await Promise.all((await w.store.keys()).map(async name=>[name,(await (await w.store.open(name)).keys()).map(r=>r.url)])));
 assert.equal(after,before);
});
test('private caches are bounded and oversized images are not persisted',async()=>{
 const w=worker();for(let index=0;index<205;index++)await w.fetch(photo(index));
 assert.equal((await (await w.store.open('hearthglance-private-thumbnails-v1')).keys()).length,200);
 for(let index=0;index<9;index++)await w.fetch(photo(index,'a'.repeat(24),'photo'));
 assert.equal((await (await w.store.open('hearthglance-private-photos-v1')).keys()).length,6);
 const large=worker({network:async()=>new Response('large',{headers:{'Content-Type':'image/jpeg','Content-Length':String(2*1024*1024)}})});
 await large.fetch(photo());assert.equal((await (await large.store.open('hearthglance-private-thumbnails-v1')).keys()).length,0);
});

test('logout clears private snapshots and images, including in-flight photo writes, but retains the shell',async()=>{
 let release;const response=new Promise(resolve=>{release=resolve;});
 const w=worker({network:()=>response});await w.dispatch('install');
 const saved=await w.store.open('hearthglance-private-data-v1');await saved.put(base+'offline-snapshot',new Response('private data'));
 const pending=w.fetch(photo());await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await w.message('CLEAR_PRIVATE')).ok,true);
 release(new Response('photo',{headers:{'Content-Type':'image/jpeg','Content-Length':'5'}}));await pending;
 assert.equal((await w.store.keys()).some(key=>key==='hearthglance-private-data-v1'),false);
 const status=await w.message('CACHE_STATUS');assert.equal(status.thumbnails,0);assert.equal(status.photos,0);
 assert.ok((await w.store.keys()).includes('hearthglance-shell-one'));
});

test('an unauthorized photo never enters cache and locks private data on connected clients',async()=>{
 const w=worker({network:async()=>new Response('unauthorized',{status:401})});
 await w.fetch(photo());assert.equal(w.messages[0].type,'PRIVATE_EXPIRED');
 assert.equal((await w.message('CACHE_STATUS')).thumbnails,0);
});

test('offline snapshot storage migrates the old saved record and clears safely across concurrent writes',async()=>{
 const store=storage();let value=JSON.stringify({config:{household:'Family'},snapshot:{recipes:[]}});
 const legacy={getItem:()=>value,removeItem:()=>{value=null;},setItem:(_,body)=>{value=body;}};
 const offline=new OfflineStore(store,legacy,base);
 assert.equal((await offline.read()).config.household,'Family');
 await offline.write({config:{household:'New'},snapshot:{recipes:[]}});assert.equal(value,null);
 assert.equal((await offline.read()).config.household,'New');
 const pending=offline.write({config:{household:'Stale'},snapshot:{}});await offline.clear();await pending;
 assert.equal(await offline.read(),null);
});

test('manifest and Apple icons are installable PNGs with a stable app identity and scope',async()=>{
 const root=new URL('../static/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root)));
 assert.equal(manifest.id,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
 for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]){
  const png=await readFile(new URL(name,root));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 }
 assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
 const html=await readFile(new URL('index.html',root),'utf8');assert.match(html,/apple-touch-icon/);assert.match(html,/viewport-fit=cover/);
 const sw=await readFile(new URL('sw.js',root),'utf8');assert.doesNotMatch(sw,/__BUILD_ID__/);
});
