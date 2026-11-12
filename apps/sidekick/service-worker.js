// This template is versioned with the complete app shell by build.mjs.
const BUILD='__BUILD_ID__';
const SHELL='hearthglance-shell-'+BUILD;
const THUMBNAILS='hearthglance-private-thumbnails-v1';
const PHOTOS='hearthglance-private-photos-v1';
const ASSETS=['./','./app.js','./app.css','./icon.svg','./manifest.webmanifest',
 './icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];
const base=new URL(self.registration.scope);
const assetURLs=new Set(ASSETS.map(path=>new URL(path,base).href));
let privateEpoch=0;
let writes=Promise.resolve();

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(ASSETS.map(path=>new Request(new URL(path,base),{cache:'reload'})))));
 // Existing clients keep their working version until they choose Reload.
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('hearthglance-shell-')&&key!==SHELL).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

async function clearPrivate(){
 privateEpoch++;
 await writes.catch(()=>{});
 await Promise.all((await caches.keys()).filter(key=>key.startsWith('hearthglance-private-')).map(key=>caches.delete(key)));
}

async function saveImage(request,response,thumbnail,epoch){
 const size=Number(response.headers.get('Content-Length'));
 const limit=thumbnail?64*1024:1024*1024;
 if(!Number.isFinite(size)||size<=0||size>limit)return;
 const copy=response.clone();
 writes=writes.catch(()=>{}).then(async()=>{
  if(epoch!==privateEpoch)return;
  try{
   const cache=await caches.open(thumbnail?THUMBNAILS:PHOTOS);
   await cache.put(request,copy);
   const keys=await cache.keys(),maximum=thumbnail?200:6;
   await Promise.all(keys.slice(0,Math.max(0,keys.length-maximum)).map(key=>cache.delete(key)));
  }catch{/* Browsing still works when the device's offline storage is full. */}
 });
 await writes;
}

async function image(request,thumbnail){
 const epoch=privateEpoch;
 const cache=await caches.open(thumbnail?THUMBNAILS:PHOTOS);
 const saved=await cache.match(request);
 if(saved)return saved;
 try{
  const response=await fetch(request);
  if(response.status===401||response.status===403){
   await clearPrivate();
   const clients=await self.clients.matchAll();
   clients.forEach(client=>client.postMessage({type:'PRIVATE_EXPIRED'}));
  }else if(response.ok&&response.headers.get('Content-Type')?.startsWith('image/')){
   await saveImage(request,response,thumbnail,epoch);
  }
  return response;
 }catch{return new Response('',{status:503,statusText:'Photo is not saved offline'});}
}

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 const canonical=new URL(url.pathname,base.origin).href;
 if(assetURLs.has(canonical)){
  // A versioned shell stays consistent across navigation, assets, and offline launches.
  event.respondWith(caches.open(SHELL).then(async cache=>(await cache.match(canonical))||fetch(request)));
  return;
 }
 const path=url.pathname.slice(base.pathname.length);
 const photo=/^api\/hearthglance_recipes\/image\/[a-f0-9]{64}\/(photo|thumb)$/.exec(path);
 if(photo&&/^[a-f0-9]{24}$/.test(url.searchParams.get('cache')||'')){
  event.respondWith(image(request,photo[1]==='thumb'));
 }
 // Auth flows, API JSON and every write always use the network.
});

self.addEventListener('message',event=>{
 const reply=value=>event.ports[0]?.postMessage(value);
 if(event.data?.type==='SKIP_WAITING'){event.waitUntil(self.skipWaiting());return;}
 if(event.data?.type==='CLEAR_PRIVATE'){
  event.waitUntil(clearPrivate().then(()=>reply({ok:true})));return;
 }
 if(event.data?.type==='CACHE_STATUS'){
  event.waitUntil((async()=>{
   const count=async name=>(await (await caches.open(name)).keys()).length;
   reply({build:BUILD,thumbnails:await count(THUMBNAILS),photos:await count(PHOTOS)});
  })());
 }
});
