import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// The page is a one-column CSS grid. Grid items default to min-width:auto, so without these rules a wide,
// unbreakable row (for example a five-day forecast with solar figures) widens the whole dashboard past the
// screen and the right margin disappears on iPhones.
test('the dashboard never grows wider than the screen',async()=>{
 const css=(await readFile(new URL('../static/app.css',import.meta.url),'utf8')).replace(/\s+/g,'');
 assert.match(css,/body\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/#app,#login\{[^}]*min-width:0/);
});
