import test from 'node:test';
import assert from 'node:assert/strict';
import {assessG3CrossSource} from './g3-cross-source-reconciliation.mjs';
const base=()=>({
 PROCUREMENT:{records:[{sku:'SKU1',unit:'kg',sales_order_id:'SO-1',bom_revision:'R1',shortage_quantity:2}]},
 INVENTORY:{records:[{sku:'SKU1',unit:'kg',quantity_balance:0}]},
 PRODUCTION:{records:[{id:'J1',sales_order_id:'SO-1',bom_revision:'R1',units:2}]},
 ENGINEERING:{baselines:[{id:'B1',status:'released',revision_code:'R1',bom_revision:null}],changeOrders:[]}
});
test('G3.1E only yields bounded non-authoritative counts and keeps release held',()=>{
 const x=assessG3CrossSource(base());
 assert.equal(x.status,'CROSS_SOURCE_RECONCILIATION_HOLD');
 assert.equal(x.counts.procurementSampleRows,1);
 assert.equal(x.counts.shortageRowsWithObservedJobBomConflict,0);
 assert.equal(x.counts.releasedBaselinesWithoutBom,1);
 assert.equal(x.sameDatabaseSnapshotVerified,false);
 assert.equal(x.sourceRevisionsIndependentlyVerified,false);
 assert.equal(x.completeDatasetVerified,false);
 assert.equal(x.unitConversionVerified,false);
 assert.equal(x.productionForecastCertified,false);
 assert.equal(x.actionAuthorized,false);
 assert.ok(x.holds.includes('RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM'));
 assert.ok(x.holds.includes('G2B_INDEPENDENT_RESTORE_REQUIRED'));
});
test('G3.1E exposes only bounded conflict counts, never SKUs or order IDs',()=>{
 const fixture=base();
 fixture.INVENTORY.records[0].unit='g';
 fixture.PRODUCTION.records[0].bom_revision='R2';
 fixture.PROCUREMENT.records[0].customer='NEVER-LEAK';
 const x=assessG3CrossSource(fixture);
 assert.equal(x.counts.shortageRowsWithIncompatibleObservedInventoryUnit,1);
 assert.equal(x.counts.shortageRowsWithObservedJobBomConflict,1);
 assert.ok(x.holds.includes('OBSERVED_SKU_UNIT_RELATION_UNRECONCILED'));
 assert.ok(x.holds.includes('OBSERVED_JOB_BOM_REVISION_CONFLICT'));
 assert.doesNotMatch(JSON.stringify(x),/SKU1|SO-1|NEVER-LEAK/);
});
test('G3.1E unmatched inventory in limited observation is not certified absence',()=>{
 const fixture=base();
 fixture.INVENTORY.records=[];
 const x=assessG3CrossSource(fixture);
 assert.equal(x.counts.shortageRowsWithoutObservedInventorySku,1);
 assert.equal(x.completeDatasetVerified,false);
 assert.equal(x.independentlyReconciledSourceCounts,false);
 assert.equal(x.canRunRealDataOptimizer,false);
});
test('G3.1E missing read and oversized or malicious payload always hold',()=>{
 for(const fixture of [
  {...base(),ENGINEERING:null},
  {...base(),PRODUCTION:{records:Array(51).fill({})}},
  {...base(),ENGINEERING:{baselines:[],changeOrders:[]},INVENTORY:{records:'bad'}}
 ]){
  const x=assessG3CrossSource(fixture);
  assert.equal(x.status,'CROSS_SOURCE_INPUT_HOLD');
  assert.deepEqual(x.counts,{});
  assert.equal(x.actionAuthorized,false);
 }
});
test('G3.1E missing comparand fields cannot silently pass comparison',()=>{
 const fixture=base();
 fixture.PROCUREMENT.records[0].sales_order_id=null;
 const x=assessG3CrossSource(fixture);
 assert.equal(x.counts.shortageRowsNotComparable,1);
 assert.equal(x.holds.includes('CROSS_SOURCE_COMPARAND_FIELDS_MISSING'),true);
 assert.equal(x.completeDatasetVerified,false);
});

test('G3.1E exposes released production card approval-timestamp gaps without granting release',()=>{
 const x=base();
 x.PRODUCTION.records=[
  {...x.PRODUCTION.records[0],status:'released',approved_at:null},
  {id:'J2',status:'released',bom_revision:'R1',approved_at:'2026-10-13T10:00:00.000Z'},
  {id:'J3',status:'draft',bom_revision:'R1',approved_at:null}
 ];
 const s=assessG3CrossSource(x);
 assert.equal(s.counts.productionReleasedCardsMissingApprovalTimestamp,1);
 assert.ok(s.holds.includes('PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED'));
 assert.equal(s.engineeringReleaseVerified,false);
 assert.equal(s.actionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(s),/SO-1|SKU1|J2/);
});
