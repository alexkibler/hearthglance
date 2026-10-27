import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {richTextHTML} from '../src/rich-text.js';
globalThis.document=parseHTML('<html><body></body></html>').document;

test('calendar descriptions keep formatting and plain text while stripping active content and unsafe links',()=>{
 const safe=richTextHTML('<p onclick="steal()"><strong>Dinner</strong></p><ul><li>Bring salad</li></ul><script>alert(1)</script><img src=x onerror=steal()><a href="javascript:steal()">bad link</a><a href="https://example.org" onclick="steal()">good link</a>');
 assert.match(safe,/<strong>Dinner<\/strong>/);assert.match(safe,/<ul><li>Bring salad<\/li><\/ul>/);
 assert.doesNotMatch(safe,/script|onclick|onerror|<img|javascript:/);assert.match(safe,/href="https:\/\/example.org"/);
 assert.equal(richTextHTML('First line\nSecond & third'),'First line<br>Second &amp; third');
 assert.equal(richTextHTML('<iframe src="evil">Hidden</iframe>'), '');
});
