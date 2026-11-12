import './ui/hearthglance-card.js';
import {Bridge,snapshotRange} from './bridge.js';
import {PWA} from './pwa.js';
import {OfflineStore} from './offline-store.js';
import {PhotoLibrary} from './ui/photos.js';
import {SlideshowOverlay} from './slideshow-overlay.js';

const root=document.querySelector('#app'),login=document.querySelector('#login'),status=document.querySelector('#status');
const offline=new OfflineStore();
const pwa=new PWA({changed:syncPwaControls,expired:()=>forgetOffline().then(showLogin)});
let bridge,card,session,poll,accountEpoch=0,offlineSaved=false,offlineSaveFailed=false,dismissedWorker,installFocus,savingPreviews=false;
const embedded=window.self!==window.top;
// One slideshow overlay per page; each signed-in dashboard attaches its photo library to it.
const slideshow=new SlideshowOverlay({root:document.querySelector('#slideshow'),search:location.search,base:location.href});
document.documentElement.classList.toggle('embedded',embedded);
async function save(snapshot){
  offlineSaved=await offline.write({config:session.config,snapshot});offlineSaveFailed=!offlineSaved;syncPwaControls();
}
async function forgetOffline(){accountEpoch++;offlineSaved=false;await offline.clear();await pwa.clearPrivate();}
function showLogin(){accountEpoch++;slideshow.detach();root.replaceChildren();login.hidden=false;status.hidden=true;clearTimeout(poll);if(card)card._stop();syncPwaControls();}
async function request(path,options={}) {
  const response=await fetch('./'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error||'Request failed');error.status=response.status;if(response.status===401){await forgetOffline();showLogin();}throw error;}
  return data;
}
function freshness(connected,snapshot) {
  status.hidden=false;
  const updated=new Date(snapshot.updated).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  const text=(connected?'Updated ':'Offline · Saved ')+updated+(snapshot.errors.length?' · Some sources unavailable':'')+(offlineSaveFailed?' · Offline save unavailable':'');
  status.textContent=text;
  status.classList.toggle('offline',!connected);
  card._freshness={text,offline:!connected};
  const phoneStatus=card.shadowRoot.querySelector('.phone-freshness');
  if(phoneStatus){phoneStatus.textContent=text;phoneStatus.classList.toggle('offline',!connected);}
}
function setHass(){
  card.hass={connected:bridge.connected,states:bridge.states,connection:bridge.connection,
    callWS:command=>bridge.callWS(command),callApi:(...args)=>bridge.callApi(...args),callService:(...args)=>bridge.callService(...args)};
}
function mount(config,snapshot,online=true) {
  session=session||{config};
  const epoch=++accountEpoch,active=()=>accountEpoch===epoch;
  bridge=new Bridge({snapshot,request,save:snapshot=>{if(active())save(snapshot);},status:(...args)=>{if(active())freshness(...args);},updated:()=>{if(active())setHass();},csrf:session.csrf});bridge.connected=online;
  card=document.createElement('hearthglance-card');card._standalone=true;
  // Standalone page routing, not HA's router. Use the same UI in an iframe.
  card.setConfig({...config,routes:undefined,page:undefined,type:'custom:hearthglance-card'});
  card._prefs.dark=card._prefs.dark!==false;
  // Photos are Hearthglance-owned and online-only; the tile appears when the server has photo storage configured.
  if(session.photos){
    card._pages=[...card._pages.filter(p=>p!=='settings'),'photos','settings'];
    card._photoLibrary=new PhotoLibrary({csrf:session.csrf,unauthorized:()=>{if(active())forgetOffline().then(showLogin);}});
    // Idle start only on wall-sized layouts; phones open the slideshow from Photos.
    slideshow.attach({library:card._photoLibrary,settings:session.slideshow||{},kiosk:()=>!card._mobile});
  }else slideshow.detach();
  const page=new URLSearchParams(location.search).get('page');
  if(card._pages.includes(page))card._page=page;
  card._view=card._page==='calendar'?'month':'week';
  const originalCards=card._recipeCards;
  card._recipeCards=function(items){const limit=this._recipeLimit||24;return originalCards.call(this,items.slice(0,limit))+(items.length>limit?'<button class="btn" data-action="recipe-more">Show more recipes</button>':'');};
  const originalInput=card._recipeInput;
  card._recipeInput=function(event){this._recipeLimit=24;return originalInput.call(this,event);};
  const originalClick=card._click;
  card._click=async function(event){
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='slideshow'){slideshow.start();return;}
    if(action==='recipe-more'){this._recipeLimit=(this._recipeLimit||24)+24;this._renderRecipeResults();return;}
    if(action==='pwa-install'){await install();return;}
    if(action==='pwa-update'){if(pwa.waiting)pwa.update();else this._toast(await pwa.check().catch(()=>'Could not check for updates. Try again when connected.'));return;}
    if(action==='pwa-save-previews'){
      if(savingPreviews)return;
      const progress=this.shadowRoot.querySelector('[data-offline-progress]');
      if(!bridge.connected){progress.textContent='Connect to download recipe previews.';return;}
      const control=event.target.closest('button');control.disabled=true;savingPreviews=true;
      try{
        const result=await pwa.savePreviews(bridge.snapshot,(done,total)=>{progress.textContent=`Saving recipe previews… ${done}/${total}`;});
        progress.textContent=result.failed?`Saved ${result.saved} previews; some photos are unavailable.`:`${result.saved} recipe previews saved for offline browsing.`;
      }catch(error){progress.textContent=error.message;}
      finally{control.disabled=false;savingPreviews=false;}return;
    }
    if(action==='sign-out'){
      try{await request('api/logout',{method:'POST',body:'{}',headers:{'X-HG-CSRF':session.csrf}});}catch(error){if(error.status!==401){this._toast('Connect before signing out.');return;}}
      await forgetOffline();showLogin();return;
    }
    if(action==='refresh'){
      if(!session.csrf){location.reload();return;}
      try{await bridge.refresh(true);}catch(error){this._toast(error.message);}return;
    }
    return originalClick.call(this,event);
  };
  const originalSettings=card._settings;
  card._settings=function(){originalSettings.call(this);const panel=this.shadowRoot.querySelector('.settings-options');
    panel.querySelector('a[href="/config"]')?.remove();
    panel.insertAdjacentHTML('beforeend','<div data-pwa-controls></div><p class="section-note">Hearthglance runs independently. Home Assistant supplies your data.</p><button class="btn" data-action="sign-out">Sign out</button>');syncPwaControls();
  };
  const originalRender=card._renderMain;
  card._renderMain=function(){this.shadowRoot.querySelector('.app')?.setAttribute('data-page',this._page);return originalRender.call(this);};
  // No HA logo navigation or requirement to load its frontend.
  const originalShell=card._renderShell;
  card._renderShell=function(){originalShell.call(this);for(const link of this.shadowRoot.querySelectorAll('a.ha-home')){link.href='./';link.title='Hearthglance';link.setAttribute('aria-label','Hearthglance home');}
    // The slideshow is an action, not a page: it plays over the current view and a tap returns to it.
    if(this._photoLibrary)this.shadowRoot.querySelector('.rail .nav[data-page="photos"]')?.insertAdjacentHTML('afterend','<button type="button" class="nav" data-action="slideshow" aria-label="Slideshow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4ZM10 9v6l5-3Z"/></svg><span>Slideshow</span></button>');};
  card._renderShell();root.replaceChildren(card);login.hidden=true;
  setHass();freshness(online,snapshot);
  slideshow.ready();
  if(online)save(snapshot);
  function schedule(){clearTimeout(poll);poll=setTimeout(async()=>{if(!document.hidden){try{await bridge.refresh();}catch(error){if(error.status===401)return;}}schedule();},60000);}
  schedule();
}
async function start(){
  let saved=await offline.read();offlineSaved=Boolean(saved);
  try {
    session=await request('api/session');
    if(saved?.snapshot.cache_id&&saved.snapshot.cache_id!==session.cache_id){await forgetOffline();saved=null;}
    const range=snapshotRange();
    let snapshot;
    try{snapshot=await request('api/snapshot?'+new URLSearchParams(range));}
    catch(error){if(error.status===401||!saved)throw error;mount(session.config,saved.snapshot,false);return;}
    mount(session.config,snapshot);
  } catch(error){
    if(error.status!==401&&saved){mount(saved.config,saved.snapshot,false);return;}
    showLogin();if(error.status!==401)document.querySelector('#login-error').textContent='The server is unavailable. Try again when connected.';
  }
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&bridge&&session?.csrf)bridge.refresh().catch(()=>{});});
window.addEventListener('online',()=>{if(bridge&&session?.csrf)bridge.refresh().catch(()=>{});else start();});
window.addEventListener('pagehide',()=>clearTimeout(poll));
function syncPwaControls(){
 const installButton=document.querySelector('#install-login');
 installButton.hidden=pwa.isInstalled&&!pwa.embedded;installButton.textContent=pwa.label();
 const notice=document.querySelector('#pwa-update');
 notice.hidden=!pwa.waiting||pwa.registration.waiting===dismissedWorker;
 const controls=card?.shadowRoot.querySelector('[data-pwa-controls]');
 if(controls&&!savingPreviews)controls.innerHTML=`<h3>App &amp; offline access</h3>${pwa.isInstalled?'<p class="section-note">Installed on this device.</p>':`<button class="btn" data-action="pwa-install">${pwa.label()}</button>`}<p class="section-note">${offlineSaved?'Your dashboard is saved on this device.':'Your dashboard will be saved after it loads online.'} ${pwa.offlineReady?'Offline app ready.':'Preparing offline app…'}</p><button class="btn" data-action="pwa-save-previews">Save recipe previews for offline</button><p class="section-note" data-offline-progress role="status"></p><button class="btn" data-action="pwa-update">${pwa.waiting?'Reload to update':'Check for app updates'}</button>`;
}
async function install(){
 if(await pwa.install())return;
 const instructions=document.querySelector('#install-instructions');
 instructions.innerHTML=pwa.embedded?'<p>Open Hearthglance on its own before installing.</p><a class="button" href="./" target="_top">Open Hearthglance</a>':
  '<ol><li>Open Hearthglance in <strong>Safari</strong> on your iPhone.</li><li>Tap <strong>Share</strong> (the square with an upward arrow). You may need to open the page menu first.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>If shown, turn on <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</li></ol><p>Open the new icon while online so your dashboard is saved for offline use. Sign in if prompted.</p>'+(pwa.isApple?'':'<p>On other browsers, use the browser’s <strong>Install app</strong> or <strong>Add to Home Screen</strong> menu.</p>');
 installFocus=card?.shadowRoot.activeElement||document.activeElement;
 document.querySelector('#install-help').hidden=false;document.querySelector('#install-close').focus();
}
function closeInstall(){document.querySelector('#install-help').hidden=true;installFocus?.focus();}
document.querySelector('#install-login').addEventListener('click',install);
document.querySelector('#install-close').addEventListener('click',closeInstall);
document.querySelector('#install-help').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeInstall();}
 if(event.key==='Tab'){
  const elements=[...document.querySelectorAll('#install-help a,#install-help button')],first=elements[0],last=elements.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
document.querySelector('#update-now').addEventListener('click',()=>pwa.update());
document.querySelector('#update-later').addEventListener('click',()=>{dismissedWorker=pwa.registration?.waiting;syncPwaControls();});
pwa.register();
start();
