import test from 'node:test';
import assert from 'node:assert/strict';
import {Album} from '../static/album.js';

const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
function rig(){
 const queue=[],applied=[];let signedOut=0,offline=0;
 const album=new Album({request:()=>new Promise((resolve,reject)=>queue.push({resolve,reject})),
  apply:data=>applied.push(data.photos.map(p=>p.id)),unauthorized:()=>signedOut++,offline:()=>offline++});
 return {album,queue,applied,signedOut:()=>signedOut,offline:()=>offline};
}

test('an older catalog response arriving last never restores a removed photo',async()=>{
 const r=rig();
 const onOpen=r.album.refresh(),onEvent=r.album.notice(7);              // stream open and its initial event overlap
 r.queue[1].resolve(response(200,{version:7,photos:[{id:'b'}]}));
 assert.equal(await onEvent,'applied');
 r.queue[0].resolve(response(200,{version:6,photos:[{id:'a'},{id:'b'}]}));
 assert.equal(await onOpen,'stale');
 assert.deepEqual(r.applied,[['b']]);assert.equal(r.album.version,7);
});

test('a superseded failure does not mark the wall offline',async()=>{
 const r=rig();
 const first=r.album.refresh(),second=r.album.refresh();
 r.queue[1].resolve(response(200,{version:1,photos:[]}));await second;
 r.queue[0].reject(new TypeError('Failed to fetch'));
 assert.equal(await first,'offline');assert.equal(r.offline(),0);
 const third=r.album.refresh();r.queue[2].reject(new TypeError('Failed to fetch'));await third;
 assert.equal(r.offline(),1);
});

test('known versions are skipped, and a version reset after a server restart refreshes',async()=>{
 const r=rig();
 const first=r.album.refresh();r.queue[0].resolve(response(200,{version:12,photos:[]}));await first;
 assert.equal(await r.album.notice(12),'current');assert.equal(r.queue.length,1);
 const reset=r.album.notice(0);assert.equal(r.queue.length,2);
 r.queue[1].resolve(response(200,{version:0,photos:[{id:'x'}]}));assert.equal(await reset,'applied');
 assert.deepEqual(r.applied.at(-1),['x']);
});

test('a signed-out response hands control back to the page',async()=>{
 const r=rig();
 const p=r.album.refresh();r.queue[0].resolve(response(401,{}));
 assert.equal(await p,'signed-out');assert.equal(r.signedOut(),1);assert.deepEqual(r.applied,[]);
});
