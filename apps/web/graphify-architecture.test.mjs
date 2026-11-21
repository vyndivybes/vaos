import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 GRAPHIFY_VAOS_SNAPSHOT,GRAPHIFY_VAOS_NODES,GRAPHIFY_VAOS_EDGES,
 projectGraphifyArchitecture,graphifyNodeHref
} from './graphify-architecture-model.mjs';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('Graphify VAOS snapshot is pinned to the actual indexed code graph, not live business data',()=>{
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.commitSha,'22bf6538293105a0d7b8383adf3e237e3137254f');
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.repository,'vyndivybes/vaos');
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.indexedNodeCount,8174);
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.indexedEdgeCount,17441);
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.communityCount,476);
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.businessTruthCertified,false);
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.liveRuntimeConnectionsVerified,false);
 assert.equal(GRAPHIFY_VAOS_SNAPSHOT.actionAuthorized,false);
});

test('All rendered Graphify nodes and directed import edges belong to the curated indexed subset',()=>{
 assert.ok(GRAPHIFY_VAOS_NODES.length>=15);
 assert.ok(GRAPHIFY_VAOS_EDGES.length>=12);
 const ids=new Set(GRAPHIFY_VAOS_NODES.map(n=>n.id));
 assert.equal(ids.size,GRAPHIFY_VAOS_NODES.length);
 for(const node of GRAPHIFY_VAOS_NODES){
  assert.match(node.path,/^(apps\/web|platform\/)[a-zA-Z0-9/_-]+\.mjs$/);
  assert.ok(['knowledge','analytics','business','runtime'].includes(node.group));
  assert.ok(graphifyNodeHref(node).includes('/blob/22bf6538293105a0d7b8383adf3e237e3137254f/'));
 }
 for(const edge of GRAPHIFY_VAOS_EDGES){
  assert.ok(ids.has(edge.from)&&ids.has(edge.to),'edge endpoints must be indexed code files');
  assert.equal(edge.relation,'imports_from');
  assert.equal(edge.confidence,1);
 }
 assert.ok(GRAPHIFY_VAOS_EDGES.some(e=>e.from==='neural-ui'&&e.to==='neural-model'));
 assert.ok(GRAPHIFY_VAOS_EDGES.some(e=>e.from==='bi-api'&&e.to==='vyndi-bridge'));
 assert.ok(GRAPHIFY_VAOS_EDGES.some(e=>e.from==='visual'&&e.to==='visual-renderers'));
});

test('Focus and query are bounded and never imply operational authority',()=>{
 const full=projectGraphifyArchitecture();
 assert.equal(full.nodes.length,GRAPHIFY_VAOS_NODES.length);
 assert.equal(full.edges.length,GRAPHIFY_VAOS_EDGES.length);
 assert.equal(full.readOnly,true);
 assert.equal(full.actionAuthorized,false);
 assert.equal(full.businessDataStatus,'SEPARATE_SIGNED_READ');
 const filtered=projectGraphifyArchitecture({group:'business'});
 assert.ok(filtered.nodes.length>0);
 assert.ok(filtered.nodes.every(n=>n.group==='business'));
 assert.ok(filtered.edges.every(e=>filtered.nodes.some(n=>n.id===e.from)&&filtered.nodes.some(n=>n.id===e.to)));
 const focused=projectGraphifyArchitecture({focus:'bi-api'});
 assert.ok(focused.nodes.some(n=>n.id==='bi-api'));
 assert.ok(focused.nodes.some(n=>n.id==='vyndi-bridge'));
 assert.ok(focused.edges.every(e=>e.from==='bi-api'||e.to==='bi-api'));
 assert.equal(projectGraphifyArchitecture({query:'unmatchable repository route'}).nodes.length,0);
 assert.equal(projectGraphifyArchitecture({focus:'unknown'}).nodes.length,full.nodes.length);
});

test('Graphify architecture view appears within both knowledge and analytics dashboards',async()=>{
 const [spatial,neural,spatialJs,neuralJs,ui,css,three]=await Promise.all([
  read('./spatial-command.html'),read('./neural-knowledge.html'),
  read('./spatial-command.mjs'),read('./neural-knowledge-ui.mjs'),
  read('./graphify-architecture-ui.mjs'),read('./graphify-architecture.css'),
  read('./graphify-architecture-three.mjs')
 ]);
 for(const html of [spatial,neural]){
  assert.match(html,/id="graphify-code-lens/);
  assert.match(html,/graphify-architecture\.css/);
  assert.match(html,/not business(?:-data)? lineage|not live business|not operational/i);
 }
 for(const js of [spatialJs,neuralJs])assert.match(js,/mountGraphifyArchitecture/);
 assert.match(ui,/createElementNS/);
 assert.match(ui,/textContent/);
 assert.doesNotMatch(ui,/innerHTML\s*=/);
 assert.match(ui,/await import\('\.\/graphify-architecture-three\.mjs'\)/);
 assert.match(three,/await import\('\.\/vendor\/three\.module\.min\.js'\)/);
 assert.match(three,/prefers-reduced-motion: reduce/);
 assert.match(three,/\.dispose\(\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-width:720px/);
 for(const s of [ui,three])assert.doesNotMatch(s,/fetch\(|\/api\/|method:\s*['"]POST|XMLHttpRequest/);
});
