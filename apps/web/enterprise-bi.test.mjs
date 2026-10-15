import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=name=>readFile(new URL(name,import.meta.url),'utf8');
test('Enterprise BI integrates with existing 16 employee controls and timeline',async()=>{
 const html=await load('./workforce-analytics.html');
 const js=await load('./enterprise-bi.mjs');
 for(const id of ['wa-bi-summary','wa-bi-chart','wa-bi-departments','wa-bi-table','wa-bi-status','wa-bi-more']){
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 }
 assert.match(html,/src="\/enterprise-bi\.mjs"/);
 assert.match(js,/wa-period-employee/);
 assert.match(js,/wa-period-from/);
 assert.match(js,/wa-period-to/);
 assert.match(js,/vaos:workforce-loaded/);
 assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(js,/innerHTML/);
 assert.match(js,/periodEventCount/);
 assert.match(js,/No fabricated job totals/);
});
