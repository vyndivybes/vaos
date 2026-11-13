import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSpatialSignals, selectSheetRows, GRAPH_NODES, SPATIAL_DATASETS } from './spatial-command-model.mjs';

const packet = datasets => ({
 schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,
 executiveSignals:{schemaVersion:'VYNDI_EXECUTIVE_SIGNALS_V1',readOnly:true,observedAt:'2026-11-12T00:00:00.000Z',datasets}
});
test('signed observed aggregate retains counts and a traceable read-only source',()=>{
 const state=projectSpatialSignals(packet({crmCustomers:{status:'OBSERVED',total:3,source:'VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE',rows:[{category:'road',status:'lead',record_count:3}]}}));
 assert.equal(state.status,'PARTIAL');
 const crm=state.datasets.find(x=>x.id==='crmCustomers');
 assert.equal(crm.total,3);
 assert.equal(crm.status,'OBSERVED');
 assert.equal(crm.source,'VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE');
 assert.equal(crm.actionAuthorized,false);
 assert.equal(state.datasets.find(x=>x.id==='dispatch').total,null);
});
test('an observed zero is distinct from a missing or held source',()=>{
 const state=projectSpatialSignals(packet({dispatch:{status:'OBSERVED',total:0,source:'VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE',rows:[]},hrWorkforce:{status:'HOLD',total:null,rows:[]}}));
 assert.equal(state.datasets.find(x=>x.id==='dispatch').total,0);
 assert.equal(state.datasets.find(x=>x.id==='hrWorkforce').total,null);
});
test('malformed, contradictory or untrusted totals fail closed',()=>{
 const a=projectSpatialSignals(packet({crmCustomers:{status:'OBSERVED',total:9,source:'VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE',rows:[{category:'a',status:'b',record_count:1}]}}));
 assert.equal(a.datasets.find(x=>x.id==='crmCustomers').status,'HOLD');
 const b=projectSpatialSignals({data:{...packet({}),readOnly:false}});
 assert.equal(b.status,'HOLD');
});
test('sheet rows are bounded, searchable and never expose arbitrary properties',()=>{
 const state=projectSpatialSignals(packet({crmCustomers:{status:'OBSERVED',total:2,source:'VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE',rows:[{category:'Road',status:'Lead',record_count:2,privateField:'should not render'}]}}));
 assert.deepEqual(selectSheetRows(state,'crmCustomers','lead').map(x=>Object.keys(x)),[['category','status','count']]);
 assert.deepEqual(selectSheetRows(state,'crmCustomers','absent'),[]);
});
test('spatial graph is a conceptual, non-authorizing navigation artifact',()=>{
 assert.ok(GRAPH_NODES.length>=8);
 assert.ok(SPATIAL_DATASETS.length>=7);
 assert.ok(GRAPH_NODES.every(n=>n.kind==='conceptual' && n.actionAuthorized===false));
});