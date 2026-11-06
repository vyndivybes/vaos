import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeKnowledgeSources,selectKnowledgeView,layoutKnowledgeView,
 googleSearchGraph,githubEvidenceGraph,chatHistoryGraph} from './unified-knowledge-graph.mjs';

const observed=(source,nodes,edges=[])=>({
 source,status:'OBSERVED',readOnly:true,actionAuthorized:false,
 sourceRevision:'a'.repeat(40),observedAt:'2026-11-06T09:00:00Z',
 integrityVerified:true,nodes,edges,
});
const n=(id,label,sourceRef=id)=>({id,label,sourceRef,kind:'record'});

test('combines approved graphs without conflating duplicate local identifiers',()=>{
 const g=mergeKnowledgeSources([
  observed('graphify',[n('one','Source A','repo:path')]),
  observed('graphiti',[n('one','Source B','repo:path')]),
 ]);
 assert.equal(g.nodes.length,2);
 assert.deepEqual(g.nodes.map(x=>x.id),['graphify::one','graphiti::one']);
 assert.equal(g.edges.length,0,'matching labels/references are not automatic causal relationships');
 assert.equal(g.nodes[0].integrityVerified,true);
 assert.equal(g.nodes[0].sourceRevision,'a'.repeat(40));
});
test('requires observed read-only data and rejects unknown or untrusted sources',()=>{
 assert.throws(()=>mergeKnowledgeSources([observed('untrusted',[n('x','No')])]),/SOURCE_DENIED/);
 assert.throws(()=>mergeKnowledgeSources([{...observed('graphify',[n('x','No')]),actionAuthorized:true}]),/NOT_GOVERNED/);
 assert.throws(()=>mergeKnowledgeSources([{...observed('graphify',[n('x','No')]),status:'CONFIGURED_UNVERIFIED'}]),/NOT_GOVERNED/);
});
test('preserves exact edge direction, relation and time validity',()=>{
 const g=mergeKnowledgeSources([observed('graphiti',[n('a','A'),n('b','B'),n('c','C')],[
  {from:'a',to:'b',relation:'INFORMS',validFrom:'2026-01-01T00:00:00Z',validTo:'2026-04-01T00:00:00Z'},
  {from:'b',to:'c',relation:'REQUIRES',validFrom:'2026-05-01T00:00:00Z'}
 ])]);
 assert.equal(selectKnowledgeView(g,{focus:'graphiti::b',direction:'ancestors',depth:1}).nodes.length,2);
 assert.equal(selectKnowledgeView(g,{focus:'graphiti::b',direction:'descendants',depth:1}).nodes.length,2);
 assert.deepEqual(selectKnowledgeView(g,{focus:'graphiti::b',direction:'ancestors',depth:1,asOf:'2026-06-01'}).nodes.map(x=>x.nativeId),['b']);
 assert.deepEqual(selectKnowledgeView(g,{focus:'graphiti::b',direction:'descendants',depth:1,asOf:'2026-06-01'}).nodes.map(x=>x.nativeId),['b','c']);
});
test('depth and source selections limit the visible, authorized neighborhood',()=>{
 const g=mergeKnowledgeSources([observed('graphify',[n('a','A'),n('b','B'),n('c','C')],[
  {from:'a',to:'b',relation:'CALLS'},{from:'b',to:'c',relation:'CALLS'}
 ]),observed('obsidian',[n('q','note')])]);
 assert.deepEqual(selectKnowledgeView(g,{focus:'graphify::a',depth:1}).nodes.map(x=>x.nativeId),['a','b']);
 assert.deepEqual(selectKnowledgeView(g,{focus:'graphify::a',depth:2}).nodes.map(x=>x.nativeId),['a','b','c']);
 assert.deepEqual(selectKnowledgeView(g,{sources:['obsidian']}).nodes.map(x=>x.source),['obsidian']);
 assert.equal(selectKnowledgeView(g,{search:'No matches'}).nodes.length,0);
});
test('view is deterministically bounded and does not invent empty data',()=>{
 const g=mergeKnowledgeSources([observed('graphify',Array.from({length:190},(_,i)=>n('id'+i,'Node '+i)))]);
 const view=selectKnowledgeView(g,{limit:40});
 assert.equal(view.nodes.length,40);
 assert.equal(view.totalMatchedNodes,190);
 assert.equal(view.truncated,true);
 for(const mode of ['constellation','lanes','lineage','timeline']){
  const positions=layoutKnowledgeView(view,{mode});
  assert.deepEqual(positions,layoutKnowledgeView(view,{mode}));
  assert.equal(positions.length,40);
  assert.ok(positions.every(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)));
 }
 assert.deepEqual(layoutKnowledgeView({nodes:[],edges:[]}),[]);
});
test('private Google search builds ephemeral metadata only without snippets or sender identities',()=>{
 const doc=googleSearchGraph('gmail',[{id:'m1',subject:'Design decision',from:'person@example.com',snippet:'confidential',date:'2026-11-06'}]);
 assert.equal(doc.nodes.length,1);
 assert.equal(doc.nodes[0].label,'Design decision');
 assert.doesNotMatch(JSON.stringify(doc),/confidential|person@example.com/);
 assert.equal(doc.source,'gmail');
 assert.equal(doc.integrityVerified,false);
 assert.equal(mergeKnowledgeSources([doc]).nodes.length,1);
 assert.equal(googleSearchGraph('drive',[{name:'no stable ID'}]).nodes.length,0);
 assert.throws(()=>googleSearchGraph('other',[]),/SOURCE_DENIED/);
});
test('federated repository evidence creates only observed repo-to-file edges',()=>{
 const doc=githubEvidenceGraph([{repository:'vyndivybes/vaos',path:'docs/example.md',sha:'b'.repeat(40)}]);
 assert.equal(doc.nodes.length,2);
 assert.equal(doc.edges.length,1);
 assert.equal(doc.edges[0].relation,'CONTAINS');
 assert.equal(mergeKnowledgeSources([doc]).nodes.length,2);
 assert.equal(githubEvidenceGraph([{repository:'bad',path:'x',sha:'wrong'}]).nodes.length,0);
});
test('ChatGPT export is local metadata only with conversation and reply provenance',()=>{
 const input=[{id:'chat-1',title:'Factory project',create_time:1790000000,mapping:{
  'msg-1':{id:'msg-1',parent:null,message:{author:{role:'user'},content:{parts:['private words']}}},
  'msg-2':{id:'msg-2',parent:'msg-1',message:{author:{role:'assistant'},content:{parts:['secret conclusion']}}},
 }}];
 const doc=chatHistoryGraph(input);
 assert.equal(doc.nodes.length,3);
 assert.equal(doc.edges.length,3);
 assert.equal(doc.source,'chatgpt');
 assert.doesNotMatch(JSON.stringify(doc),/private words|secret conclusion/);
 assert.equal(mergeKnowledgeSources([doc]).edges.length,3);
 assert.throws(()=>chatHistoryGraph({notConversations:true}),/EXPORT_INVALID/);
});
test('invalid date and dangling links cannot fabricate lineage',()=>{
 const g=mergeKnowledgeSources([observed('obsidian',[n('a','A')],[{from:'a',to:'missing',relation:'LINKS'}])]);
 assert.equal(g.edges.length,0);
 assert.throws(()=>selectKnowledgeView(g,{asOf:'2026-99-99'}),/DATE_INVALID/);
});
