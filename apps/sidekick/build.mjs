import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Resvg} from '@resvg/resvg-js';
const svg=await readFile('static/icon.svg','utf8');
const opaque=svg.replace('rx="28"','rx="0"');
for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]){
 await writeFile('static/'+name,new Resvg(opaque,{fitTo:{mode:'width',value:size}}).render().asPng());
}
const maskable=opaque.replace('<path','<g transform="translate(12.8 12.8) scale(.8)"><path').replace('</svg>','</g></svg>');
await writeFile('static/icon-maskable-512.png',new Resvg(maskable,{fitTo:{mode:'width',value:512}}).render().asPng());
await build({entryPoints:['main.js'],outfile:'static/app.js',bundle:true,format:'iife',target:['chrome61'],minify:true,banner:{js:'/*! Hearthglance standalone web app | MIT */'}});
// Old Android Chrome supports the UI primitives but not these newer conveniences.
const polyfills=`(function(){
if(typeof globalThis==='undefined')window.globalThis=window;
if(!Element.prototype.replaceChildren)Element.prototype.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);for(var i=0;i<arguments.length;i++)this.appendChild(typeof arguments[i]==='string'?document.createTextNode(arguments[i]):arguments[i])};
if(!Element.prototype.toggleAttribute)Element.prototype.toggleAttribute=function(name,force){var exists=this.hasAttribute(name),next=arguments.length===1?!exists:!!force;if(next)this.setAttribute(name,'');else this.removeAttribute(name);return next};
if(!Object.hasOwn)Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)};
if(!Object.fromEntries)Object.fromEntries=function(entries){var o={};Array.from(entries).forEach(function(e){Object.defineProperty(o,e[0],{value:e[1],writable:true,configurable:true,enumerable:true})});return o};
if(!Array.prototype.flat)Array.prototype.flat=function(n){n=n===undefined?1:n;return n>0?this.reduce(function(a,v){return a.concat(Array.isArray(v)?v.flat(n-1):v)},[]):this.slice()};
if(!Array.prototype.flatMap)Array.prototype.flatMap=function(f,t){return this.map(f,t).flat()};
if(!Array.prototype.at)Array.prototype.at=function(i){return this[i<0?this.length+i:i]};
if(!String.prototype.replaceAll)String.prototype.replaceAll=function(a,b){return this.split(a).join(b)};
var original=window.matchMedia;window.matchMedia=function(q){var m=original.call(window,q);if(!m.addEventListener){m.addEventListener=function(t,f){m.addListener(f)};m.removeEventListener=function(t,f){m.removeListener(f)}}return m};
})();\n`;
const file='static/app.js';await writeFile(file,polyfills+await readFile(file,'utf8'));
// One atomic app-shell cache per build, including worker behavior changes.
const template=await readFile('service-worker.js','utf8');
const hash=createHash('sha256').update(template);
for(const asset of ['index.html','app.js','app.css','icon.svg','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'])hash.update(await readFile('static/'+asset));
const version=hash.digest('hex').slice(0,16);
await writeFile('static/sw.js',template.replace('__BUILD_ID__',version));
console.log('Built installable PWA',version);
