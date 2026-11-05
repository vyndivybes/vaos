import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=async name=>readFile(new URL(name,import.meta.url),'utf8');
test('business views have distinct focus and source-backed charts, not portfolio duplication', async()=>{
 const js=await source('./group-dashboard.mjs');
 assert.match(js,/state\.focus\s*!==\s*'portfolio'/);
 assert.match(js,/drawDepartment\(root\)/);
 assert.match(js,/data-contract-search/);
 assert.match(js,/data-chart-kind/);
 assert.match(js,/Charted values are signed source counts/);
});
test('module dashboards support searchable records, chart selection and collapsible evidence sections',async()=>{
 const html=await source('./workspace.html');
 const js=await source('./workspace.mjs');
 assert.match(html,/id="module-evidence-analytics"/);
 assert.match(html,/id="module-evidence-chart"/);
 assert.match(html,/id="module-record-search"/);
 assert.match(html,/<details[^>]*>/);
 assert.match(js,/renderModuleDashboard/);
});
test('founder workforce dashboard supports employee search, collapsible reports and a chart switcher',async()=>{
 const html=await source('./workforce-analytics.html');
 const js=await source('./workforce-analytics.mjs');
 assert.match(html,/id="wa-employee-search"/);
 assert.match(html,/id="wa-chart-kind"/);
 assert.match(html,/id="wa-evidence-chart"/);
 assert.match(html,/<details[^>]*>/);
 assert.match(js,/renderEmployeeCharts/);
 assert.match(js,/wa-chart-donut/);
 assert.match(js,/wa-graph-columns/);
});

test('13-week cash scenarios are wired only to the signed financial scorecard and require manual inputs',async()=>{
 const html=await source('./workforce-analytics.html');
 const js=await source('./financial-performance.mjs');
 assert.match(html,/id="wa-cash-scenario-form"/);
 for(const id of ['wa-cash-weekly-receipts','wa-cash-weekly-payments','wa-cash-weekly-capex','wa-cash-shock',
  'wa-cash-scenario-status','wa-cash-scenario-results'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/project13WeekCash/);
 assert.match(js,/qualifiedStatement/);
 assert.match(js,/clearCashScenario\('/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
});
