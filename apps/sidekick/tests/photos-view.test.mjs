import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

// A real DOM so the Photos view's connect/disconnect lifecycle runs as in the browser.
const {window,document}=parseHTML('<html><body><main id="one"></main><main id="two"></main></body></html>');
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,customElements:window.customElements,
 requestAnimationFrame:f=>setTimeout(f,0),cancelAnimationFrame:id=>clearTimeout(id),addEventListener(){},removeEventListener(){},CSS:{escape:v=>v}});
const {PhotosView,mountPhotos}=await import('../ui/photos.js');

const photo=id=>({id,width:2880,height:2160,thumb_width:512,thumb_height:384,display:`./api/photos/${id}/display`,thumb:`./api/photos/${id}/thumb`});
function fakeLibrary(){
 return {photos:[photo('a'.repeat(24)),photo('b'.repeat(24))],uploads:[],status:'ready',removing:new Set(),loads:0,listeners:new Set(),
  online:()=>true,load(){this.loads++;},subscribe(f){this.listeners.add(f);return ()=>this.listeners.delete(f);}};
}

test('the card reuses one Photos view across renders, so an open preview survives an unrelated HA update',()=>{
 const library=fakeLibrary(),host={_photoLibrary:library};
 PhotosView.prototype.getRootNode=function(){return {host};};
 const render=id=>{const main=document.getElementById(id);main.innerHTML='<p>header</p><div data-photos-slot></div>';mountPhotos(host,main);return main;};
 render('one');
 const view=host._photosView;
 assert.ok(view instanceof PhotosView);assert.equal(library.loads,1);
 view.open('b'.repeat(24));
 assert.ok(view.querySelector('.photo-viewer'));
 render('one');                                                  // background calendar/to-do refresh re-renders the page
 assert.equal(host._photosView,view);
 assert.equal(view.preview,'b'.repeat(24));assert.ok(view.querySelector('.photo-viewer'));
 assert.equal(library.loads,1);assert.equal(library.listeners.size,1);
 const other=document.getElementById('two');other.innerHTML='<p>Calendar</p>';mountPhotos(host,other);   // leave the page
 document.getElementById('one').innerHTML='';
 assert.equal(library.listeners.size,0);
 render('two');                                                  // coming back starts fresh and reloads
 assert.equal(view.preview,null);assert.equal(library.loads,2);assert.equal(library.listeners.size,1);
});

test('opening the app directly on Photos loads the album once the card is attached',()=>{
 const library=fakeLibrary(),host={_photoLibrary:library};
 PhotosView.prototype.getRootNode=function(){return this.isConnected?{host}:this;};
 const detached=document.createElement('main');detached.innerHTML='<div data-photos-slot></div>';
 mountPhotos(host,detached);                                   // first render, before the card is in the page
 assert.equal(library.loads,0);
 document.body.append(detached);                               // the card is attached
 assert.equal(library.loads,1);assert.ok(host._photosView.querySelector('.photo-grid'));
 detached.remove();
});
