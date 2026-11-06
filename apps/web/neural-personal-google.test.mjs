import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./neural-knowledge.html',import.meta.url),'utf8');
const js=readFileSync(new URL('./neural-knowledge-ui.mjs',import.meta.url),'utf8');
test('founder knowledge hub has distinct Drive and Gmail on-demand search without graph auto-ingest',()=>{
 for(const id of ['personal-google-search','personal-google-query','personal-google-service','personal-google-results','personal-google-status','personal-google-connect'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/\/api\/google-workspace\/drive\?q=/);
 assert.match(js,/\/api\/google-workspace\/mail\?q=/);
 assert.match(html,/\/api\/google-workspace\/start/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
});
