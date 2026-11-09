import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VISUAL_MODES,resolveVisualMode} from './lib/visual-command-model.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('premium dashboard is a visual-first overview rather than one bare chart',()=>{
 const page=read('./visual-intelligence.html');
 const js=read('./visual-intelligence.mjs');
 const overview=read('./visual-overview.mjs');
 const css=read('./visual-premium.css');
 assert.match(page,/data-viz="overview"/);
 assert.match(page,/visual-premium\.css/);
 assert.match(js,/renderVisualOverview/);
 assert.match(js,/current==='overview'\)renderVisualOverview\(/);
 assert.match(overview,/av-dashboard-kpis/);
 assert.match(overview,/av-dashboard-grid/);
 assert.match(overview,/av-dashboard-chart/);
 assert.match(overview,/renderSankey/);
 assert.match(overview,/renderWaterfall/);
 assert.match(overview,/renderHeatmap/);
 assert.match(overview,/renderTimeline/);
 assert.match(overview,/data-open-viz/);
 assert.match(css,/\.av-dashboard-kpis/);
 assert.match(css,/\.av-dashboard-grid/);
 assert.match(css,/\.av-dashboard-card/);
 assert.match(css,/prefers-reduced-motion/);
});
test('visual command routes illustration-style dashboard while retaining existing modes',()=>{
 const ids=new Set(VISUAL_MODES.map(x=>x.id));
 assert.ok(ids.has('overview'));
 assert.equal(resolveVisualMode('Show executive visual cockpit')?.id,'overview');
 for(const mode of ['bi','sankey','factory','simulation','heatmap','waterfall','funnel','timeline','logistics'])assert.ok(ids.has(mode));
 const visualCommand=read('./visual-command.html');
 assert.match(visualCommand,/visual-intelligence\.html\?viz=overview/);
});
test('overview is explicitly scenario-only and never labels synthetic metrics as live',()=>{
 const overview=read('./visual-overview.mjs');
 assert.match(overview,/SYNTHETIC DEMO/);
 assert.match(overview,/USER SUPPLIED/);
 assert.match(overview,/Scenario/);
 assert.doesNotMatch(overview,/LIVE\s+REVENUE|LIVE\s+OEE|REAL-TIME KPI/);
 const js=read('./visual-intelligence.mjs');
 assert.match(js,/api\/session/);
 assert.match(js,/USER_SUPPLIED_UNVERIFIED/);
});
