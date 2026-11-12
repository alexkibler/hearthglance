// Slideshow playback over two image layers: the front one is visible, the back one preloads the next photo.
// Only these two images are ever decoded, which keeps memory flat on the Pi and the Fire.
export class Slideshow {
 constructor({layers,interval=12000,fade=1500,timers={set:(f,ms)=>setTimeout(f,ms),clear:id=>clearTimeout(id)},empty=()=>{}}){
  Object.assign(this,{layers,interval,fade,timers,empty});
  this.photos=[];this.running=false;this.front=0;this.current=null;this.pending=null;this.ready=false;
  this.position=0;this.skips=0;this.cycle=0;this.loads=0;this.timer=null;this.preloadTimer=null;
 }
 start(photos){
  this.stop();this.running=true;this.photos=photos.slice();this.position=0;this.skips=0;
  return this.advance();
 }
 stop(){
  this.running=false;this.cycle++;this.loads++;this.inflight=null;
  this.timers.clear(this.timer);this.timers.clear(this.preloadTimer);
  for(const layer of this.layers)layer.clear();
  this.current=this.pending=null;this.ready=false;
 }
 // Called whenever the album changes (upload or removal elsewhere).
 update(photos){
  this.photos=photos.slice();
  if(!this.running)return;
  const ids=new Set(this.photos.map(p=>p.id));
  if(!this.photos.length){this.timers.clear(this.timer);for(const layer of this.layers)layer.clear();this.loads++;this.inflight=null;this.current=this.pending=null;this.ready=false;this.empty(true);return;}
  this.empty(false);
  if(this.current===null||!ids.has(this.current))return this.advance();       // removed photo leaves playback now
  const next=this.nextPhoto();
  if(this.pending!==(next&&next.id!==this.current?next.id:null))this.preload(); // a new or removed neighbour
 }
 nextPhoto(){
  const n=this.photos.length;if(!n)return null;
  const at=this.photos.findIndex(p=>p.id===this.current);
  const skip=this.skips%Math.max(1,n-(at<0?0:1));                                 // photos that failed to load
  return at<0?this.photos[(this.position+skip)%n]:this.photos[(at+1+skip)%n];
 }
 preload(){
  this.timers.clear(this.preloadTimer);
  const photo=this.nextPhoto();
  if(!photo||photo.id===this.current){this.loads++;this.inflight=null;this.pending=null;this.ready=false;return Promise.resolve(false);}
  if(this.inflight?.id===photo.id)return this.inflight.promise;                   // same photo already loading
  if(this.ready&&this.pending===photo.id)return Promise.resolve(true);
  const load=++this.loads;
  this.pending=photo.id;this.ready=false;
  const promise=this.layers[1-this.front].load(photo.display).then(()=>{
   if(load!==this.loads)return null;                                              // superseded: the next photo changed
   this.inflight=null;this.ready=true;return true;
  },()=>{
   if(load!==this.loads)return null;
   this.inflight=null;this.pending=null;return false;
  });
  this.inflight={id:photo.id,promise};
  return promise;
 }
 async advance(){
  const cycle=++this.cycle;
  this.timers.clear(this.timer);
  if(!this.running)return;
  if(!this.photos.length){this.empty(true);return;}
  this.empty(false);
  const next=this.nextPhoto();
  if(next.id===this.current){this.schedule(this.interval);return;}                // a single photo stays up
  if(!(this.ready&&this.pending===next.id)){
   const loaded=await this.preload();
   if(cycle!==this.cycle||!this.running)return;
   if(loaded===null){this.schedule(0);return;}
   if(!loaded){this.skips++;this.schedule(Math.min(this.interval,5000));return;}  // offline or failed: keep the last view
  }
  const back=1-this.front;
  this.layers[back].show();this.layers[this.front].hide();
  this.front=back;this.current=this.pending;this.pending=null;this.ready=false;this.skips=0;
  this.position=Math.max(0,this.photos.findIndex(p=>p.id===this.current));
  // Wait for the cross-fade before reusing the old front layer for the next preload.
  this.preloadTimer=this.timers.set(()=>{if(cycle===this.cycle)this.preload();},this.fade);
  this.schedule(this.interval);
 }
 schedule(ms){this.timers.clear(this.timer);this.timer=this.timers.set(()=>this.advance(),ms);}
}
