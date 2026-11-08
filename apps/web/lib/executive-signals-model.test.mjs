import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveExecutiveSignals} from './executive-signals-model.mjs';
const base=(datasets)=>({schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,scope:'all',period:{from:'2026-10-10',to:'2026-11-08'},departments:[],
 executiveSignals:{schemaVersion:'VYNDI_EXECUTIVE_SIGNALS_V1',readOnly:true,observedAt:'2026-11-08T10:00:00Z',datasets}});
const scope={from:'2026-10-10',to:'2026-11-08'};
test('canonical sources are displayed independently and only source-returned totals are accepted',()=>{
 const view=deriveExecutiveSignals(base({crmCustomers:{status:'OBSERVED',total:3,rows:[{category:'dealer',status:'active',record_count:3}],source:'VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE'},
 crmFollowups:{status:'OBSERVED',total:7,rows:[{category:'followup',status:'overdue',record_count:2},{category:'followup',status:'completed',record_count:5}]}}),scope);
 assert.equal(view.datasets.length,7);
 assert.equal(view.datasets.find(x=>x.id==='crmCustomers').total,3);
 assert.equal(view.datasets.find(x=>x.id==='crmFollowups').attentionRecords,2);
 assert.equal(view.datasets.find(x=>x.id==='hrWorkforce').status,'HOLD');
 assert.equal(view.businessTruthCertified,false);
 assert.equal(view.crossFamilyTotalsAdditive,false);
});
test('missing, malformed or inconsistent dataset stays HOLD without inventing zero',()=>{
 const result=deriveExecutiveSignals(base({
 crmCustomers:{status:'OBSERVED',total:9,rows:[{category:'dealer',status:'active',record_count:3}]},
 crmFollowups:{status:'HOLD',total:null,rows:[]}
 }),scope);
 assert.equal(result.datasets.find(x=>x.id==='crmCustomers').total,null);
 assert.equal(result.datasets.find(x=>x.id==='crmCustomers').status,'HOLD');
 assert.equal(result.datasets.find(x=>x.id==='crmFollowups').total,null);
 assert.equal(result.datasets.find(x=>x.id==='hrWorkforce').total,null);
});
test('source integrity, date and identity-free aggregate shape enforced',()=>{
 assert.throws(()=>deriveExecutiveSignals(base({}),{from:'2026-10-01',to:'2026-11-08'}));
 assert.throws(()=>deriveExecutiveSignals({...base({}),readOnly:false},scope));
 const bad=deriveExecutiveSignals(base({hrWorkforce:{status:'OBSERVED',total:1,rows:[{category:'employee',status:'active',record_count:1,email:'personal@example.com'}]}}),scope);
 assert.equal(bad.datasets.find(x=>x.id==='hrWorkforce').status,'HOLD');
});
test('dispatch without issued invoice is an investigation signal, not proof of delivery',()=>{
 const res=deriveExecutiveSignals(base({dispatch:{status:'OBSERVED',total:4,rows:[
 {category:'dispatch',status:'dispatched / invoice none',record_count:3},
 {category:'dispatch',status:'delivered / invoice issued',record_count:1}
 ]}}),scope);
 const d=res.datasets.find(x=>x.id==='dispatch');
 assert.equal(d.attentionRecords,3);
 assert.match(d.nextReview,/invoice/i);
 assert.equal(d.deliveryCertified,false);
});
