export function appleMobile(nav=navigator){
 return /iPhone|iPad|iPod/.test(nav.userAgent)||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
}
export function installed(win=window,nav=navigator){
 return Boolean(nav.standalone||win.matchMedia('(display-mode: standalone)').matches);
}

export class PWA {
 constructor({changed=()=>{},expired=()=>{}}={}){
  this.changed=changed;this.expired=expired;this.embedded=window.self!==window.top;
  this.isInstalled=installed();this.isApple=appleMobile();this.prompt=null;this.registration=null;this.applying=false;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();this.prompt=event;this.changed();});
  window.addEventListener('appinstalled',()=>{this.isInstalled=true;this.prompt=null;this.changed();});
  if('serviceWorker' in navigator){
   navigator.serviceWorker.addEventListener('controllerchange',()=>{this.changed();if(this.applying)location.reload();});
   navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='PRIVATE_EXPIRED')this.expired();});
  }
 }
 async register(){
  if(!('serviceWorker' in navigator))return;
  try{
   this.registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
   this.registration.addEventListener('updatefound',()=>{
    const worker=this.registration.installing;
    worker?.addEventListener('statechange',()=>{if(worker.state==='installed')this.changed();});
   });
   this.changed();
   navigator.serviceWorker.ready.then(()=>this.changed());
   await this.registration.update();
  }catch{this.changed();}
 }
 get waiting(){return Boolean(this.registration?.waiting);}
 get offlineReady(){return Boolean(navigator.serviceWorker?.controller);}
 label(){return this.embedded?'Open app to install':this.isApple?'Add to iPhone Home Screen':'Install Hearthglance';}
 async install(){
  if(this.prompt){
   const prompt=this.prompt;this.prompt=null;
   await prompt.prompt();await prompt.userChoice;this.changed();return true;
  }
  return false;
 }
 async check(){
  if(!this.registration)await this.register();
  await this.registration?.update();this.changed();
  return this.waiting?'An update is ready. Choose Reload to update.':this.registration?.installing?'Downloading the update…':'You’re up to date.';
 }
 update(){
  if(!this.registration?.waiting)return;
  this.applying=true;this.registration.waiting.postMessage({type:'SKIP_WAITING'});
 }
 async rpc(type,timeout=2000){
  const worker=navigator.serviceWorker?.controller;
  if(!worker)return null;
  return new Promise(resolve=>{
   const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},timeout);
   channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
   worker.postMessage({type},[channel.port2]);
  });
 }
 async clearPrivate(){
  await this.rpc('CLEAR_PRIVATE');
  // Also handles browsers with an older worker that does not understand the message.
  if('caches' in window)await Promise.all((await caches.keys()).filter(key=>key.startsWith('hearthglance-private-')).map(key=>caches.delete(key)));
 }
 async savePreviews(snapshot,progress=()=>{}){
  if(!this.offlineReady)throw new Error('Offline setup is finishing. Please try again shortly.');
  if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
  const photos=[...new Set(snapshot.recipes.flatMap(recipe=>(recipe.images||[]).map(image=>image.thumb)).filter(Boolean))].slice(0,200);
  let next=0,complete=0,failed=0,expired=false;
  const download=async()=>{
   while(next<photos.length&&!expired){
    const url=photos[next++];
    try{
     const response=await fetch(url,{credentials:'same-origin'});
     if(response.status===401){expired=true;throw new Error('Please sign in again.');}
     if(!response.ok)failed++;
    }catch(error){if(expired)throw error;failed++;}
    progress(++complete,photos.length);
   }
  };
  await Promise.all([download(),download()]);
  const status=await this.rpc('CACHE_STATUS');
  return {total:photos.length,failed,saved:status?.thumbnails||0};
 }
}
