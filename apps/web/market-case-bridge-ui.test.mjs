import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('founder Market Intelligence cockpit exposes source-aware private case search',async()=>{
 const [html,js,css]=await Promise.all([read('./market-intelligence.html'),
  read('./market-intelligence.mjs'),read('./market-intelligence.css')]);
 for(const id of ['private-case-catalog','private-case-search-form','private-case-search-input',
  'private-case-results','private-case-status','private-case-text','private-case-document-title']){
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 }
 assert.match(js,/fetch\(.*credentials:'same-origin'/);
 assert.match(js,/\/api\/market-case-bridge/);
 assert.match(js,/URLSearchParams/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(css,/\.private-case/);
});
test('read-only private case API is registered in the Worker, never exposed as static asset',async()=>{
 const [worker,ignore]=await Promise.all([read('./cloudflare-worker.mjs'),read('./.assetsignore')]);
 assert.match(worker,/marketCaseBridge from '\.\/api\/market-case-bridge\.mjs'/);
 assert.match(worker,/'\/api\/market-case-bridge': marketCaseBridge/);
 assert.match(ignore,/^api\//m);
});
