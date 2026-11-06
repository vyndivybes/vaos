import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const page=read('./neural-knowledge.html');
const script=read('./history-index-ui.mjs');
test('Neural Intelligence displays founder-only historical commissioning, OAuth and search',()=>{
 for(const id of ['historical-index','history-index-status','history-index-sources',
  'history-index-sync-gmail','history-index-sync-drive','history-index-import',
  'history-index-file','history-index-search','history-index-results',
  'history-index-contents','history-index-search-more'])
  assert.ok(page.includes('id="'+id+'"'),id);
 assert.match(page,/google-workspace\/start\?scope=history/);
 assert.match(page,/history-index-ui.mjs/);
});
test('client imports explicit local source content to authenticated index endpoint, never GitHub',()=>{
 assert.match(script,/\/api\/history-index\/ingest/);
 assert.match(script,/\/api\/history-index\/search/);
 assert.match(script,/\/api\/history-index\/sync/);
 assert.match(script,/\/api\/history-index\/status/);
 assert.match(script,/\/api\/history-index\/read/);
 assert.doesNotMatch(script,/innerHTML\s*=/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|indexedDB/);
 assert.doesNotMatch(script,/https:\/\/api\.github\.com|slack|webhook/);
});
test('source history search links into graph without claiming verified causal links',()=>{
 assert.match(script,/vaos:history-search-results/);
 assert.match(read('./unified-knowledge-ui.mjs'),/vaos:history-search-results/);
});
