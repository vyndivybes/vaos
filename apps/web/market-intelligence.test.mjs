import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('illustrated research page exposes bounded user controls and scenario visualization',async()=>{
 const [html,js,css]=await Promise.all([
  read('./market-intelligence.html'),read('./market-intelligence.mjs'),
  read('./market-intelligence.css')]);
 for(const id of ['scan-form','scan-query','signal-list','archive-list','case-form',
  'case-id','case-title','case-market','as-of','load-references','reference-list',
  'generate-case','save-case','export-case','result','scenario-bars','case-markdown']){
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 }
 assert.match(css,/\.intelligence-art/);
 assert.match(css,/\.orbit/);
 assert.match(css,/\.scenario-bars/);
 assert.match(js,/fetch\('\/api\/session'/);
 assert.match(js,/confirm\('Save an immutable founder-only research version/);
 assert.match(js,/fetch\(url,\{credentials:'same-origin'/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('Cloudflare router wires protected case study handler and uncached HTML',async()=>{
 const [worker,founder]=await Promise.all([read('./cloudflare-worker.mjs'),
  read('./founder-console.html')]);
 assert.match(worker,/marketCaseStudies from '\.\/api\/market-case-studies\.mjs'/);
 assert.match(worker,/'\/api\/market-case-studies': marketCaseStudies/);
 assert.match(worker,/'\/market-intelligence\.html'/);
 assert.match(founder,/href="\/market-intelligence\.html"/);
});
