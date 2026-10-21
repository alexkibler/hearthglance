import test from 'node:test';
import assert from 'node:assert/strict';
const elements=new Map();
globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={addEventListener(){},removeEventListener(){},querySelector(){return null;}};}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
globalThis.customElements={get:name=>elements.get(name),define:(name,value)=>elements.set(name,value)};
globalThis.localStorage={getItem:()=>null};
await import('../src/hearthglance-card.js');
const Card=elements.get('hearthglance-card');
const config=todo=>({people:[{id:'family',name:'Family',...(todo?{todo}:{})}],calendars:[{entity:'calendar.family'}]});
const card=()=>{const c=new Card();c._renderShell=()=>{};c._updateClock=()=>{};c._renderMain=()=>{};c._loadCalendars=()=>{};return c;};
test('changing configuration discards late subscriptions from the previous setup',async()=>{
 const c=card();let resolve,unsubscribed=0;
 c._hass={connection:{subscribeMessage:()=>new Promise(r=>{resolve=r;})}};
 c.setConfig(config('todo.old'));c._active=true;
 try{
  const oldStart=c._start();
  c.setConfig(config());
  resolve(()=>{unsubscribed++;});await oldStart;
  assert.equal(unsubscribed,1);assert.equal(c._unsubs.length,0);
  assert.equal(c._config.people[0].todo,undefined);assert.equal(c._started,true);
 }finally{c._stop();}
});
test('a disconnected card releases subscriptions even if one unsubscribe throws',async()=>{
 const c=card();let called=0;
 c._unsubs=[()=>{throw new Error('Closed connection');},()=>{called++;}];
 c._calendarUnsubs=[()=>{called++;}];
 c._stop();await new Promise(r=>setImmediate(r));
 assert.equal(called,2);assert.equal(c._started,false);assert.equal(c._unsubs.length,0);
});
test('the card picker starter uses an available calendar without adding private entities',()=>{
 const config=Card.getStubConfig({states:{'calendar.demo':{}}});
 assert.equal(config.calendars[0].entity,'calendar.demo');assert.equal(config.type,'custom:hearthglance-card');
 assert.equal(config.people[0].todo,undefined);
});

test('new chores choose a configured chore owner when the first profile has no list',()=>{
 const c=card();let content;
 c.setConfig({people:[{id:'family',name:'Family'},{id:'pat',name:'Pat',todo:'todo.pat'}],calendars:[{entity:'calendar.family'}]});
 c._openModal=(title,html)=>{content=html;};c._taskForm();
 assert.equal(c._editingTask.entity,'todo.pat');assert.match(content,/<option value="pat" selected>/);
 assert.doesNotMatch(content,/<option value="family"/);
});

test('live solar changes update the values without rebuilding the active page',()=>{
 const c=card();let valuesUpdated=0,pagesRebuilt=0;
 c.setConfig({...config(),solar:{power:'sensor.power'}});
 c._renderSolar=()=>{valuesUpdated++;};c._renderMain=()=>{pagesRebuilt++;};c._updateConnection=()=>{};
 c._started=true;
 const power={state:'1',attributes:{unit_of_measurement:'kW'}};
 c.hass={connected:true,states:{'sensor.power':power}};
 c.hass={connected:true,states:{'sensor.power':power,'sensor.unrelated':{state:'2'}}};
 assert.equal(valuesUpdated,1);
 c.hass={connected:true,states:{'sensor.power':{...power,state:'3'}}};
 assert.equal(valuesUpdated,2);assert.equal(pagesRebuilt,0);c._stop();
});
