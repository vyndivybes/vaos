import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {galleryFilter} from './kinetic-wall.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('ten editorial interface studies navigate to the correct existing VAOS workspaces',()=>{
 const html=read('./workspace.html');
 const previews=[...html.matchAll(/<a\b[^>]*class="kinetic-tile[^"]*"[^>]*data-kinetic-category="([^"]+)"[^>]*href="([^"]+)"[^>]*>/g)];
 assert.equal(previews.length,10);
 assert.deepEqual(previews.map(m=>m[1]).sort(),
  ['intelligence','intelligence','intelligence','operations','operations','operations','operations','systems','systems','systems'].sort());
 for(const [_,category,url] of previews){
  assert.ok(['intelligence','operations','systems'].includes(category));
  assert.ok(url.startsWith('/'),'internal navigation only');
  assert.doesNotMatch(url,/javascript:|data:/);
 }
 assert.match(html,/Illustrated previews, not live data/);
 assert.match(html,/id="command-view"/);
 assert.match(html,/id="command-bar"/);
 assert.doesNotMatch(html,/<iframe\b/i);
});
test('filter selection never returns fabricated data or alters source labels',()=>{
 const tiles=[
  {id:'finance',category:'intelligence'},
  {id:'store',category:'operations'},
  {id:'brain',category:'systems'}
 ];
 assert.deepEqual(galleryFilter('all',tiles).map(x=>x.show),[true,true,true]);
 assert.deepEqual(galleryFilter('operations',tiles).map(x=>x.show),[false,true,false]);
 assert.deepEqual(galleryFilter('intelligence',tiles).map(x=>x.show),[true,false,false]);
 assert.throws(()=>galleryFilter('unknown',tiles),/KINETIC_CATEGORY_INVALID/);
});
test('presentation enhancement is bounded to existing page, accessible and motion-aware',()=>{
 const html=read('./workspace.html');
 const script=read('./kinetic-wall.mjs');
 const css=read('./vaos-kinetic.css');
 assert.match(html,/src="\/kinetic-wall\.mjs"/);
 for(const category of ['all','intelligence','operations','systems'])assert.match(html,
  new RegExp('data-kinetic-filter="'+category+'"'));
 assert.match(script,/prefers-reduced-motion: reduce/);
 assert.match(script,/operational\.hidden/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(script,/innerHTML\s*=/);
 assert.doesNotMatch(script,/fetch\(|localStorage|sessionStorage|sendBeacon/);
});
