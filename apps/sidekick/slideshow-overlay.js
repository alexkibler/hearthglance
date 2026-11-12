// Family Photos slideshow, built into the dashboard. It plays full-screen over whatever page is open, and one
// tap returns to exactly that view. Live album changes arrive over api/photos/events only while it plays.
import {Slideshow} from './ui/slideshow.js';
import {IdleTimer,resolveIdle,onIdle} from './ui/idle.js';

const clamp=(value,low,high,fallback)=>Number.isFinite(value)?Math.min(high,Math.max(low,value)):fallback;

// Decode before showing to avoid a jank frame, but never wait on decode() forever: Chromium can hold it while
// the page is hidden, and a failed load must still reject so playback skips the photo.
export function imageLayer(img,base){
 return {
  load:url=>new Promise((resolve,reject)=>{
   img.onload=()=>{const done=()=>resolve();Promise.race([img.decode(),new Promise(r=>setTimeout(r,2000))]).then(done,done);};
   img.onerror=()=>reject(new Error('Photo did not load'));
   img.src=new URL(url,base).href;
  }),
  show:()=>img.classList.add('visible'),
  hide:()=>img.classList.remove('visible'),
  clear:()=>{img.classList.remove('visible');img.removeAttribute('src');},
 };
}

export class SlideshowOverlay {
 // Created once per page. attach() connects it to the signed-in dashboard's photo library (again after re-sign-in).
 constructor({root,search='',base,EventSourceImpl=globalThis.EventSource,timers,layers,doc=globalThis.document}){
  const params=new URLSearchParams(search);
  Object.assign(this,{root,base,EventSourceImpl,doc,params,search,timers,layers});
  this.library=null;this.kiosk=()=>false;this.events=null;this.retry=5000;this.retryTimer=null;
  this.idle=new IdleTimer({minutes:0,onIdle:()=>this.idleFired(),...(timers?{timers}:{})});
  this.slideshow=this.player(12);
  root.addEventListener('click',()=>this.stop());
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.playing)this.stop();});
  for(const type of ['pointerdown','keydown','touchstart','wheel'])doc.addEventListener(type,()=>{if(!this.playing&&this.library)this.idle.poke();},{passive:true});
  if(params.get('debug')==='1')this.debug();
 }
 player(defaultSeconds){
  const seconds=clamp(Number(this.params.get('interval')||defaultSeconds||12),3,300,12);
  return new Slideshow({layers:this.layers||[...this.root.querySelectorAll('.slide')].map(img=>imageLayer(img,this.base)),
   interval:seconds*1000,...(this.timers?{timers:this.timers}:{}),
   empty:value=>{const el=this.root.querySelector('.slideshow-empty');if(el)el.hidden=!value;}});
 }
 attach({library,settings={},kiosk=()=>true,device}){
  this.detach();
  this.library=library;this.kiosk=kiosk;this.settings=settings;
  this.slideshow=this.player(settings.interval);
  this.idleSetting=resolveIdle({search:this.search,device,server:settings.idle??5});
  this.idle=new IdleTimer({minutes:this.idleSetting.minutes,onIdle:()=>this.idleFired(),...(this.timers?{timers:this.timers}:{})});
  this.unsubscribe=library.subscribe(()=>{if(this.playing)this.slideshow.update(library.photos);});
 }
 // Settings changed this device's idle time. An ?idle= in the address still takes priority.
 setDeviceIdle(device){
  this.idleSetting=resolveIdle({search:this.search,device,server:this.settings?.idle??5});
  this.idle.setMinutes(this.idleSetting.minutes);
  if(!this.playing&&this.library)this.idle.poke();else this.idle.stop();
  if(this.playing)this.idle.stop();
 }
 detach(){this.stop();this.idle.stop();this.unsubscribe?.();this.unsubscribe=null;this.library=null;}
 get playing(){return !this.root.hidden;}
 // Called once the dashboard has mounted.
 ready(){if(!this.library)return;if(this.params.get('slideshow')==='1')this.start();else this.idle.poke();}
 start(){
  if(this.playing||!this.library)return;
  this.idle.stop();
  this.root.hidden=false;this.root.classList.remove('settled');setTimeout(()=>this.root.classList.add('settled'),100);
  this.doc.documentElement.classList.add('slideshow-open');
  this.slideshow.start(this.library.photos);
  this.library.load();this.listen();
 }
 stop(){
  if(!this.playing)return;
  this.slideshow.stop();this.root.hidden=true;
  this.doc.documentElement.classList.remove('slideshow-open');
  this.close();this.idle.poke();
 }
 // Idle start is for wall-sized screens only, and never over an empty album or an upload in progress.
 // If there's nothing to show yet, the dashboard stays up and the check repeats after another quiet period.
 async idleFired(){
  if(this.playing||!this.library)return;
  if(!this.kiosk()||this.library.busy){this.idle.poke();return;}
  await this.library.load();
  if(!this.playing&&onIdle({playing:false,photos:this.library.photos})==='play')this.start();
  else if(!this.playing)this.idle.poke();
 }
 listen(){
  if(!this.EventSourceImpl||this.events)return;
  const events=this.events=new this.EventSourceImpl(new URL('api/photos/events',this.base).href);
  events.addEventListener('open',()=>{this.retry=5000;this.root.classList.remove('reconnecting');this.library.load();});
  events.addEventListener('photos',event=>{
   let version=null;try{version=JSON.parse(event.data).version;}catch{}
   if(version!==this.library.version)this.library.load();
  });
  events.addEventListener('error',()=>{
   this.root.classList.add('reconnecting');                         // the last slide stays up
   // The browser retries by itself unless the server refused the stream (401/503); then back off and reopen.
   if(events.readyState===2&&this.events===events){
    this.events=null;events.close();
    clearTimeout(this.retryTimer);
    this.retryTimer=setTimeout(()=>{if(this.playing)this.listen();},this.retry);
    this.retry=Math.min(this.retry*2,60000);
   }
  });
 }
 close(){clearTimeout(this.retryTimer);this.events?.close();this.events=null;this.root.classList.remove('reconnecting');}
 debug(){
  const panel=this.doc.createElement('pre');panel.className='slideshow-debug';panel.setAttribute('aria-hidden','true');this.doc.body.append(panel);
  const update=()=>{const w=globalThis.innerWidth,h=globalThis.innerHeight,r=globalThis.devicePixelRatio;
   panel.textContent=`${w}×${h} CSS px @${r}x = ${Math.round(w*r)}×${Math.round(h*r)}\n`+
    `slideshow ${this.playing?'playing':'off'} · stream ${this.events?['connecting','open','closed'][this.events.readyState]:'off'} · `+
    `${this.library?.photos.length??0} photos · idle ${this.idle.enabled?Math.round(this.idle.ms/60000)+' min':'off'}`;};
  update();setInterval(update,1000);globalThis.addEventListener?.('resize',update);
 }
}
