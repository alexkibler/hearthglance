// Fictional data only. Changes stay in memory; this mock never connects to HA.
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const day=n=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+n);return d;};
const stamp=(n,h)=>{const d=day(n);d.setHours(h);return d.toISOString();};
export const config={
 type:'custom:hearthglance-card',household:'Our family',storage_key:'fictional-demo',weather:'weather.home',default_calendar:'calendar.family',solar:{today:'sensor.solar_today',forecasts:['sensor.solar_forecast_today','sensor.solar_tomorrow',...Array.from({length:4},(_,i)=>`sensor.solar_forecast_day_${i+2}`)]},
 people:[
  {id:'family',name:'Family',color:'#527d59',pale:'#eaf2e7',todo:'todo.family_chores'},
  {id:'sam',name:'Sam',color:'#397f86',pale:'#e8f2f2',todo:'todo.sam_chores'},
  {id:'riley',name:'Riley',color:'#9a6e8e',pale:'#f3eaf1',todo:'todo.riley_chores'},
 ],
 calendars:[
  {entity:'calendar.family',name:'Family',person:'family'},
  {entity:'calendar.sam',name:'Sam',person:'sam'},
  {entity:'calendar.riley',name:'Riley',person:'riley'},
  {entity:'calendar.meals',name:'Meal plan',person:'family',kind:'meals'},
 ],
 lists:[{name:'Groceries',entity:'todo.groceries'},{name:'Things to do',entity:'todo.things_to_do'}],recipes:'sensor.hearthglance_recipes',
};
export function createDemoHass(){
 let next=100;
 const event=(uid,summary,start,end,extra={})=>({uid,summary,start,end,...extra});
 const calendars={
  'calendar.family':[
   event('f1','Library & story time',stamp(0,10),stamp(0,11),{location:'Neighborhood library'}),
   event('f2','Weekend at the lake',key(day(3)),key(day(6)),{description:'Pack a picnic and walking shoes.'}),
   event('f3','Family movie night',stamp(1,19),stamp(1,21)),
  ],
  'calendar.sam':[event('s1','Morning walk',stamp(0,8),stamp(0,9)),event('s2','Garden club',stamp(2,16),stamp(2,17))],
  'calendar.riley':[event('r1','Art class',stamp(0,15),stamp(0,16)),event('r2','Soccer practice',stamp(1,16),stamp(1,17))],
  'calendar.meals':[event('m1','Roasted vegetable pasta',key(day(0)),key(day(1)),{description:JSON.stringify({hearthglance:{slot:'Dinner',notes:'Serve with a green salad.',recipe:'recipe-1'}})}),event('m2','Taco night',key(day(1)),key(day(2)),{description:'{"hearthglance":{"slot":"Dinner"}}'})],
 };
 const task=(uid,summary,extra={})=>({uid,summary,status:'needs_action',...extra});
 const chores=(uid,summary,repeat='daily')=>task(uid,summary,{due:key(day(0)),description:JSON.stringify({hearthglance:{repeat}})});
 const todos={
  'todo.family_chores':[chores('c1','Water the plants'),chores('c2','Take out recycling','weekly')],
  'todo.sam_chores':[chores('c3','Walk the dog'),chores('c4','Set the table')],
  'todo.riley_chores':[chores('c5','Pack school bag','weekdays'),chores('c6','Tidy the art supplies')],
  'todo.groceries':[task('g1','Apples'),task('g2','Oat milk'),task('g3','Pasta')],
  'todo.things_to_do':[task('t1','Plan the weekend picnic')],
  'todo.recipes':[task('recipe-1','Roasted vegetable pasta',{description:JSON.stringify({ingredients:'Pasta\nSeasonal vegetables\nOlive oil',instructions:'Roast vegetables, cook pasta, and toss together.',source:''})})],
 };
 let recipes=[{id:'recipe-1',title:'Roasted vegetable pasta',ingredients:'Pasta\nSeasonal vegetables\nOlive oil',instructions:'Roast vegetables, cook pasta, and toss together.',categories:['Dinner','Meatless'],favorite:true,wantToCook:false,yield:'4 servings',prepTime:'10min',cookTime:'20min',totalTime:'30min',notes:'Serve with a green salad.',nutrition:'A fictional nutrition note.',revision:1,images:[]},{id:'recipe-2',title:'Apple oatmeal',ingredients:'Oats\nApples\nMilk',instructions:'Simmer oats with milk and top with chopped apples.',categories:['Breakfast'],yield:'2 servings',totalTime:'15min',revision:1,images:[]}];
 const subscriptions=new Set();
 const data=message=>{
  if(message.type==='hearthglance_recipes/subscribe')return {recipes:structuredClone(recipes),total:recipes.length};
  if(message.type==='todo/item/subscribe')return {items:structuredClone(todos[message.entity_id]||[])};
  if(message.type==='weather/subscribe_forecast')return {forecast:Array.from({length:7},(_,n)=>({datetime:day(n).toISOString(),condition:n%3?'sunny':'partlycloudy',temperature:21+n%4,templow:12+n%3}))};
  return {events:structuredClone((calendars[message.entity_id]||[]).filter(e=>new Date(e.start)<new Date(message.end)&&new Date(e.end)>new Date(message.start)))};
 };
 const notify=()=>{for(const s of subscriptions)s.callback(data(s.message));};
 const states=Object.fromEntries([...config.calendars.map(c=>c.entity),...Object.keys(todos)].map(id=>[id,{state:'on',attributes:{supported_features:7,friendly_name:id}}]));
 for(const [id,state,unit] of [['sensor.solar_power','4.42','kW'],['sensor.solar_today','18.6','kWh'],['sensor.solar_forecast_today','32.8','kWh'],['sensor.solar_tomorrow','35.2','kWh'],['sensor.solar_forecast_day_2','28.4','kWh'],['sensor.solar_forecast_day_3','22.6','kWh'],['sensor.solar_forecast_day_4','36.8','kWh'],['sensor.solar_forecast_day_5','31.5','kWh']])states[id]={state,attributes:{unit_of_measurement:unit}};
 states['weather.home']={state:'partlycloudy',attributes:{temperature:22,temperature_unit:'°C'}};
 return {
  connected:true,states,
  connection:{async subscribeMessage(callback,message){const entry={callback,message};subscriptions.add(entry);queueMicrotask(()=>{if(subscriptions.has(entry))callback(data(message));});return ()=>subscriptions.delete(entry);}},
  async callApi(method,path){const [resource,query]=path.split('?'),params=new URLSearchParams(query);return data({type:'calendar/event/subscribe',entity_id:resource.split('/')[1],start:params.get('start'),end:params.get('end')}).events;},
  async callWS(command){
   if(command.type.startsWith('hearthglance_recipes/')){
    if(command.type.endsWith('/save')){const old=recipes.find(r=>r.id===command.recipe_id);let id=old?.id;if(old){if(old.revision!==command.revision)throw new Error('Recipe changed');Object.assign(old,command.recipe,{revision:old.revision+1});}else{id=`recipe-${next++}`;recipes.push({id,revision:1,images:[],...command.recipe});}notify();return {recipe_id:id};}
    if(command.type.endsWith('/delete'))recipes=recipes.filter(r=>r.id!==command.recipe_id);
    notify();return {recipes:structuredClone(recipes),total:recipes.length};
   }
   const rows=calendars[command.entity_id]||[];
   if(command.type==='calendar/event/delete')calendars[command.entity_id]=rows.filter(e=>e.uid!==command.uid);
   else{const payload={...command.event,start:command.event.dtstart,end:command.event.dtend};const old=rows.find(e=>e.uid===command.uid);if(old)Object.assign(old,payload);else rows.push({uid:`event-${next++}`,...payload});}
   notify();
  },
  async callService(domain,service,payload,target){
   const id=target.entity_id,rows=todos[id]||[];
   if(service==='add_item')rows.push(task(`task-${next++}`,payload.item,{description:payload.description,due:payload.due_date}));
   else if(service==='remove_item')todos[id]=rows.filter(i=>i.uid!==payload.item);
   else{const item=rows.find(i=>i.uid===payload.item);if(item){if(payload.rename)item.summary=payload.rename;if(payload.status)item.status=payload.status;if(payload.description!==undefined)item.description=payload.description;if(payload.due_date)item.due=payload.due_date;}}
   notify();
  },
 };
}
