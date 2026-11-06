import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VISUAL_MODES,getVisualMode} from './lib/visual-command-model.mjs';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const nativeModes=['overview','sankey','factory','heatmap','waterfall','funnel','timeline','logistics','simulation'];

test('visual command displays scenario charts directly instead of embedding a second web app',async()=>{
 const [html,controller,renderer]=await Promise.all([
  read('./visual-command.html'),read('./visual-command.mjs'),read('./visual-command-native.mjs')
 ]);
 assert.doesNotMatch(html,/<iframe\b/i);
 assert.doesNotMatch(controller,/frame\.src|\.contentWindow|vc-frame-shell/);
 assert.match(html,/id="vc-native-host"/);
 assert.match(controller,/mountVisualCommandViz/);
 assert.match(renderer,/renderVisualOverview/);
 assert.match(renderer,/mountFactoryTwin/);
 assert.match(renderer,/runMonteCarlo/);
 assert.match(renderer,/renderSimulation/);
 assert.match(renderer,/actionAuthorized:false/);
 assert.doesNotMatch(renderer,/\.innerHTML\s*=/);
});

test('no visual catalog route relies on a browser iframe',()=>{
 for(const id of nativeModes){
  const mode=getVisualMode(id);
  assert.equal(mode.renderer,'native',id);
  assert.match(mode.href,/^\/visual-intelligence\.html\?viz=/);
 }
 for(const mode of VISUAL_MODES){
  assert.notEqual(mode.renderer,'embed',mode.id);
  assert.match(mode.href,/^\//);
 }
 for(const id of ['graph','engineering','agents','finance','people','operations','governance'])
  assert.equal(getVisualMode(id).renderer,'link');
});

test('primary VAOS workspaces share their dark teal and gold design tokens',async()=>{
 const css=await read('./vaos-global-theme.css');
 for(const token of ['--vaos-bg','--vaos-surface','--vaos-ink','--vaos-muted','--vaos-accent','--vaos-gold','--vaos-focus'])
  assert.ok(css.includes(token),token);
 const paths=['./visual-command.html','./visual-intelligence.html','./market-intelligence.html',
  './workspace.html','./founder-console.html','./workforce-analytics.html',
  './neural-knowledge.html','./engineering-viewer.html','./agent-supervision.html'];
 for(const path of paths){
  const html=await read(path);
  assert.match(html,/href="\/vaos-global-theme\.css"/,path);
 }
 const premium=await read('./premium.css');
 assert.ok(premium.includes('--p-bg:var(--vaos-bg,'));
 const visualPremium=await read('./visual-premium.css');
 assert.ok(visualPremium.includes('var(--vaos-accent,'));
});

test('Visual Command has one header and a human-readable status',async()=>{
 const html=await read('./visual-command.html');
 assert.equal([...html.matchAll(/class="vc-topbar"/g)].length,1);
 assert.match(html,/Charts and scenarios appear here without another page inside this one/);
 assert.match(html,/Examples are not live company results/);
 assert.match(html,/Open full workspace/);
 assert.match(html,/aria-live="polite"/);
});
