import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('./neural-knowledge.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./neural-knowledge.css',import.meta.url),'utf8');
const client=readFileSync(new URL('./neural-knowledge-ui.mjs',import.meta.url),'utf8');
test('illustration-grade neural workspace includes source, search, graph, provenance and inspected links',()=>{
 for(const needle of ['id="source-list"','id="node-query"','id="kind-filter"','id="graph-svg"','id="node-results"','id="lineage"','id="source-status"','id="graph-empty"']){
  assert.ok(page.includes(needle),'missing '+needle);
 }
 assert.match(css,/radial-gradient/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(client,/source=registry/);
 assert.match(client,/source='\+encodeURIComponent\(activeSource\)/);
});
test('graph UI renders only authenticated API data, never synthetic demo nodes',()=>{
 assert.doesNotMatch(client,/mockNodes|syntheticNodes|demoGraph|fakeGraph/);
 assert.match(client,/selectGraphView\(/);
 assert.match(client,/textContent/);
 assert.match(client,/integrityVerified/);
 assert.match(client,/NOT_COMMISSIONED/);
});
