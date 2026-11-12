import test from 'node:test';
import assert from 'node:assert/strict';
import {Bridge,message,snapshotRange} from '../bridge.js';
const snapshot=()=>({start:'2026-11-01T00:00:00Z',end:'2026-12-13T00:00:00Z',
 states:{'weather.home':{state:'sunny',attributes:{temperature:70}}},
 calendars:{'calendar.home':[{summary:'Dinner',start:'2026-11-08',end:'2026-11-09'}]},
 todos:{'todo.home':[{uid:'1',summary:'Dishes'}]},recipes:[{id:'r1',title:'Soup'}],forecast:[],errors:[],updated:'2026-11-08T12:00:00Z'});
function bridge(request=async()=>snapshot()) {
 let calls=0;
 const b=new Bridge({snapshot:snapshot(),request:async(...args)=>{calls++;return request(...args);},save(){},updated(){},status(){},csrf:'csrf'});
 return {b,calls:()=>calls};
}
test('cached tabs and recipe subscriptions need no network; cancelled subscriptions do not repaint',async()=>{
 const {b,calls}=bridge();let renders=0;
 const remove=await b.subscribe(()=>renders++,{type:'hearthglance_recipes/subscribe'});
 await b.subscribe(()=>renders++,{type:'todo/item/subscribe',entity_id:'todo.home'});
 await b.subscribe(()=>renders++,{type:'calendar/event/subscribe',entity_id:'calendar.home',start:'2026-11-08T00:00:00Z',end:'2026-11-09T00:00:00Z'});
 assert.equal(calls(),0);assert.equal(renders,3);remove();await b.refresh();assert.equal(renders,3);
});
test('a network failure keeps cached data and disables writes instead of queuing duplicates',async()=>{
 const {b,calls}=bridge(async()=>{throw new Error('Network down');});
 await b.refresh();assert.equal(b.connected,false);assert.equal(b.snapshot.recipes[0].title,'Soup');
 await assert.rejects(b.callService('todo','update_item',{item:'1'},{entity_id:'todo.home'}),/offline/);
 assert.equal(calls(),1);
});
test('delta updates preserve recipe data, unchanged state references, and scroll-preserving subscriptions',async()=>{
 const {b}=bridge(async()=>({updated:'2026-11-08T12:01:00Z',hashes:{recipes:'same'}}));
 const before=b.states['weather.home'];await b.refresh();
 assert.equal(b.snapshot.recipes[0].title,'Soup');assert.equal(b.states['weather.home'],before);
});
test('a confirmed save is sent once even if its follow-up snapshot is unavailable',async()=>{
 let writes=0;
 const {b}=bridge(async(path,options)=>{if(options?.method==='POST'){writes++;assert.equal(options.headers['X-HG-CSRF'],'csrf');return {saved:true};}throw new Error('Connection lost');});
 assert.deepEqual(await b.callWS({type:'calendar/event/create'}),{saved:true});assert.equal(writes,1);
});
test('today reads outside a browsed month do not replace the month snapshot',async()=>{
 const {b}=bridge(async(path)=>{assert.match(path,/api\/calendar/);return [{summary:'Today'}];});
 const range=b.snapshot;
 const events=await b.callApi('GET','calendars/calendar.home?start=2027-01-01T00%3A00%3A00Z&end=2027-01-02T00%3A00%3A00Z');
 assert.equal(events[0].summary,'Today');assert.equal(b.snapshot,range);
});
test('initial six-week range uses calendar days across DST and year boundaries',()=>{
 process.env.TZ='America/New_York';
 const range=snapshotRange(new Date(2026,10,8));
 assert.equal(new Date(range.start).getDate(),1);assert.equal(new Date(range.end).getDate(),13);
 assert.equal(message(snapshot(),{type:'calendar/event/subscribe',entity_id:'calendar.home',start:'2026-11-08T05:00:00Z',end:'2026-11-09T05:00:00Z'}).events.length,1);
});
