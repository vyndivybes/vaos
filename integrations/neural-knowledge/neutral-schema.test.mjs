import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNeutralGraph,NEUTRAL_GRAPH_SOURCES} from './neutral-schema.mjs';

const pin='a'.repeat(40), time='2026-11-03T07:00:00Z';
const base=(sourceType,payload)=>({schemaVersion:'VAOS_NEUTRAL_GRAPH_SOURCE_V1',sourceType,sourceRevision:pin,observedAt:time,payload});
const vedm=base('vyndi-vedm',{
 schemaVersion:'VYNDI_VEDM_AUTHORITY_READ_V1',sourceRepository:'vayu-shastr/veloxis-engineering-design-manual',
 sourceCommit:pin,asOfDate:'2026-11-03',readOnly:true,actionAuthorized:false,
 releaseReady:false,currentRuntimeAuthorityVerified:false,
 nodes:[{id:'VEDM-301-R539-EK75',title:'Candidate frame geometry',kind:'document_revision',sourceRef:'VEDM-301',releaseEffect:'none'},{id:'G10',title:'Gate',kind:'release_gate',sourceRef:'G10',releaseEffect:'none'}],
 edges:[{from:'VEDM-301-R539-EK75',to:'G10',relation:'BLOCKED_BY'}]
});
test('normalize signed VYNDI source without inventing current release authority',()=>{
 const graph=normalizeNeutralGraph(vedm,{integrityVerified:true});
 assert.equal(graph.schemaVersion,'VAOS_NEUTRAL_GRAPH_V1');
 assert.equal(graph.source,'vyndi-vedm');
 assert.equal(graph.nodes.length,2);
 assert.equal(graph.edges[0].relation,'BLOCKED_BY');
 assert.equal(graph.nodes[0].authorityClass,'reviewed-reference');
 assert.equal(graph.independentVerification,false);
 assert.equal(graph.currentBusinessTruthCertified,false);
 assert.equal(graph.actionAuthorized,false);
 assert.equal(graph.integrityVerified,true);
 assert.equal(graph.sourceRevision,pin);
});
test('Graphify and Brain Atlas preserve only curated node/edge metadata, not text bodies or contacts',()=>{
 for(const sourceType of ['graphify','brain-atlas']){
  const a=base(sourceType,{nodes:[{id:'a',title:'Engineering design',type:'project',body:'SECRET ORIGINAL BODY'},{id:'b',title:'QA revision',type:'document'},{id:'c',type:'contact',title:'Private person'}],edges:[{source:'a',target:'b',type:'LINKS_TO'},{source:'b',target:'c',type:'RELATES'}]});
  const result=normalizeNeutralGraph(a);
  assert.equal(result.nodes.length,2);
  assert.equal(result.edges.length,1);
  assert.equal(JSON.stringify(result).includes('SECRET ORIGINAL BODY'),false);
  assert.equal(JSON.stringify(result).includes('Private person'),false);
  assert.equal(result.nodes.every(n=>n.authorityClass==='advisory'),true);
 }
});
test('Graphiti temporal facts preserve validity/invalidation and do not confer causality',()=>{
 const a=base('graphiti',{entities:[{id:'a',name:'Frame Rev 5.4'},{id:'b',name:'Candidate'}],facts:[{source:'a',target:'b',relation:'RELATED_TO',valid_at:'2026-10-01T00:00:00Z',invalid_at:'2026-11-01T00:00:00Z'}]});
 const out=normalizeNeutralGraph(a);
 assert.equal(out.edges[0].validFrom,'2026-10-01T00:00:00Z');
 assert.equal(out.edges[0].validTo,'2026-11-01T00:00:00Z');
 assert.equal(out.causalRelationshipsVerified,false);
 assert.equal(out.nodes[0].authorityClass,'model-derived');
});
test('LLM Wiki retains reviewed citations only as advisory, not approval',()=>{
 const a=base('llm-wiki',{pages:[{id:'note-1',title:'BOM source',sourceRef:'reviewed:abc',reviewed:true},{id:'note-2',title:'Research',sourceRef:'web:xyz',reviewed:false}],links:[{from:'note-1',to:'note-2',relation:'REFERENCES'}]});
 const out=normalizeNeutralGraph(a);
 assert.equal(out.nodes.length,2);
 assert.equal(out.edges.length,1);
 assert.equal(out.nodes[0].authorityClass,'advisory');
 assert.equal(out.currentBusinessTruthCertified,false);
});
test('reject unknown graph provenance, dangling edges, forged release permission and pathological size',()=>{
 assert.deepEqual(NEUTRAL_GRAPH_SOURCES,['vyndi-vedm','graphify','graphiti','llm-wiki','brain-atlas']);
 assert.throws(()=>normalizeNeutralGraph({...vedm,sourceType:'unauthorized'}),/NEUTRAL_GRAPH_SOURCE_DENIED/);
 assert.throws(()=>normalizeNeutralGraph({...vedm,payload:{...vedm.payload,actionAuthorized:true}}),/NEUTRAL_GRAPH_AUTHORITY_DENIED/);
 assert.throws(()=>normalizeNeutralGraph({...vedm,payload:{...vedm.payload,edges:[{from:'missing',to:'G10',relation:'SAYS'}]}}),/NEUTRAL_GRAPH_EDGE_INVALID/);
 assert.throws(()=>normalizeNeutralGraph({...vedm,sourceRevision:'spoofed'}),/NEUTRAL_GRAPH_PROVENANCE_INVALID/);
 assert.throws(()=>normalizeNeutralGraph(base('graphiti',{entities:Array.from({length:301},(_,i)=>({id:'n'+i,name:'a'})),facts:[]})),/NEUTRAL_GRAPH_SIZE_DENIED/);
});
