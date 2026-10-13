import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectG3SourceProvenance} from './g3-provenance-preflight.mjs';
const data=()=>({
 PROCUREMENT:{records:[{sku:'SECRET-1',sales_order_revision:3,bom_revision:'B1',unit:'kg',updated_at:'2026-10-13T08:00:00.000Z'}],complete:true,sourceRevisionVerified:true},
 INVENTORY:{records:[{sku:'SECRET-1',unit:'kg',updated_at:'2026-10-13T08:00:00.000Z'}]},
 PRODUCTION:{records:[{id:'JOB-1',sales_order_revision:2,unit:'pcs',created_at:'2026-10-13T08:00:00.000Z'}]},
 ENGINEERING:{baselines:[{id:'BL-1',revision_code:'R5',status:'released',bom_revision:null,updated_at:'2026-10-13T08:00:00.000Z'}],changeOrders:[]}
});
test('hint counts never certify source revision, freshness or completeness',()=>{
 const x=inspectG3SourceProvenance(data());
 assert.equal(x.status,'PROVENANCE_EVIDENCE_HOLD');
 assert.equal(x.domains.length,4);
 assert.equal(x.domains[0].revisionHintRows,1);
 assert.equal(x.domains[0].timeHintRows,1);
 assert.equal(x.domains[3].revisionHintRows,1);
 assert.equal(x.sourceRevisionVerified,false);
 assert.equal(x.completeDatasetVerified,false);
 assert.equal(x.sourceDataFreshnessVerified,false);
 assert.equal(x.productionForecastCertified,false);
 assert.equal(x.actionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(x),/SECRET-1|JOB-1|BL-1/);
});
test('missing and oversized datasets fail closed, 50 rows warn sample limit',()=>{
 const d=data();d.INVENTORY=null;d.PRODUCTION.records=Array(51).fill({});
 d.ENGINEERING.baselines=Array(50).fill({id:'x'});
 const r=inspectG3SourceProvenance(d);
 assert.equal(r.domains[1].status,'INPUT_HOLD');
 assert.equal(r.domains[2].status,'INPUT_HOLD');
 assert.equal(r.domains[3].sampleAtLimit,true);
 assert.equal(r.domains[3].completeDatasetVerified,false);
});
test('source-supplied forged certification cannot pass any qualification',()=>{
 const d=data();
 d.ENGINEERING.certified=true;d.ENGINEERING.snapshotSigned=true;
 d.INVENTORY.completeDatasetVerified=true;d.PROCUREMENT.pagination={hasMore:false};
 const r=inspectG3SourceProvenance(d);
 for(const x of r.domains){
  assert.equal(x.paginationVerified,false);
  assert.equal(x.unitsVerified,false);
  assert.equal(x.engineeringReleaseVerified,false);
 }
 assert.equal(r.canRunRealDataOptimizer,false);
 assert.equal(r.actionAuthorized,false);
});
test('unparseable dates and absent version hints remain unverified',()=>{
 const d=data();d.PRODUCTION.records=[{created_at:'not-a-date',sales_order_revision:'',unit:4}];
 const r=inspectG3SourceProvenance(d);
 assert.equal(r.domains[2].timeHintRows,0);
 assert.equal(r.domains[2].revisionHintRows,0);
 assert.equal(r.domains[2].unitHintRows,0);
});
