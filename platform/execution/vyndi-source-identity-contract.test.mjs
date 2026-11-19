import assert from 'node:assert/strict';
import test from 'node:test';
import {checkVyndiSourceReceipt, VYNDI_SOURCE_RECEIPT_ROUTES} from './vyndi-source-receipt.mjs';

// Independently recompute receipts: do not import or trust the VYNDI OS
// receipt producer. Every failing fixture has a VALID content digest.
function stable(value) {
 if(Array.isArray(value)) return value.map(stable);
 if(value&&typeof value==='object') return Object.fromEntries(
  Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])
 );
 return value;
}
async function receipt(actionType,records,sourceCount=records.length) {
 const route=VYNDI_SOURCE_RECEIPT_ROUTES[actionType];
 const sourceKind=route.kind, sourceScope=route.scope;
 const digestInput=JSON.stringify(stable({sourceKind,sourceScope,sourceCount,records}));
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(digestInput));
 const sourceRevision=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 return {
  schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1', sourceKind,sourceScope,
  sourceCount,records,sourceRevision,asOf:'2026-11-19T08:00:00.000Z',
  sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false,
  asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
  complete:sourceCount===records.length,hasMore:sourceCount>records.length,
  readOnly:true,actionAuthorized:false,productionWriteAuthorized:false,
 };
}
const stock='INVENTORY.OBSERVE_STOCK';
const shortage='PROCUREMENT.OBSERVE_SHORTAGE';
const po='PROCUREMENT.OBSERVE_OPEN_POS';
async function invalid(action,rows,count=rows.length) {
 const data=await receipt(action,rows,count);
 await assert.rejects(()=>checkVyndiSourceReceipt(action,data),
  e=>e?.code==='VYNDI_SOURCE_RECEIPT_INVALID');
}

test('VAOS independently rejects hash-valid duplicate stock sku+unit IDs',async()=>{
 await invalid(stock,[{sku:'S1',unit:'pcs',quantity_balance:1},{sku:'S1',unit:'pcs',quantity_balance:2}]);
});
test('VAOS independently rejects missing and noncanonical inventory IDs',async()=>{
 for(const bad of [{unit:'pcs',quantity_balance:1},{sku:' ',unit:'pcs'},{sku:'S1',unit:' pcs'}])
  await invalid(stock,[bad]);
});
test('VAOS independently rejects duplicate shortage job-card line across jobs',async()=>{
 await invalid(shortage,[
  {job_card_id:'JOB-A',job_card_line_id:'LINE1',sku:'S1'},
  {job_card_id:'JOB-B',job_card_line_id:'LINE1',sku:'S2'}
 ]);
});
test('VAOS independently rejects missing shortage job-card and SKU lineage',async()=>{
 await invalid(shortage,[{job_card_id:'JOB-A',job_card_line_id:'LINE1'}]);
 await invalid(shortage,[{job_card_line_id:'LINE1',sku:'S1'}]);
});
test('VAOS independently rejects duplicate/missing PO IDs even if digest is correct',async()=>{
 await invalid(po,[{id:'PO1',status:'draft'},{id:'PO1',status:'issued'}]);
 await invalid(po,[{sku:'S1',status:'draft'}]);
 await invalid(po,[{id:' PO1',status:'draft'}]);
});
test('VAOS rejects a hash-valid empty bounded page claiming nonempty source',async()=>{
 await invalid(po,[],47);
});
test('VAOS accepts distinct stock units and still forbids any authority promotion',async()=>{
 const data=await receipt(stock,[{sku:'S1',unit:'pcs',quantity_balance:1},{sku:'S1',unit:'kg',quantity_balance:2}]);
 assert.equal(await checkVyndiSourceReceipt(stock,data),true);
 assert.equal(data.sourceCompletenessVerified,false);
 assert.equal(data.actionAuthorized,false);
 assert.equal(data.productionWriteAuthorized,false);
});
test('zero-shortage extract is checked but cannot certify absence of shortages',async()=>{
 const data=await receipt(shortage,[],0);
 assert.equal(await checkVyndiSourceReceipt(shortage,data),true);
 assert.equal(data.sourceCompletenessVerified,false);
});
