import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildWorkspaceModel} from './workspace-model.mjs';
import {createDevelopmentRuntime} from '../../../platform/runtime/development-runtime.mjs';
test('leadership pulse does not invent evidence coverage or assert governance health',()=>{
 const snapshot=createDevelopmentRuntime().snapshot();
 const model=buildWorkspaceModel(snapshot);
 assert.equal(model.pulse.evidenceCoverage,null);
 assert.equal(model.pulse.governance,'Policy-gated');
 assert.deepEqual(model.risks,[]);
});
test('VAOS workspace is an interactive responsive business command center with VYNDI link',async()=>{
 const html=await readFile(new URL('../workspace.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../workspace.mjs',import.meta.url),'utf8');
 const css=await readFile(new URL('../workspace-saas.css',import.meta.url),'utf8');
 const group=await readFile(new URL('../group-dashboard.mjs',import.meta.url),'utf8');
 for(const id of ['group-portfolio','overview-agent-chart','pulse-grid','module-nav'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/workspace-saas.css/);
 assert.match(js,/showGroupDashboard/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(group,/data-unit/);
 assert.match(group,/data-portfolio-refresh/);
 assert.match(group,/command\/analytics-studio/);
 assert.doesNotMatch(group,/(?:\bgroupRevenue\s*:\s*[1-9]|sampleRevenue|mockRevenue)/);
});
