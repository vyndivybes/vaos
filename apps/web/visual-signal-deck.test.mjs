import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEMO_VISUAL_SCENARIO} from './lib/advanced-visual-model.mjs';
import {buildSignalModel} from './visual-signal-deck.mjs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('the illustrated digital thread derives every value from the validated scenario',()=>{
 const scene=buildSignalModel(DEMO_VISUAL_SCENARIO.sankey,{selectedId:'inspection'});
 assert.equal(scene.nodes.length,9);
 assert.equal(scene.links.length,11);
 assert.equal(scene.unit,'illustrative units');
 assert.equal(scene.inspector.label,'Final QA');
 assert.equal(scene.inspector.incoming,85);
 assert.equal(scene.inspector.outgoing,85);
 assert.equal(scene.inspector.upstream.length,1);
 assert.equal(scene.inspector.downstream.length,2);
 assert.equal(scene.originTotal,100);
 assert.equal(scene.terminalTotal,100);
 assert.ok(scene.links.every(link=>link.thickness>0 && Number.isFinite(link.thickness)));
});

test('missing node selection cannot create a fictional inspection value',()=>{
 const scene=buildSignalModel(DEMO_VISUAL_SCENARIO.sankey,{selectedId:'does-not-exist'});
 assert.ok(scene.nodes.some(node=>node.id===scene.selectedId));
 assert.notEqual(scene.inspector.id,'does-not-exist');
 assert.ok(scene.inspector.incoming>=0);
});

test('visual redesign maintains source authority, responsive mobile path and chart modes',()=>{
 const overview=read('./visual-overview.mjs');
 const html=read('./visual-intelligence.html');
 const css=read('./visual-ultra.css');
 const graph=read('./visual-signal-deck.mjs');
 assert.match(overview,/renderSignalDeck/);
 assert.match(html,/visual-ultra\.css/);
 assert.match(css,/\.vs-mobile-path/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(graph,/SCENARIO/);
 assert.match(graph,/aria-live/);
 for(const mode of ['sankey','factory','simulation','heatmap','waterfall','funnel','timeline','logistics'])
  assert.match(html,new RegExp('data-viz="'+mode+'"'));
 assert.match(html,/SYNTHETIC DEMO/);
});
