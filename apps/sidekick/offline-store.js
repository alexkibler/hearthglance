const CACHE='hearthglance-private-data-v1';
const LEGACY='hearthglance-web-v1';
// The saved record contains dashboard data only, never an HA token or CSRF token.
export class OfflineStore {
 constructor(storage=globalThis.caches,legacy=globalThis.localStorage,base=globalThis.location?.href){
  this.storage=storage;this.legacy=legacy;this.key=new URL('./offline-snapshot',base).href;
  this.epoch=0;this.pending=Promise.resolve();
 }
 async read(){
  try{const response=await (await this.storage.open(CACHE)).match(this.key);if(response)return response.json();}catch{}
  try{return JSON.parse(this.legacy.getItem(LEGACY));}catch{return null;}
 }
 write(record){
  const epoch=this.epoch,body=JSON.stringify(record);
  this.pending=this.pending.catch(()=>false).then(async()=>{
   if(epoch!==this.epoch)return false;
   try{
    const cache=await this.storage.open(CACHE);
    await cache.put(this.key,new Response(body,{headers:{'Content-Type':'application/json'}}));
    try{this.legacy.removeItem(LEGACY);}catch{}
    return true;
   }catch{
    try{this.legacy.setItem(LEGACY,body);return true;}catch{return false;}
   }
  });
  return this.pending;
 }
 async clear(){
  this.epoch++;
  await this.pending.catch(()=>{});
  try{await this.storage.delete(CACHE);}catch{}
  try{this.legacy.removeItem(LEGACY);}catch{}
 }
}
