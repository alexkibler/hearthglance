// The UI consumes this small adapter instead of Home Assistant's frontend runtime.
export function snapshotRange(now=new Date()) {
  const start=new Date(now.getFullYear(),now.getMonth(),1);
  start.setDate(start.getDate()-start.getDay());
  const end=new Date(start);end.setDate(end.getDate()+42);
  return {start:start.toISOString(),end:end.toISOString()};
}

export function inside(snapshot, command) {
  return snapshot && new Date(command.start)>=new Date(snapshot.start) && new Date(command.end)<=new Date(snapshot.end);
}

export function message(snapshot, command) {
  if(command.type==='todo/item/subscribe')return {items:snapshot.todos[command.entity_id]||[]};
  if(command.type==='hearthglance_recipes/subscribe')return {recipes:snapshot.recipes,total:snapshot.recipes.length};
  if(command.type==='weather/subscribe_forecast')return {forecast:snapshot.forecast};
  if(command.type==='calendar/event/subscribe')return {events:(snapshot.calendars[command.entity_id]||[]).filter(e=>{
    const raw=value=>typeof value==='object'?value.dateTime||value.date:value;
    // Keep all-day dates local, just as the UI does.
    const date=value=>{const v=raw(value);return new Date(/^\d{4}-\d{2}-\d{2}$/.test(v)?v+'T00:00:00':v);};
    return date(e.start)<new Date(command.end)&&date(e.end)>new Date(command.start);
  })};
  throw new Error('Unsupported subscription');
}

export class Bridge {
  constructor({snapshot,request,save,status,updated,csrf}) {
    this.snapshot=snapshot;this.request=request;this.save=save;this.status=status;this.updated=updated;
    this.csrf=csrf;this.subscriptions=new Set();this.connected=true;this.states=snapshot.states;
    this.connection={subscribeMessage:(callback,command)=>this.subscribe(callback,command)};
  }
  async subscribe(callback,command) {
    const entry={callback,command,last:null};this.subscriptions.add(entry);
    try {
      if(command.type==='calendar/event/subscribe'&&!inside(this.snapshot,command))await this.refresh(false,command);
      if(this.subscriptions.has(entry))this.deliver(entry);
    } catch(error) {this.subscriptions.delete(entry);throw error;}
    return ()=>this.subscriptions.delete(entry);
  }
  deliver(entry) {
    const data=message(this.snapshot,entry.command),serialized=JSON.stringify(data);
    if(serialized!==entry.last){entry.last=serialized;entry.callback(data);}
  }
  async refresh(force=false,range=this.snapshot) {
    if(this.pending){await this.pending;if(!inside(this.snapshot,range))return this.refresh(force,range);return;}
    this.pending=(async()=>{
      try {
        const delta=await this.request('api/snapshot?'+new URLSearchParams({start:range.start,end:range.end,known:JSON.stringify(this.snapshot.hashes||{}),...(force?{refresh:'1'}:{})}));
        const snapshot={...this.snapshot,...delta};
        // Retain references to unchanged states so solar checks do not repaint needlessly.
        for(const [id,state] of Object.entries(snapshot.states))if(JSON.stringify(state)===JSON.stringify(this.states[id]))snapshot.states[id]=this.states[id];
        this.snapshot=snapshot;this.states=snapshot.states;this.connected=true;this.save(snapshot);
        for(const entry of this.subscriptions)this.deliver(entry);
        this.updated();this.status(true,snapshot);
      } catch(error) {
        if(error.status===401)throw error;
        this.connected=false;this.updated();this.status(false,this.snapshot);
        if(!inside(this.snapshot,range))throw new Error('These dates are not saved. Connect to load them.');
      }
    })();
    try{return await this.pending;}finally{this.pending=null;}
  }
  async write(path,body) {
    if(!this.connected)throw new Error('You are offline. Reconnect before saving.');
    const result=await this.request(path,{method:'POST',body:JSON.stringify(body),headers:{'X-HG-CSRF':this.csrf}});
    // A confirmed write must never be retried if the following read fails.
    try{await this.refresh(true);}catch(error){if(error.status===401)throw error;}
    return result;
  }
  callWS(command){return this.write('api/command',command);}
  callService(domain,service,data,target){return this.write('api/service',{domain,service,data,target});}
  async callApi(method,path) {
    if(method!=='GET'||!path.startsWith('calendars/'))throw new Error('Unsupported read');
    const [resource,query]=path.split('?'),params=new URLSearchParams(query);
    const command={type:'calendar/event/subscribe',entity_id:resource.split('/')[1],start:params.get('start'),end:params.get('end')};
    if(!inside(this.snapshot,command)) {
      if(!this.connected)throw new Error('These dates are not saved. Connect to load them.');
      return this.request('api/calendar?'+new URLSearchParams({entity:command.entity_id,start:command.start,end:command.end}));
    }
    return message(this.snapshot,command).events;
  }
}
