import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeA01IsolationDiagnostic} from '../../../intelligence/jarvis-a01-isolation-diagnostics.mjs';
import {createJarvisA01Handler} from './jarvis-a01.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';

function signedDiagnostic(){
 return {
  readOnly:true,effectClass:'read',sourceReceiptChecked:false,
  productionWriteAuthorized:false,
  actionType:'INVENTORY.OBSERVE_ISOLATION_DIAGNOSTICS',
  sourceAuthority:'getInventoryIsolationDiagnostics',
  employeeId:'inventory',
  data:{
   schemaVersion:'VYNDI_A01_ISOLATION_DIAGNOSTIC_V1',status:'HOLD',readOnly:true,
   sourceCompletenessVerified:false,tenantIdentityVerified:false,
   availableToPromiseAuthorized:false,businessWritesAuthorized:false,productionWriteAuthorized:false,
   sourceRevisionAuthority:'UNVERIFIED_MULTISTATEMENT_AUDIT',
   inventory:{ventureCount:2,sourceCount:2,overlappingKeyGroups:1,unpairedCount:0,
     negativeCount:1,invalidIdentityCount:0,boundedPageComplete:true},
   lineage:{jobCardsTotal:4,jobCardsWithoutTravellerVenture:3,ambiguousJobVentureCount:0,
     reservationsTotal:1,reservationsWithBrokenLineage:1,
     purchaseOrdersTotal:48,purchaseOrdersWithBrokenLineage:48},
   holds:['LEGAL_TENANT_MEMBERSHIP_UNVERIFIED','PO_PARENT_REVISION_UNVERIFIED'],
   records:[{sku:'FORBIDDEN-SKU',venture:'FORBIDDEN-VENTURE',amount:12345}],
  },
 };
}
test('A01 new diagnostic is a signed read-only inventory route, not a mutation',()=>{
 const route=getVyndiBridgeRoute('INVENTORY.OBSERVE_ISOLATION_DIAGNOSTICS');
 assert.equal(route.effectClass,'read');
 assert.equal(route.executionEnabled,true);
 assert.equal(route.authority,'getInventoryIsolationDiagnostics');
 assert.equal(route.employeeId,'inventory');
 assert.equal(route.approvalRequired,false);
});
test('A01 diagnostic strips all raw data and never certifies tenant or procurement',()=>{
 const d=normalizeA01IsolationDiagnostic(signedDiagnostic());
 assert.equal(d.status,'HOLD');
 assert.equal(d.readOnly,true);
 assert.equal(d.tenantIdentityVerified,false);
 assert.equal(d.businessWritesAuthorized,false);
 assert.equal(d.productionWriteAuthorized,false);
 assert.equal(d.sourceCompletenessVerified,false);
 assert.equal(d.inventory.ventureCount,2);
 assert.equal(d.lineage.purchaseOrdersWithBrokenLineage,48);
 assert.ok(d.holds.includes('PO_PARENT_REVISION_UNVERIFIED'));
 const json=JSON.stringify(d);
 assert.doesNotMatch(json,/FORBIDDEN-SKU|FORBIDDEN-VENTURE|12345|records|quantity_balance/);
});
test('A01 rejects forged authority, unknown HOLD code and unsafe counts',()=>{
 const original=signedDiagnostic();
 for(const changed of [
  {...original,sourceAuthority:'getAuthoritativeInventory'},
  {...original,data:{...original.data,tenantIdentityVerified:true}},
  {...original,data:{...original.data,holds:['FAKE-APPROVAL']}},
  {...original,data:{...original.data,inventory:{...original.data.inventory,ventureCount:-1}}},
  {...original,data:{...original.data,lineage:{...original.data.lineage,purchaseOrdersWithBrokenLineage:999}}},
 ]){
  const result=normalizeA01IsolationDiagnostic(changed);
  assert.equal(result.status,'HOLD');
  assert.ok(result.holds.includes('ISOLATION_DIAGNOSTIC_INVALID'));
  assert.equal(result.businessWritesAuthorized,false);
 }
});
test('founder-only A01 attaches signed source-ownership HOLD without leaking business rows',async()=>{
 let body=null,code=0,calls=0;
 const handler=createJarvisA01Handler({
  getSession:()=>({email:'shyamsundhar1982@gmail.com'}),
  getReader:()=>({async execute(job){
   calls++;
   if(job.actionType==='INVENTORY.OBSERVE_ISOLATION_DIAGNOSTICS')return signedDiagnostic();
   throw Error('PRIVATE-WORKFLOW-DATA');
  }}),
  getHealth:async()=>({status:'HOLD',readOnly:true,actionAuthorized:false,sourceCompletenessVerified:false,
   agentUsable:false,productionWriteAuthorized:false,sources:[]}),
  now:()=>Date.parse('2026-11-20T00:00:00Z'),
 });
 const res={setHeader(){return this},status(x){code=x;return this},json(x){body=x;return this}};
 await handler({method:'GET',url:'https://vaos.local/api/jarvis-a01',
  headers:{cookie:''},env:{VAOS_ONTOLOGY_SOURCE_CONTROL:'founder-readonly-v1'}},res);
 assert.equal(code,200);
 assert.equal(body.data.status,'HOLD');
 assert.equal(body.data.sourceIsolationDiagnostics.inventory.overlappingKeyGroups,1);
 assert.equal(body.data.sourceIsolationDiagnostics.lineage.reservationsWithBrokenLineage,1);
 assert.equal(body.data.sourceIsolationDiagnostics.productionWriteAuthorized,false);
 assert.equal(calls,7);
 assert.doesNotMatch(JSON.stringify(body),/PRIVATE-WORKFLOW-DATA|FORBIDDEN-VENTURE|FORBIDDEN-SKU/);
});
