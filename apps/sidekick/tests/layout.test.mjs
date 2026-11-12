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

// iOS Safari sizes date and time inputs to their own content unless their native appearance is removed, so
// they ran past the right edge of the phone's Plan dinner and event sheets.
test('date and time inputs fit narrow sheets, and checkbox fields stay on one row',async()=>{
 const {styles}=await import('../ui/styles.js');
 assert.match(styles,/\.field input\[type=date\],\.field input\[type=time\][^{]*\{[^}]*appearance:none[^}]*min-width:0/);
 assert.match(styles,/\.checkbox-field\.field\{flex-direction:row/);
});

// With a translucent status bar the app draws under it and pads by the safe area itself, so iOS's soft edge
// blur covers only that padding instead of the header text.
test('the installed app draws under a translucent status bar and pads for it',async()=>{
 const html=await readFile(new URL('../static/index.html',import.meta.url),'utf8');
 assert.match(html,/apple-mobile-web-app-status-bar-style" content="black-translucent"/);
 const {standaloneStyles}=await import('../ui/styles.js');
 assert.match(standaloneStyles,/\.app\{[^}]*padding-top:var\(--hg-safe-top/);
});
