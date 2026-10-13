import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Founder workforce action lanes are searchable, source-based, and never expose dispatch actions',async()=>{
 const html=await readFile(new URL('./workforce-analytics.html',import.meta.url),'utf8');
 const js=await readFile(new URL('./workforce-analytics.mjs',import.meta.url),'utf8');
 for(const id of ['wa-commissioning-status','wa-commissioning-totals','wa-action-search','wa-blocked-work',
  'wa-audit-work','wa-capa-work','wa-forecast-work']){
  assert.ok(html.includes('id="'+id+'"'),id+' missing from founder view');
  assert.ok(js.includes("'"+id+"'"),id+' missing from client projection');
 }
 assert.match(js,/function renderCommissioningBoard/);
 assert.match(js,/b\.actionAuthorized!==false/);
 assert.match(js,/b\.releaseHoldOverridden!==false/);
 assert.match(js,/b\.commissioned!==false/);
 assert.match(js,/\.textContent=/);
 assert.doesNotMatch(js,/fetch\(['"]\/api\/missions['"],\s*\{\s*method:\s*['"]POST/);
});

test('all chained lint targets run via node --check, never execute source files as shell commands',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
 const commands=pkg.scripts.lint.split('&&').map(x=>x.trim());
 assert.ok(commands.length>1);
 assert.ok(commands.every(x=>x.startsWith('node --check ')), 'lint chain contains a non-lint command');
});
