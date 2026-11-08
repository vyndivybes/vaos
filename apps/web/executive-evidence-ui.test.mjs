import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('evidence mode is available without replacing the scenario studio or weakening source status',()=>{
 const html=read('./visual-intelligence.html');
 const logic=read('./visual-intelligence.mjs');
 const model=read('./lib/visual-command-model.mjs');
 assert.match(html,/data-viz="evidence"/);
 assert.match(html,/href="\/executive-evidence\.css"/);
 assert.match(logic,/mountExecutiveEvidence/);
 assert.match(logic,/evidenceDispose\?\.\(\)/);
 assert.match(model,/id:'evidence'/);
 assert.match(logic,/GOVERNED SOURCE · AWAITING READ/);
 assert.match(html,/data-viz="simulation"/);
});
test('all evidence browser dependencies are published and do not bypass source permissions',()=>{
 const ignore=read('./.assetsignore');
 const client=read('./executive-evidence.mjs');
 const server=read('./api/enterprise-bi.mjs');
 assert.match(ignore,/!lib\/executive-evidence-model\.mjs/);
 assert.match(client,/\/api\/enterprise-bi\?/);
 assert.match(client,/credentials:'same-origin'/);
 assert.match(client,/deriveEvidenceView/);
 assert.match(client,/employee:'all',limit:'5'/);
 assert.match(client,/new URLSearchParams\(\{\.\.\.dates,employee:'all',limit:'5'\}\)/,
  'departmental read must avoid executive-only mode, which returns zero departments');
 assert.match(server,/FOUNDER_ONLY/);
 assert.doesNotMatch(client,/innerHTML\s*=/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|sendBeacon/);
});

test('canonical aggregate explorer stays independently scoped and has no fabricated metrics',()=>{
 const client=read('./executive-evidence.mjs');
 const render=read('./executive-signals-view.mjs');
 const ignore=read('./.assetsignore');
 assert.match(client,/deriveExecutiveSignals/);
 assert.match(client,/renderExecutiveSignals/);
 assert.match(client,/executive:'1'/);
 assert.match(ignore,/!lib\/executive-signals-model\.mjs/);
 assert.match(render,/cross/i);
 assert.doesNotMatch(render,/innerHTML\s*=/);
});
