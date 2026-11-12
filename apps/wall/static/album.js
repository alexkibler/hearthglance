// The Wall's view of the album. Refreshes may overlap (stream open, initial event, later events); only the newest
// request is applied, so an older response can never bring back a removed photo. Any version different from the
// last applied one triggers a refresh, which also covers the server's counter restarting from zero.
export class Album {
 constructor({request,apply,unauthorized=()=>{},offline=()=>{}}){
  Object.assign(this,{request,apply,unauthorized,offline});
  this.requests=0;this.version=null;
 }
 async refresh(){
  const request=++this.requests;
  try{
   const response=await this.request();
   if(request!==this.requests)return 'stale';
   if(response.status===401){this.unauthorized();return 'signed-out';}
   if(!response.ok)return 'error';
   const data=await response.json();
   if(request!==this.requests)return 'stale';
   this.version=data.version;this.apply(data);return 'applied';
  }catch{
   if(request===this.requests)this.offline();
   return 'offline';
  }
 }
 notice(version){return version===this.version?Promise.resolve('current'):this.refresh();}
}
