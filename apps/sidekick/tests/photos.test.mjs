import test from 'node:test';
import assert from 'node:assert/strict';
import {PhotoLibrary,photosHTML,uploadKey,ACCEPT} from '../ui/photos.js';

const photo=(id,n=0)=>({id,album:'family',created:n,width:2880,height:2160,thumb_width:512,thumb_height:384,
 display:`./api/photos/${id}/display`,thumb:`./api/photos/${id}/thumb`});
const file=(name='IMG_0001.HEIC',type='image/heic')=>({name,type,size:1000});
const tick=()=>new Promise(r=>setImmediate(r));
function json(status,body){return {status,ok:status>=200&&status<300,json:async()=>body};}
function library({responses=[],online=true,...options}={}){
 const calls=[],sends=[];
 const lib=new PhotoLibrary({csrf:'token',base:'https://app.test/hearthglance/',online:()=>online,key:(()=>{let n=0;return ()=>'key-'+(++n).toString().padStart(16,'0');})(),
  fetch:async(url,init={})=>{calls.push({url,init});return responses.shift()||json(200,{photos:[],version:0});},
  transport:(url,body,headers,progress)=>new Promise(resolve=>sends.push({url,body,headers,progress,resolve})),...options});
 return {lib,calls,sends,setOnline:value=>{online=value;}};
}

test('loading lists the album with the session cookie and records errors without throwing',async()=>{
 const {lib,calls}=library({responses:[json(200,{album:{id:'family',name:'Family Photos'},photos:[photo('a'.repeat(24))],version:3}),json(503,{error:'Photo storage is unavailable.'})]});
 await lib.load();
 assert.equal(calls[0].url,'https://app.test/hearthglance/api/photos');assert.equal(calls[0].init.credentials,'same-origin');
 assert.equal(lib.status,'ready');assert.equal(lib.photos.length,1);assert.equal(lib.version,3);
 await lib.load();
 assert.equal(lib.status,'error');assert.equal(lib.error,'Photo storage is unavailable.');
});

test('uploads send raw files with CSRF and a per-file idempotency key, two at a time, with progress',async()=>{
 const {lib,sends}=library();
 lib.add([file('one.heic'),file('two.jpg','image/jpeg'),file('three.png','image/png')]);
 assert.equal(sends.length,2);
 assert.equal(sends[0].url,'https://app.test/hearthglance/api/photos');
 assert.deepEqual(sends[0].headers,{'X-HG-CSRF':'token','Idempotency-Key':'key-0000000000000001','Content-Type':'image/heic'});
 assert.notEqual(sends[0].headers['Idempotency-Key'],sends[1].headers['Idempotency-Key']);
 sends[0].progress(.5);assert.equal(lib.uploads[0].status,'uploading');assert.equal(lib.uploads[0].progress,.5);
 sends[0].progress(1);assert.equal(lib.uploads[0].status,'processing');
 sends[0].resolve({status:201,body:{photo:photo('b'.repeat(24))}});await tick();
 assert.equal(sends.length,3);assert.equal(lib.photos.length,1);assert.equal(lib.uploads.length,2);
 assert.equal(lib.busy,true);
});

test('a failed upload retries with the same key and never duplicates a photo',async()=>{
 const {lib,sends}=library();
 const [upload]=lib.add([file()]);
 sends[0].resolve({status:0,body:{}});await tick();
 assert.equal(upload.status,'failed');assert.match(upload.error,/connection/);
 lib.retry(upload.local);
 assert.equal(sends[1].headers['Idempotency-Key'],sends[0].headers['Idempotency-Key']);
 assert.equal(sends[1].body,sends[0].body);
 sends[1].resolve({status:200,body:{photo:photo('c'.repeat(24))}});await tick();
 lib.photos=[...lib.photos];                                  // same photo arriving twice stays single
 lib.add([file()]);sends[2].resolve({status:200,body:{photo:photo('c'.repeat(24))}});await tick();
 assert.equal(lib.photos.length,1);assert.equal(lib.uploads.length,0);
});

test('server rejections are final, temporary failures are retryable, and sign-out is surfaced',async()=>{
 let signedOut=0;
 const {lib,sends}=library({unauthorized:()=>{signedOut++;}});
 lib.add([file('a'),file('b')]);
 sends[0].resolve({status:415,body:{error:'Only HEIC, JPEG and PNG photos are supported.'}});
 sends[1].resolve({status:507,body:{error:'The photo drive is full.'}});await tick();
 assert.equal(lib.uploads[0].status,'rejected');assert.equal(lib.uploads[0].file,null);
 assert.equal(lib.uploads[1].status,'failed');assert.equal(lib.uploads[1].error,'The photo drive is full.');
 lib.retry(lib.uploads[0].local);assert.equal(sends.length,2);
 lib.dismiss(lib.uploads[0].local);assert.equal(lib.uploads.length,1);
 lib.add([file('c')]);sends[2].resolve({status:401,body:{}});await tick();
 assert.equal(signedOut,1);
});

test('uploading and removal are refused while offline',async()=>{
 const {lib,sends,setOnline,calls}=library();
 setOnline(false);
 assert.throws(()=>lib.add([file()]),/offline/);
 await assert.rejects(lib.remove('a'.repeat(24)),/offline/);
 await lib.load();assert.equal(lib.status,'offline');
 assert.equal(sends.length,0);assert.equal(calls.length,0);
});

test('removal deletes with CSRF and drops the photo; a missing photo also leaves the grid',async()=>{
 const {lib,calls}=library({responses:[json(200,{removed:'x'}),json(404,{error:'Photo not found.'}),json(503,{error:'Photo storage is unavailable.'})]});
 lib.photos=[photo('a'.repeat(24)),photo('b'.repeat(24)),photo('c'.repeat(24))];
 await lib.remove('a'.repeat(24));
 assert.equal(calls[0].init.method,'DELETE');assert.equal(calls[0].init.headers['X-HG-CSRF'],'token');
 assert.equal(calls[0].url,'https://app.test/hearthglance/api/photos/'+'a'.repeat(24));
 await lib.remove('b'.repeat(24));
 await assert.rejects(lib.remove('c'.repeat(24)),/unavailable/);
 assert.deepEqual(lib.photos.map(p=>p.id),['c'.repeat(24)]);assert.equal(lib.removing.size,0);
});

test('markup escapes file names, shows progress and retry, and gates actions while offline',()=>{
 const {lib}=library();
 lib.photos=[photo('a'.repeat(24)),photo('b'.repeat(24))];lib.status='ready';
 lib.uploads=[{local:1,name:'<img src=x onerror=alert(1)>.heic',status:'uploading',progress:.42},{local:2,name:'b.jpg',status:'failed',error:'Upload interrupted.'},{local:3,name:'c.gif',status:'rejected',error:'Only HEIC, JPEG and PNG photos are supported.'}];
 const html=photosHTML(lib);
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img src=x/);
 assert.match(html,/Uploading 42%/);assert.match(html,/value="42"/);
 assert.equal((html.match(/data-photo-action="retry"/g)||[]).length,1);
 assert.equal((html.match(/data-photo-action="dismiss"/g)||[]).length,2);
 assert.match(html,new RegExp(`accept="${ACCEPT}" multiple`));
 assert.match(html,/Open photo 1 of 2/);
 const offline=photosHTML(lib,{online:false,preview:'b'.repeat(24)});
 assert.doesNotMatch(offline,/photo-input/);assert.match(offline,/You are offline/);
 assert.match(offline,/data-photo-action="remove" disabled/);
});

test('the preview steps through photos and confirms before removing',()=>{
 const {lib}=library();
 lib.photos=[photo('a'.repeat(24)),photo('b'.repeat(24))];lib.status='ready';
 const first=photosHTML(lib,{preview:'a'.repeat(24)});
 assert.match(first,/role="dialog" aria-modal="true"/);assert.match(first,/src="\.\/api\/photos\/a{24}\/display"/);
 assert.match(first,/data-photo-action="previous" disabled/);assert.doesNotMatch(first,/data-photo-action="next" disabled/);
 const confirm=photosHTML(lib,{preview:'b'.repeat(24),confirm:true});
 assert.match(confirm,/Remove this photo from Family Photos and the wall\?/);
 assert.match(confirm,/data-photo-action="confirm-remove" data-photo="b{24}"/);
 lib.removing.add('b'.repeat(24));
 assert.match(photosHTML(lib,{preview:'b'.repeat(24),confirm:true}),/data-photo-action="confirm-remove" data-photo="b{24}" disabled/);
});

test('empty, loading and error states read clearly',()=>{
 const {lib}=library();
 lib.status='loading';assert.match(photosHTML(lib),/Loading photos/);
 lib.status='ready';assert.match(photosHTML(lib),/No photos yet/);
 lib.status='error';lib.error='Photo storage is unavailable.';assert.match(photosHTML(lib),/role="alert".*Photo storage is unavailable.*data-photo-action="reload"/s);
});

test('idempotency keys satisfy the server pattern with or without randomUUID',()=>{
 const pattern=/^[A-Za-z0-9_-]{16,64}$/;
 assert.match(uploadKey(globalThis.crypto),pattern);
 assert.match(uploadKey({getRandomValues:bytes=>bytes.fill(171)}),pattern);
});

function held(){
 const queue=[];
 const fetch=(url,init={})=>new Promise(resolve=>queue.push({url,init,resolve}));
 return {queue,fetch};
}

test('a slow list response never erases an upload that finished while it was in flight',async()=>{
 const h=held();
 const {lib,sends}=library({fetch:h.fetch});
 const loading=lib.load();
 lib.add([file()]);sends[0].resolve({status:201,body:{photo:photo('d'.repeat(24))}});await tick();
 assert.deepEqual(lib.photos.map(p=>p.id),['d'.repeat(24)]);
 h.queue.shift().resolve(json(200,{photos:[],version:0}));await tick();     // stale: listed before the upload
 assert.deepEqual(lib.photos.map(p=>p.id),['d'.repeat(24)]);
 assert.equal(h.queue.length,1);                                              // re-listed instead
 h.queue.shift().resolve(json(200,{photos:[photo('d'.repeat(24))],version:1}));await loading;
 assert.deepEqual(lib.photos.map(p=>p.id),['d'.repeat(24)]);assert.equal(lib.version,1);
});

test('a slow list response never restores a photo removed while it was in flight',async()=>{
 const h=held();
 const {lib}=library({fetch:h.fetch});
 lib.photos=[photo('a'.repeat(24)),photo('b'.repeat(24))];lib.status='ready';
 const loading=lib.load();
 const removing=lib.remove('a'.repeat(24));
 h.queue[1].resolve(json(200,{removed:'a'.repeat(24)}));await removing;
 h.queue[0].resolve(json(200,{photos:[photo('a'.repeat(24)),photo('b'.repeat(24))],version:4}));await tick();
 assert.deepEqual(lib.photos.map(p=>p.id),['b'.repeat(24)]);
 h.queue[2].resolve(json(200,{photos:[photo('b'.repeat(24))],version:5}));await loading;
 assert.deepEqual(lib.photos.map(p=>p.id),['b'.repeat(24)]);
});

test('only the newest list request applies when responses arrive out of order',async()=>{
 const h=held();
 const {lib}=library({fetch:h.fetch});
 const first=lib.load(),second=lib.load();
 h.queue[1].resolve(json(200,{photos:[photo('n'.repeat(24))],version:9}));await second;
 h.queue[0].resolve(json(200,{photos:[],version:8}));await first;
 assert.deepEqual(lib.photos.map(p=>p.id),['n'.repeat(24)]);assert.equal(lib.version,9);
 h.queue.length=0;
 const third=lib.load();h.queue[0].resolve(Promise.reject(new TypeError('Failed to fetch')));
 const fourth=lib.load();h.queue[1].resolve(json(200,{photos:[],version:10}));await Promise.all([third,fourth]);
 assert.equal(lib.status,'ready');                                            // an older failure is ignored too
});
