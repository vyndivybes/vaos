import test from 'node:test';
import assert from 'node:assert/strict';
import {runA01SpecialistReview} from './jarvis-a01-specialists.mjs';
const sample={
 'PROCUREMENT.OBSERVE_SHORTAGE':{records:[{sku:'PRIVATE-SKU-ALPHA',unit:'pcs',sales_order_id:'SO-PRIVATE',bom_revision:'BOM-A',shortage_quantity:2,required_quantity:4}]},
 'INVENTORY.OBSERVE_STOCK':{records:[{sku:'PRIVATE-SKU-ALPHA',unit:'kg',quantity_balance:2}]},
 'PRODUCTION.OBSERVE_WIP':{records:[{id:'PRIVATE-JOB',status:'released',units:1,sales_order_id:'SO-PRIVATE',bom_revision:'BOM-B',approved_at:null}]},
 'ENGINEERING.OBSERVE_CONFIGURATION':{baselines:[{id:'PRIVATE-ENG',status:'released',revision_code:'REV-A',bom_revision:null}],changeOrders:[]},
};
const authority={
 'PROCUREMENT.OBSERVE_SHORTAGE':'getConfiguredDemandShortages',
 'INVENTORY.OBSERVE_STOCK':'getAuthoritativeInventory',
 'PRODUCTION.OBSERVE_WIP':'getProductionJobCards',
 'ENGINEERING.OBSERVE_CONFIGURATION':'getEngineeringChangeControlState',
};
function fakeReader({missing=null,forged=null}={}){
 const calls=[];
 return {calls,reader:{async execute(job){
  calls.push(job);
  if(job.actionType===missing)throw Error('private source error');
  return {actionType:job.actionType,sourceAuthority:job.actionType===forged?'WRONG':authority[job.actionType],
   readOnly:true,effectClass:'read',actionAuthorized:false,productionWriteAuthorized:false,data:sample[job.actionType]};
 }}};
}
test('four signed cross-domain reads produce only scrubbed discrepancy findings, never transaction authority',async()=>{
 const h=fakeReader();
 const out=await runA01SpecialistReview({reader:h.reader});
 assert.equal(out.status,'BOUNDED_EVIDENCE');
 assert.deepEqual(h.calls.map(x=>x.actionType),Object.keys(sample));
 assert.ok(h.calls.every(x=>x.payload.limit===50));
 assert.ok(out.findings.some(x=>x.code==='OBSERVED_SKU_UNIT_RELATION_UNRECONCILED'));
 assert.ok(out.findings.some(x=>x.code==='OBSERVED_JOB_BOM_REVISION_CONFLICT'));
 assert.equal(out.sourceRevisionVerified,false);
 assert.equal(out.causalProofEstablished,false);
 assert.equal(out.actualProductionIncidentConfirmed,false);
 assert.equal(out.productionWriteAuthorized,false);
 assert.equal(out.aiModelInvocations,0);
 assert.ok(!JSON.stringify(out).includes('PRIVATE-'));
});
test('unavailable or forged engineering authority returns source HOLD, not invented root cause',async()=>{
 for(const kw of [{missing:'ENGINEERING.OBSERVE_CONFIGURATION'},{forged:'ENGINEERING.OBSERVE_CONFIGURATION'}]){
  const h=fakeReader(kw);const out=await runA01SpecialistReview({reader:h.reader});
  assert.equal(out.status,'SOURCE_HOLD');
  assert.equal(out.findings.length,0);
  assert.equal(out.causalProofEstablished,false);
 }
});
test('missing reader fails closed with zero model calls',async()=>{
 const result=await runA01SpecialistReview({reader:null});
 assert.equal(result.status,'SOURCE_HOLD');
 assert.equal(result.aiModelInvocations,0);
});
