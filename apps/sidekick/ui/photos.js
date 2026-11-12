// Sidekick Photos: the shared Family Photos album. Upload and removal are online-only; the API contract is docs/photos-api.md.
import {escapeHTML as esc} from './model.js';

const RETRYABLE=new Set([0,400,408,409,429,500,502,503,504,507]);
export const ACCEPT='image/heic,image/heif,image/jpeg,image/png';

export function uploadKey(random=globalThis.crypto){
 if(random?.randomUUID)return 'sk-'+random.randomUUID();
 const bytes=new Uint8Array(16);random.getRandomValues(bytes);
 return 'sk-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

// XMLHttpRequest is the only browser API with upload progress events.
export function xhrUpload(url,file,headers,progress){
 return new Promise(resolve=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',url);xhr.withCredentials=true;
  for(const [name,value] of Object.entries(headers))xhr.setRequestHeader(name,value);
  xhr.upload.onprogress=event=>{if(event.lengthComputable)progress(event.loaded/event.total);};
  xhr.onload=()=>{let body={};try{body=JSON.parse(xhr.responseText||'{}');}catch{}resolve({status:xhr.status,body});};
  xhr.onerror=xhr.ontimeout=xhr.onabort=()=>resolve({status:0,body:{}});
  xhr.timeout=10*60*1000;
  xhr.send(file);
 });
}

export class PhotoLibrary {
 constructor({csrf,base='./',transport=xhrUpload,fetch=(...args)=>globalThis.fetch(...args),online=()=>globalThis.navigator?.onLine!==false,
   unauthorized=()=>{},concurrency=2,key=()=>uploadKey()}={}){
  Object.assign(this,{csrf,base,transport,fetch,online,unauthorized,concurrency,key});
  this.photos=[];this.uploads=[];this.status='idle';this.error='';this.version=null;
  this.listeners=new Set();this.active=0;this.sequence=0;this.removing=new Set();
 }
 subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
 emit(){for(const listener of this.listeners)listener(this);}
 url(path){return new URL(path,new URL(this.base,globalThis.location?.href||'https://app.invalid/')).href;}
 async load(){
  if(!this.online()){this.status='offline';this.emit();return;}
  if(this.status!=='ready')this.status='loading';this.emit();
  try{
   const response=await this.fetch(this.url('api/photos'),{credentials:'same-origin'});
   const body=await response.json().catch(()=>({}));
   if(response.status===401){this.unauthorized();return;}
   if(!response.ok)throw new Error(body.error||'Photos are unavailable right now.');
   this.photos=body.photos;this.version=body.version;this.album=body.album;this.status='ready';this.error='';
  }catch(error){this.status='error';this.error=error.message==='Failed to fetch'?'Connect to see photos.':error.message;}
  this.emit();
 }
 add(files){
  const list=Array.from(files||[]);
  if(!list.length)return [];
  if(!this.online())throw new Error('You are offline. Connect to add photos.');
  const added=list.map(file=>({local:++this.sequence,name:file.name||'Photo',size:file.size,file,key:this.key(),status:'queued',progress:0,error:''}));
  this.uploads.push(...added);this.emit();this.pump();
  return added;
 }
 retry(local){
  const upload=this.uploads.find(u=>u.local===local);
  if(!upload||upload.status!=='failed')return;
  if(!this.online()){upload.error='You are offline. Connect to retry.';this.emit();return;}
  // The same Idempotency-Key makes a retry return the original photo if the first attempt actually finished.
  Object.assign(upload,{status:'queued',progress:0,error:''});this.emit();this.pump();
 }
 dismiss(local){this.uploads=this.uploads.filter(u=>u.local!==local||!['failed','rejected'].includes(u.status));this.emit();}
 pump(){
  while(this.active<this.concurrency){
   const next=this.uploads.find(u=>u.status==='queued');if(!next)return;
   this.active++;this.send(next).finally(()=>{this.active--;this.pump();});
  }
 }
 async send(upload){
  upload.status='uploading';this.emit();
  const headers={'X-HG-CSRF':this.csrf,'Idempotency-Key':upload.key,'Content-Type':upload.file.type||'application/octet-stream'};
  const {status,body}=await this.transport(this.url('api/photos'),upload.file,headers,fraction=>{
   upload.progress=fraction;if(fraction>=1)upload.status='processing';this.emit();
  });
  if(status===200||status===201){
   upload.status='done';upload.file=null;
   if(!this.photos.some(p=>p.id===body.photo.id))this.photos=[...this.photos,body.photo];
   this.uploads=this.uploads.filter(u=>u!==upload);this.emit();return;
  }
  if(status===401){upload.status='failed';upload.error='Sign in again to upload.';this.emit();this.unauthorized();return;}
  upload.error=status===0?'Upload interrupted. Check your connection.':body.error||'Upload failed.';
  upload.status=RETRYABLE.has(status)?'failed':'rejected';
  if(upload.status==='rejected')upload.file=null;
  this.emit();
 }
 async remove(id){
  if(!this.online())throw new Error('You are offline. Connect to remove photos.');
  if(this.removing.has(id))return;
  this.removing.add(id);this.emit();
  try{
   const response=await this.fetch(this.url('api/photos/'+encodeURIComponent(id)),{method:'DELETE',credentials:'same-origin',headers:{'X-HG-CSRF':this.csrf}});
   const body=await response.json().catch(()=>({}));
   if(response.status===401){this.unauthorized();throw new Error('Sign in again to remove photos.');}
   if(!response.ok&&response.status!==404)throw new Error(body.error||'Could not remove the photo.');
   this.photos=this.photos.filter(p=>p.id!==id);
  }finally{this.removing.delete(id);this.emit();}
 }
 get busy(){return this.uploads.some(u=>['queued','uploading','processing'].includes(u.status));}
}

const percent=value=>Math.round(Math.max(0,Math.min(1,value))*100);
const statusText=u=>u.status==='queued'?'Waiting…':u.status==='uploading'?`Uploading ${percent(u.progress)}%`:u.status==='processing'?'Processing…':u.error;

export function photosHTML(library,options={}){
 const {list,viewer}=photoParts(library,options);
 return list.replace('</section>',viewer+'</section>');
}

export function photoParts(library,{online=true,preview=null,confirm=false}={}){
 const uploads=library.uploads.length?`<ul class="photo-uploads" aria-label="Uploads">${library.uploads.map(u=>`<li class="photo-upload ${u.status}" data-upload="${u.local}"><div class="photo-upload-copy"><strong>${esc(u.name)}</strong><span class="photo-upload-status" role="status">${esc(statusText(u))}</span></div>${['uploading','processing','queued'].includes(u.status)?`<progress max="100" value="${u.status==='processing'?100:percent(u.progress)}" aria-label="${esc(u.name)} upload progress"></progress>`:''}${u.status==='failed'?`<button type="button" class="btn small" data-photo-action="retry" data-local="${u.local}">Retry</button>`:''}${['failed','rejected'].includes(u.status)?`<button type="button" class="text-link" data-photo-action="dismiss" data-local="${u.local}" aria-label="Dismiss ${esc(u.name)}">Dismiss</button>`:''}</li>`).join('')}</ul>`:'';
 const picker=online?`<label class="btn primary photo-pick">Add photos<input type="file" class="photo-input" accept="${ACCEPT}" multiple></label>`:`<p class="section-note photo-offline" role="status">You are offline. Connect to add or remove photos.</p>`;
 const body=library.status==='loading'&&!library.photos.length?'<p class="section-note" role="status">Loading photos…</p>':
  library.status==='offline'&&!library.photos.length?'<p class="section-note" role="status">Connect to see Family Photos.</p>':
  library.status==='error'&&!library.photos.length?`<div class="error-banner" role="alert"><span>${esc(library.error)}</span><button type="button" class="text-link" data-photo-action="reload">Retry</button></div>`:
  library.photos.length?`<div class="photo-grid">${library.photos.map((p,i)=>`<button type="button" class="photo-tile" data-photo-action="open" data-photo="${esc(p.id)}" aria-label="Open photo ${i+1} of ${library.photos.length}"><img src="${esc(p.thumb)}" width="${p.thumb_width}" height="${p.thumb_height}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>`:
  '<p class="section-note photo-empty">No photos yet. Add a few to show them on the wall.</p>';
 const index=preview?library.photos.findIndex(p=>p.id===preview):-1,current=library.photos[index];
 const viewer=current?`<div class="photo-viewer" role="dialog" aria-modal="true" aria-label="Photo ${index+1} of ${library.photos.length}"><img src="${esc(current.display)}" width="${current.width}" height="${current.height}" alt="Family photo ${index+1}"><div class="photo-viewer-bar">${confirm?`<span>Remove this photo from Family Photos and the wall?</span><button type="button" class="btn" data-photo-action="cancel-remove">Keep</button><button type="button" class="btn danger" data-photo-action="confirm-remove" data-photo="${esc(current.id)}" ${library.removing.has(current.id)?'disabled':''}>Remove</button>`:`<button type="button" class="btn" data-photo-action="close">Close</button><button type="button" class="btn" data-photo-action="previous" ${index>0?'':'disabled'} aria-label="Previous photo">‹</button><span class="photo-count">${index+1} / ${library.photos.length}</span><button type="button" class="btn" data-photo-action="next" ${index<library.photos.length-1?'':'disabled'} aria-label="Next photo">›</button><button type="button" class="btn danger" data-photo-action="remove" ${online?'':'disabled'}>Remove</button>`}</div></div>`:'';
 return {list:`<section class="photos" aria-label="${esc(library.album?.name||'Family Photos')}"><div class="photo-head">${picker}</div>${uploads}${body}</section>`,viewer};
}

export class PhotosView extends (globalThis.HTMLElement||class{}) {
 connectedCallback(){
  this.library=this.getRootNode().host?._photoLibrary;if(!this.library)return;
  this.preview=null;this.confirm=false;this.frame=0;
  this.unsubscribe=this.library.subscribe(()=>this.schedule());
  this.addEventListener('click',this.onClick=event=>this.click(event));
  this.addEventListener('change',this.onChange=event=>this.change(event));
  this.addEventListener('keydown',this.onKey=event=>this.key(event));
  this.online=()=>this.render();addEventListener('online',this.online);addEventListener('offline',this.online);
  this.render();this.library.load();
 }
 disconnectedCallback(){this.unsubscribe?.();document.documentElement.classList.remove('photo-viewer-open');this.listHost=null;this.lastList=this.lastViewer=null;cancelAnimationFrame(this.frame);removeEventListener('online',this.online);removeEventListener('offline',this.online);}
 schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();});}
 render(){
  if(this.preview&&!this.library.photos.some(p=>p.id===this.preview)){this.preview=null;this.confirm=false;}
  if(!this.listHost){this.innerHTML='<div class="photo-list-host"></div><div class="photo-viewer-host"></div>';[this.listHost,this.viewerHost]=this.children;}
  const focus=this.querySelector(':focus')?.dataset.photoAction;
  const {list,viewer}=photoParts(this.library,{online:this.library.online(),preview:this.preview,confirm:this.confirm});
  // Patch each part only when it changed, so progress updates never reload the open preview image.
  if(list!==this.lastList){this.listHost.innerHTML=list;this.lastList=list;}
  if(viewer!==this.lastViewer){this.viewerHost.innerHTML=viewer;this.lastViewer=viewer;}
  // The page-level status footer sits above the card; hide it while the full-screen viewer is open.
  document.documentElement.classList.toggle('photo-viewer-open',Boolean(viewer));
  if(focus)this.querySelector(`[data-photo-action="${focus}"]`)?.focus();
 }
 open(id){this.preview=id;this.confirm=false;this.render();this.querySelector('.photo-viewer [data-photo-action="close"]')?.focus();}
 close(){const id=this.preview;this.preview=null;this.confirm=false;this.render();this.querySelector(`[data-photo="${CSS.escape(id)}"]`)?.focus();}
 step(delta){const i=this.library.photos.findIndex(p=>p.id===this.preview)+delta;if(this.library.photos[i]){this.preview=this.library.photos[i].id;this.render();}}
 toast(message){this.getRootNode().host?._toast?.(message);}
 async click(event){
  const target=event.target.closest('[data-photo-action]');if(!target)return;
  const action=target.dataset.photoAction,local=Number(target.dataset.local);
  if(action==='open')this.open(target.dataset.photo);
  else if(action==='close')this.close();
  else if(action==='previous')this.step(-1);
  else if(action==='next')this.step(1);
  else if(action==='retry')this.library.retry(local);
  else if(action==='dismiss')this.library.dismiss(local);
  else if(action==='reload')this.library.load();
  else if(action==='remove'){this.confirm=true;this.render();this.querySelector('[data-photo-action="cancel-remove"]')?.focus();}
  else if(action==='cancel-remove'){this.confirm=false;this.render();}
  else if(action==='confirm-remove'){
   try{await this.library.remove(target.dataset.photo);this.toast('Photo removed.');}
   catch(error){this.confirm=false;this.render();this.toast(error.message);}
  }
 }
 change(event){
  if(!event.target.matches('.photo-input'))return;
  try{this.library.add(event.target.files);}catch(error){this.toast(error.message);}
  event.target.value='';
 }
 key(event){
  if(!this.preview)return;
  if(event.key==='Escape'){event.preventDefault();this.confirm?(this.confirm=false,this.render()):this.close();}
  if(event.key==='ArrowLeft')this.step(-1);
  if(event.key==='ArrowRight')this.step(1);
 }
}
if(globalThis.customElements&&!customElements.get('hearthglance-photos'))customElements.define('hearthglance-photos',PhotosView);

export const photoStyles=`
.photos{display:grid;gap:16px}
.phone .photos{padding:12px 0 24px}
.phone .photo-head,.phone .photo-uploads,.phone .photos>.section-note,.phone .photos>.error-banner{margin:0 16px}
.photo-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.photo-pick{position:relative;overflow:hidden;cursor:pointer}
.photo-input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;font-size:0}
.photo-pick:focus-within{outline:2px solid currentColor;outline-offset:2px}
.photo-uploads{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.photo-upload{display:grid;grid-template-columns:1fr auto auto;gap:6px 10px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--surface-2,rgba(127,127,127,.12))}
.photo-upload-copy{display:grid;min-width:0}.photo-upload-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.photo-upload-status{font-size:.86em;opacity:.8}.photo-upload.failed .photo-upload-status,.photo-upload.rejected .photo-upload-status{color:var(--danger,#c0473b);opacity:1}
.photo-upload progress{grid-column:1/-1;width:100%;height:6px}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px}
.phone .photo-grid{grid-template-columns:repeat(3,1fr);gap:3px}
.photo-tile{padding:0;border:0;background:rgba(127,127,127,.15);aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer}
.phone .photo-tile{border-radius:2px}
.photo-tile img{width:100%;height:100%;object-fit:cover;display:block}
.photo-viewer{position:fixed;inset:0;z-index:50;background:#000;display:grid;grid-template-rows:1fr auto;
 padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)}
.photo-viewer img{width:100%;height:100%;min-height:0;object-fit:contain}
.photo-viewer-bar{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;color:#fff;
 padding:10px 12px calc(10px + env(safe-area-inset-bottom))}
.photo-viewer-bar span{flex:1 1 100%;text-align:center}.photo-viewer-bar .photo-count{flex:0 0 auto}
.photo-viewer .btn{min-height:44px;min-width:44px}
`;
