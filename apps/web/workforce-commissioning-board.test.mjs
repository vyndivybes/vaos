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

test('portable lint runner checks source files without executing them or passing them through a shell',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts.lint,'node scripts/check-syntax.mjs');
 const runner=await readFile(new URL('../../scripts/check-syntax.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes("spawn(process.execPath,['--check',file]"));
 assert.match(runner,/shell:false/);
});
