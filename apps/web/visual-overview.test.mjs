import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('the real VAOS studio opens a composed cockpit with real renderer modules',()=>{
 const page=source('./visual-intelligence.html');
 const app=source('./visual-intelligence.mjs');
 const dashboard=source('./visual-overview.mjs');
 assert.match(page,/data-viz="overview"/);
 assert.match(page,/href="\/visual-premium\.css"/);
 assert.match(app,/import \{renderVisualOverview\} from '\.\/visual-overview\.mjs'/);
 assert.match(app,/current='overview'/);
 assert.match(app,/renderVisualOverview\(host,scenario,/);
 assert.match(dashboard,/export function renderVisualOverview/);
 for(const key of ['av-dashboard-kpis','av-dashboard-grid','av-dashboard-card','av-dashboard-trend','av-factory-preview','av-dashboard-legend']){
  assert.ok(dashboard.includes(key),key);
 }
 for(const mode of ['sankey','heatmap','simulation','waterfall','timeline','factory','funnel','logistics']){
  assert.match(dashboard,new RegExp("mode:'"+mode+"'"),mode);
 }
});
test('cockpit stays an evidence-marked interactive UI, not a static illustration',()=>{
 const dashboard=source('./visual-overview.mjs');
 const app=source('./visual-intelligence.mjs');
 const styles=source('./visual-premium.css');
 assert.match(dashboard,/SYNTHETIC DEMO/);
 assert.match(dashboard,/USER SUPPLIED · UNVERIFIED/);
 assert.match(dashboard,/not real-time telemetry/);
 assert.match(dashboard,/data-open-viz/);
 assert.match(dashboard,/onNavigate/);
 assert.match(app,/fetch\('\/api\/session'/);
 assert.match(app,/result\?\.authenticated!==true/);
 assert.match(styles,/\.av-dashboard-kpis/);
 assert.match(styles,/\.av-dashboard-card/);
 assert.match(styles,/\.av-dashboard-trend/);
 assert.match(styles,/prefers-reduced-motion/);
 assert.doesNotMatch(dashboard,/(?:innerHTML|insertAdjacentHTML)\s*[=(]/);
 assert.doesNotMatch(dashboard,/fetch\(/);
});
test('retains prior signed-source safeguards and local scenario isolation',()=>{
 const app=source('./visual-intelligence.mjs');
 const dashboard=source('./visual-overview.mjs');
 assert.match(app,/source='SYNTHETIC DEMO'/);
 assert.match(app,/sourceClass:'USER_SUPPLIED_UNVERIFIED'/);
 assert.match(app,/\/api\/enterprise-bi/);
 assert.match(app,/renderVisualOverview/);
 assert.match(dashboard,/validateSankey/);
 assert.match(dashboard,/heatmapCells/);
});
