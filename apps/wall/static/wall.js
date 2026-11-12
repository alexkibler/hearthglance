// Wall Display client: clock, live album updates over Server-Sent Events, and the manual slideshow.
import {Slideshow} from './slideshow.js';
import {Album} from './album.js';

const body=document.body,base=new URL('../',location.href);
const $=selector=>document.querySelector(selector);
const home=$('#home'),show=$('#slideshow'),connection=$('#connection');
const params=new URLSearchParams(location.search);
const seconds=Number(params.get('interval')||body.dataset.interval)||12;
const state={photos:[],connected:true,events:null,retry:5000};

function tick(){
 const now=new Date();
 $('#time').textContent=now.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}).replace(/\s?[AP]M$/i,'');
 $('#date').textContent=now.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'});
}
tick();setInterval(tick,15000);

function layer(img){
 return {
  load:url=>{img.src=new URL(url,base).href;return img.decode();},
  show:()=>img.classList.add('visible'),
  hide:()=>img.classList.remove('visible'),
  clear:()=>{img.classList.remove('visible');img.removeAttribute('src');},
 };
}
const slideshow=new Slideshow({layers:[...show.querySelectorAll('.slide')].map(layer),interval:Math.min(300,Math.max(3,seconds))*1000,
 empty:value=>{show.querySelector('.slideshow-empty').hidden=!value;}});

function setConnected(value){
 state.connected=value;
 // Keep whatever is on screen; only say that updates are paused.
 connection.hidden=value;
}
function count(n){const el=$('#count');if(el)el.textContent=n?`${n} photo${n===1?'':'s'}`:'No photos yet';}

const album=new Album({
 request:()=>fetch(new URL('api/photos',base),{credentials:'same-origin',cache:'no-store'}),
 apply:data=>{state.photos=data.photos;count(state.photos.length);slideshow.update(state.photos);},
 unauthorized:()=>location.reload(),                               // the server renders the sign-in view
 offline:()=>setConnected(false),
});
const refresh=()=>album.refresh();

function listen(){
 if(body.dataset.state!=='ready'||!('EventSource' in window))return;
 const events=state.events=new EventSource('events');
 events.addEventListener('open',()=>{state.retry=5000;setConnected(true);refresh();});   // catch anything missed
 events.addEventListener('photos',event=>{
  album.notice(JSON.parse(event.data).version);
 });
 events.addEventListener('error',()=>{
  setConnected(false);
  // The browser retries on its own unless the server refused the stream (401/503); then back off and reopen.
  if(events.readyState===EventSource.CLOSED){
   setTimeout(()=>{refresh();listen();},state.retry);state.retry=Math.min(state.retry*2,60000);
  }
 });
}

function play(){
 home.hidden=true;show.hidden=false;show.classList.remove('settled');
 setTimeout(()=>show.classList.add('settled'),100);
 slideshow.start(state.photos);
}
function stop(){slideshow.stop();show.hidden=true;home.hidden=false;$('#play')?.focus();}

document.addEventListener('click',event=>{
 if(event.target.closest('#play')){play();return;}
 if(!show.hidden)stop();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!show.hidden)stop();});

if(body.dataset.state==='ready'){refresh();listen();}
