import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('the HACS manifest points to a standalone installable bundle',async()=>{
 const manifest=JSON.parse(await readFile(new URL('hacs.json',root)));
 const pkg=JSON.parse(await readFile(new URL('package.json',root)));
 assert.equal(manifest.filename,pkg.name+'.js');assert.equal(manifest.render_readme,true);
 assert.equal(manifest.homeassistant,'2026.10.0');
 const bundle=await readFile(new URL('dist/'+manifest.filename,root),'utf8');
 assert.doesNotMatch(bundle,/\b(?:import|export)\s.*?from\s*['"]\.\//);
 assert.match(bundle,/customElements\.define\("hearthglance-card"/);
});
test('the bundle does not embed direct network clients or external asset imports',async()=>{
 const bundle=await readFile(new URL('dist/hearthglance-card.js',root),'utf8');
 assert.doesNotMatch(bundle,/\bfetch\(|new WebSocket\(|new XMLHttpRequest\(|@import\b/);
});
