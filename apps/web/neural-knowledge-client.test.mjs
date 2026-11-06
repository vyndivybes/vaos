import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_INFO,selectGraphView,graphPositions,sourceReadiness} from './neural-knowledge-client.mjs';
const graph={
 nodes:[
  {id:'A',label:'Frame geometry',kind:'engineering',sourceRef:'rev1'},
  {id:'B',label:'Cash plan',kind:'finance',sourceRef:'rev2'},
  {id:'C',label:'Inspection evidence',kind:'engineering',sourceRef:'rev3'}
 ],
 edges:[{from:'A',to:'B',relation:'INFORMS'},{from:'A',to:'C',relation:'VALIDATED_BY'}]
};
test('source catalogue differentiates VYNDI authority, SPARK snapshots, Obsidian and Dify',()=>{
 assert.deepEqual(SOURCE_INFO.map(s=>s.id),['vyndi-vedm','graphify','graphiti','llm-wiki','brain-atlas','obsidian','dify']);
 assert.equal(SOURCE_INFO.find(s=>s.id==='obsidian').kind,'notes');
 assert.equal(SOURCE_INFO.find(s=>s.id==='dify').kind,'workflow');
});
test('graph search and domain filter preserve only relevant connected edges',()=>{
 const out=selectGraphView(graph,{query:'frame',kind:'engineering'});
 assert.deepEqual(out.nodes.map(n=>n.id),['A']);
 assert.deepEqual(out.edges,[]);
 const engineering=selectGraphView(graph,{kind:'engineering'});
 assert.deepEqual(engineering.edges.map(e=>e.relation),['VALIDATED_BY']);
 const all=selectGraphView(graph);
 assert.equal(all.edges.length,2);
});
test('empty graph, hostile query and invalid limits do not fabricate nodes',()=>{
 assert.deepEqual(selectGraphView({nodes:[],edges:[]}).nodes,[]);
 assert.deepEqual(selectGraphView(graph,{query:'zz-no-match'}).edges,[]);
 assert.equal(selectGraphView(graph,{limit:1}).nodes.length,1);
 assert.deepEqual(graphPositions([]),[]);
});
test('layout coordinates are finite and stable for a single and multiple nodes',()=>{
 for(const nodes of [[graph.nodes[0]],graph.nodes]){
  const first=graphPositions(nodes),second=graphPositions(nodes);
  assert.deepEqual(first,second);
  assert.ok(first.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 }
});
test('uncommissioned sources do not masquerade as live',()=>{
 assert.match(sourceReadiness('NOT_COMMISSIONED'),/not commissioned/i);
 assert.match(sourceReadiness('PIN_CONFIGURED_UNVERIFIED'),/unverified/i);
 assert.match(sourceReadiness('CONFIGURED_UNVERIFIED'),/unverified/i);
});
