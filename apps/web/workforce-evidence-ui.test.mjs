import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('workforce dashboard exposes evidence-priority overview and per-employee drilldown',()=>{
 const html=readFileSync(new URL('./workforce-analytics.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('./workforce-analytics.mjs',import.meta.url),'utf8');
 for(const marker of ['wa-evidence-priorities','wa-evidence-priority-detail'])assert.ok(html.includes(marker),marker);
 assert.ok(js.includes('evidencePriorities'));
 assert.ok(js.includes('INDEPENDENT_AUDIT'));
 assert.ok(js.includes('renderEvidencePriorities'));
});
