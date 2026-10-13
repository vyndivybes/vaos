import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Founder Command ships visible, linked qualification panel and browser scripts',async()=>{
 const [founder,workspace,js,css]=await Promise.all([
  readFile(new URL('./founder-console.html',import.meta.url),'utf8'),
  readFile(new URL('./workspace.html',import.meta.url),'utf8'),
  readFile(new URL('./jarvis-qualification.mjs',import.meta.url),'utf8'),
  readFile(new URL('./jarvis-qualification.css',import.meta.url),'utf8')
 ]);
 assert.match(founder,/id="g3-intelligence-panel"/);
 for(const id of ['g3-refresh','g3-evidence-status','g3-metrics','g3-domain-rows','g3-cross-rows','g3-priorities'])
  assert.match(founder,new RegExp('id="'+id+'"'));
 assert.match(founder,/jarvis-qualification\.mjs/);
 assert.match(founder,/jarvis-qualification\.css/);
 assert.match(workspace,/founder-console\.html#g3-intelligence-panel/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/cache:'no-store'/);
 assert.match(js,/createG3QualificationView/);
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage/);
 assert.match(css,/@media\(max-width:650px\)/);
});
