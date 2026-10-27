import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

globalThis.document=parseHTML('<html><body></body></html>').document;
const elements=new Map();
globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={addEventListener(){},querySelector(){return null;}};}};
globalThis.window={matchMedia:()=>({matches:false})};
globalThis.customElements={get:n=>elements.get(n),define:(n,c)=>elements.set(n,c)};
globalThis.FormData=class{constructor(form){this.values=form.values;}get(k){return this.values[k]??null;}has(k){return Object.hasOwn(this.values,k);}};
await import('../src/hearthglance-card.js');
const Card=elements.get('hearthglance-card');

function form(values,html=''){
 const error={hidden:true};
 return {dataset:{form:'event'},values,querySelector:s=>s==='.form-error'?error:s==='.rich-editor'?{innerHTML:html}:null,querySelectorAll:()=>[]};
}
function card(){
 const c=new Card(),commands=[];c._hass={connected:true,states:{},callWS:async cmd=>{commands.push(cmd);}};
 c._eventOptions={meal:true};c._closeModal=()=>{};c._toast=()=>{};c._loadCalendars=()=>{};
 return {c,commands};
}
const values={title:'Taco dip',calendar:'calendar.meals',start_date:'2026-11-01',end_date:'2026-11-01',all_day:'on',slot:'Dinner',notes:'Bring chips'};

test('free-text meals save only a calendar event; selecting a recipe adds its ID without creating a recipe',async()=>{
 for(const id of [null,'recipe-42']){
  const {c,commands}=card();c._mealRecipeId=id;
  const f=form(values);await c._submit({target:{closest:()=>f},preventDefault(){}});
  assert.equal(commands.length,1);assert.equal(commands[0].type,'calendar/event/create');
  assert.equal(commands[0].event.dtend,'2026-11-02');
  assert.deepEqual(JSON.parse(commands[0].event.description),{hearthglance:{slot:'Dinner',notes:'Bring chips',recipe:id}});
 }
});
test('editing a local meal preserves its identity and metadata while allowing a recipe link to be cleared',async()=>{
 const {c,commands}=card();c._mealRecipeId=null;
 c._hass.states['calendar.meals']={attributes:{supported_features:7}};
 c._editingEvent={uid:'same-id',calendar:{entity:'calendar.meals',kind:'meals'},description:JSON.stringify({hearthglance:{recipe:'old-id',custom:'Keep'}})};
 const f=form(values);await c._submit({target:{closest:()=>f},preventDefault(){}});
 assert.equal(commands[0].type,'calendar/event/update');assert.equal(commands[0].uid,'same-id');
 assert.equal(JSON.parse(commands[0].event.description).hearthglance.recipe,null);
 assert.equal(JSON.parse(commands[0].event.description).hearthglance.custom,'Keep');
});
test('Google events open their trusted source URL or Google Calendar and cannot be edited locally',()=>{
 const {c}=card();c._hass.states['calendar.google']={attributes:{supported_features:7}};
 const e={calendar:{entity:'calendar.google',google:true}};
 assert.equal(c._canEditEvent(e),false);
 assert.match(c._googleEventLink(e),/Open Google Calendar/);
 assert.match(c._googleEventLink({...e,htmlLink:'https://calendar.google.com/calendar/event?eid=abc'}),/Edit in Google Calendar/);
 assert.doesNotMatch(c._googleEventLink({...e,url:'javascript:alert(1)'}),/javascript:/);
 assert.doesNotMatch(c._googleEventLink({...e,url:'https://evil.example/event'}),/evil.example/);
});
