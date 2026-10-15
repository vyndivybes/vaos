import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=name=>readFile(new URL(name,import.meta.url),'utf8');
test('Insight Studio uses existing founder-only data agent endpoint and source-bound chart planning',async()=>{
 const html=await load('./founder-console.html');
 const js=await load('./jarvis-data-agent.mjs');
 assert.match(js,/fetch\('\/api\/jarvis-data-agent\?q='/);
 assert.match(js,/buildInsightViews\(data\)/);
 assert.match(js,/resolveInsightChartKind\(view,selector\.value\)/);
 assert.match(js,/actionAuthorized!==false/);
 for(const id of ['data-agent-visuals','data-agent-insight-summary','data-agent-chart-note',
  'data-agent-chart-focus','data-agent-chart-kind','data-agent-chart']){
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 }
 assert.ok(html.indexOf('id="data-agent-chart"')<html.indexOf('id="data-agent-technical"'),
  'Source-bound charts should appear before technical output');
 assert.match(html,/<details class="data-agent-source-records">/);
 assert.match(html,/<details class="data-agent-employee-records">/);
 assert.match(js,/overview\.replaceChildren\(\);graph\.replaceChildren\(\)/);
});
test('Quick questions remain controlled examples; data agent supports no autonomous writes',async()=>{
 const html=await load('./founder-console.html');
 for(const text of ['Company overview','Workforce analysis','Production dependencies'])
  assert.ok(html.includes(text));
 const handler=await load('./api/jarvis-data-agent.mjs');
 assert.match(handler,/req\.method!=='GET'/);
 assert.match(handler,/session\.email!==FOUNDER/);
 assert.match(handler,/selection\.status==='DENIED'/);
});
