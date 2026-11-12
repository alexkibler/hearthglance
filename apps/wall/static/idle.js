// Starts the slideshow after a quiet period. Any touch, click or key press restarts the countdown.
export class IdleTimer {
 constructor({minutes,onIdle,timers={set:(f,ms)=>setTimeout(f,ms),clear:id=>clearTimeout(id)}}){
  this.ms=Math.max(0,Number(minutes)||0)*60000;Object.assign(this,{onIdle,timers});this.timer=null;
 }
 get enabled(){return this.ms>0;}
 poke(){
  this.timers.clear(this.timer);this.timer=null;
  if(this.enabled)this.timer=this.timers.set(()=>{this.timer=null;this.onIdle();},this.ms);
 }
 stop(){this.timers.clear(this.timer);this.timer=null;}
 get armed(){return this.timer!==null;}
}

// Idle playback only makes sense with something to show: an empty album keeps the dashboard up, and the
// countdown is armed again when the first photo arrives. (Manual Play can still show the empty state.)
export function onIdle({playing,photos}){return !playing&&photos.length?'play':'wait';}
export function onAlbum({playing,photos,timer}){return timer.enabled&&!playing&&photos.length&&!timer.armed?'arm':'none';}

// Per-kiosk override: ?idle=<minutes>, 0 turns it off, otherwise 1–240. Falls back to the server setting.
export function idleMinutes(query,serverValue){
 const raw=new URLSearchParams(query).get('idle');
 const value=raw===null||raw===''?Number(serverValue):Number(raw);
 return Number.isFinite(value)&&value>=0?Math.min(240,Math.floor(value)):0;
}
