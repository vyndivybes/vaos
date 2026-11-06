import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('advanced intelligence opens a composed editorial dashboard rather than an isolated bare chart',()=>{
 const page=read('./visual-intelligence.html');
 const app=read('./visual-intelligence.mjs');
 const overview=read('./visual-illustrated-overview.mjs');
 assert.match(page,/data-viz="overview"/);
 assert.match(page,/data-viz="sankey"/);
 assert.match(app,/renderIllustratedOverview/);
 assert.match(overview,/deriveVisualOverview/);
 for(const term of ['av-overview-kpis','av-overview-command','av-ov-card--flow','av-ov-card--factory','av-ov-card--heat','av-ov-card--funnel','av-ov-card--waterfall','av-ov-card--timeline','av-ov-card--forecast']){
  assert.ok(overview.includes(term),term);
 }
 assert.match(overview,/textContent/);
 assert.doesNotMatch(overview,/innerHTML\s*=/);
});
test('dashboard includes scene-specific provenance and no fictional live telemetry',()=>{
 const app=read('./visual-intelligence.mjs');
 const overview=read('./visual-illustrated-overview.mjs');
 const styles=read('./visual-premium.css');
 assert.match(overview,/SYNTHETIC_DEMO/);
 assert.match(overview,/UNVERIFIED/);
 assert.match(styles,/\.av-overview-kpis/);
 assert.match(styles,/\.av-overview-shell/);
 assert.match(app,/source='SYNTHETIC DEMO'/);
 assert.doesNotMatch(overview,/fetch\(/);
});
test('visual overview module is included in Cloudflare static assets',()=>{
 const ignore=read('./.assetsignore');
 const page=read('./visual-intelligence.html');
 assert.match(ignore,/!lib\/visual-overview-model\.mjs/);
 assert.match(page,/href="\/visual-premium\.css"/);
});
