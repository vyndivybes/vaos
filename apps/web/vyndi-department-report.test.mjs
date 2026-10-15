import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
test('VYNDI business reporting is integrated in the existing employee and period selectors',async()=>{
 const html=await read('./workforce-analytics.html');
 const browser=await read('./vyndi-department-report.mjs');
 for(const id of ['wa-period-employee','wa-period-from','wa-period-to','wa-vyndi-chart','wa-vyndi-records','wa-vyndi-coverage']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.ok(html.indexOf('id="wa-vyndi-title"')<html.indexOf('id="wa-period-work-title"'));
 assert.match(browser,/document\.addEventListener\('vaos:workforce-loaded'/);
 assert.match(browser,/fetch\('\/api\/enterprise-bi\?/);
 assert.match(browser,/credentials:'same-origin'/);
 assert.match(browser,/textContent=/);
 assert.doesNotMatch(browser,/innerHTML\s*=/);
 assert.match(browser,/current snapshot/i);
 assert.match(browser,/not a complete historical departmental audit/);
});
