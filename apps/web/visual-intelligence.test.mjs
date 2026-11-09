import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VISUAL_MODES,resolveVisualMode} from './lib/visual-command-model.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('advanced studio exposes eight working graphics and a source distinction',()=>{
 const page=read('./visual-intelligence.html');
 const app=read('./visual-intelligence.mjs');
 const model=read('./lib/advanced-visual-model.mjs');
 const render=read('./advanced-visual-renderers.mjs');
 for(const kind of ['sankey','factory','simulation','heatmap','waterfall','funnel','timeline','logistics']){
  assert.match(page,new RegExp('data-viz="'+kind+'"'));
  assert.match(app,new RegExp("'"+kind+"'"));
 }
 assert.match(page,/SYNTHETIC DEMO/);
 assert.match(page,/<details class="av-chart-menu" id="av-chart-menu">/);
 assert.match(app,/select\(known\.has\(kind\)\?kind:'evidence'/);
 assert.match(app,/USER_SUPPLIED_UNVERIFIED/);
 assert.match(app,/\/api\/session/);
 assert.match(render,/renderSankey/);
 assert.match(model,/sourceClass:'SYNTHETIC_DEMO'/);
});
test('factory and scenario workspaces are accessible through VAOS visual command menu',()=>{
 const ids=new Set(VISUAL_MODES.map(x=>x.id));
 for(const id of ['sankey','factory','simulation','heatmap','waterfall','funnel','timeline','logistics'])assert.ok(ids.has(id),id);
 assert.equal(resolveVisualMode('show a Sankey diagram')?.id,'sankey');
 assert.equal(resolveVisualMode('run a Monte Carlo simulation')?.id,'simulation');
 assert.equal(resolveVisualMode('open the factory digital twin')?.id,'factory');
 assert.equal(resolveVisualMode('show sales funnel')?.id,'funnel');
});
test('advanced studio browser assets are published and never considered verified telemetry',()=>{
 const ignore=read('./.assetsignore');
 const worker=read('./cloudflare-worker.mjs');
 const page=read('./visual-intelligence.html');
 assert.match(ignore,/!lib\/advanced-visual-model\.mjs/);
 assert.match(ignore,/!lib\/predictive-simulation\.mjs/);
 assert.match(worker,/\/visual-intelligence\.html/);
 assert.match(page,/src="\/visual-intelligence\.mjs"/);
 assert.match(page,/source/i);
});
