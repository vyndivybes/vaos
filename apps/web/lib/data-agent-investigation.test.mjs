import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDataAgentSources} from './data-agent-report.mjs';
import {buildDataAgentInvestigation} from './data-agent-investigation.mjs';

const records={
 procurement:{records:[
  {sku:'SECRET-SKU-A',unit:'pcs',sales_order_id:'PRIVATE-ORDER-A',
   bom_revision:'BOM-A',required_quantity:4,shortage_quantity:2},
  {sku:'SECRET-SKU-B',unit:'kg',sales_order_id:'PRIVATE-ORDER-B',
   bom_revision:'BOM-B',required_quantity:3,shortage_quantity:1}]},
 inventory:{records:[{sku:'SECRET-SKU-A',unit:'kg',quantity_balance:8}]},
 production:{records:[{id:'PRIVATE-JOB',sales_order_id:'PRIVATE-ORDER-A',
  bom_revision:'BOM-OLD',status:'released',units:1,approved_at:null}]},
 engineering:{baselines:[{id:'PRIVATE-BASE',status:'released',revision_code:'REV1',bom_revision:null}],
  changeOrders:[]}
};
const observed=Object.entries(records).map(([domain,data])=>({domain,status:'OBSERVED',data}));
test('business delay and root cause questions discover the four existing crosswalk sources',()=>{
 assert.deepEqual(selectDataAgentSources('Why is production delayed?').domains,
  ['procurement','inventory','production','engineering']);
 assert.equal(selectDataAgentSources('Why is production delayed?').investigate,true);
 assert.equal(selectDataAgentSources('Find the root cause of material shortages').investigate,true);
 assert.equal(selectDataAgentSources('Analyse finance and procurement').investigate,false);
 assert.equal(selectDataAgentSources('Why is our financial position weak?').investigate,false);
 assert.equal(selectDataAgentSources('Please approve a job card').status,'DENIED');
});
test('existing G3.1E crosswalk reveals actual observed revision, unit and provenance discrepancies without raw identifiers',()=>{
 const result=buildDataAgentInvestigation({question:'Why is production delayed?',observations:observed});
 assert.equal(result.schemaVersion,'VAOS_DATA_AGENT_INVESTIGATION_V1');
 assert.equal(result.status,'BOUNDED_EVIDENCE');
 assert.equal(result.actionAuthorized,false);
 assert.equal(result.causalProofEstablished,false);
 assert.equal(result.completeDatasetVerified,false);
 assert.equal(result.findings.find(x=>x.code==='OBSERVED_JOB_BOM_REVISION_CONFLICT')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='OBSERVED_SKU_UNIT_RELATION_UNRECONCILED')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='PRODUCTION_RELEASE_APPROVAL_TIMESTAMP_UNOBSERVED')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='RELEASED_ENGINEERING_BASELINES_WITHOUT_BOM')?.observedCount,1);
 assert.equal(result.findings.find(x=>x.code==='INVENTORY_SKU_NOT_IN_SAMPLE')?.classification,'SAMPLE_COVERAGE_GAP');
 assert.ok(result.findings.every(x=>x.action&&x.sourceDomains.length>0));
 const text=JSON.stringify(result);
 for(const raw of ['SECRET-SKU-A','PRIVATE-ORDER-A','BOM-OLD','PRIVATE-JOB','PRIVATE-BASE'])
  assert.ok(!text.includes(raw),raw);
 assert.ok(!/proven (root )?cause/i.test(text));
});
test('missing or malformed linked observations result in HOLD, not an empty green pass',()=>{
 for(const sample of [
  observed.filter(x=>x.domain!=='inventory'),
  observed.map(x=>x.domain==='production'?{...x,status:'HOLD',data:null}:x),
  observed.map(x=>x.domain==='procurement'?{...x,data:{records:'not an array'}}:x),
 ]){
  const result=buildDataAgentInvestigation({question:'Find blockers',observations:sample});
  assert.equal(result.status,'SOURCE_HOLD');
  assert.equal(result.findings.length,0);
  assert.equal(result.causalProofEstablished,false);
  assert.ok(result.holds.length>0);
 }
});
test('no crosswalk discrepancy in a bounded sample is not a conclusion of zero business risk',()=>{
 const same={
  procurement:{records:[{sku:'SKU',unit:'pcs',sales_order_id:'ORDER',bom_revision:'B1'}]},
  inventory:{records:[{sku:'SKU',unit:'pcs'}]},
  production:{records:[{id:'JOB',sales_order_id:'ORDER',bom_revision:'B1',status:'draft'}]},
  engineering:{baselines:[{id:'B1',status:'draft',bom_revision:null}],changeOrders:[]}
 };
 const report=buildDataAgentInvestigation({question:'Why are orders delayed?',
  observations:Object.entries(same).map(([domain,data])=>({domain,status:'OBSERVED',data}))});
 assert.equal(report.status,'BOUNDED_EVIDENCE');
 assert.equal(report.findings.length,0);
 assert.match(report.summary,/No discrepancy detected within the selected rows/);
 assert.match(report.summary,/not proof/);
});
