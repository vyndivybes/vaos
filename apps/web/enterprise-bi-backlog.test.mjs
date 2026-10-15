import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('enterprise BI keeps period activity separate from all-time current backlog',async()=>{
 const js=await readFile(new URL('./enterprise-bi.mjs',import.meta.url),'utf8');
 for(const field of ['periodEventCount','currentSourceCount','currentAttentionCount','currentStatusDistribution'])
  assert.match(js,new RegExp(field));
 assert.match(js,/Current backlog and source status/);
 assert.match(js,/not in-period completions or audited defects/);
 assert.match(js,/Not observed/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
});
