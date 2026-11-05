import test from 'node:test';
import assert from 'node:assert/strict';
import {createVyndiReadBridgeClient,VYNDI_BRIDGE_KEY_ID} from './vyndi-read-bridge-client.mjs';
const readerFor=(data)=>createVyndiReadBridgeClient({
 signer:{async signVyndiBridgeRequest(){return {keyId:VYNDI_BRIDGE_KEY_ID,signature:'test-signature'}}},
 serviceBinding:{async fetch(_url,opts){const b=JSON.parse(opts.body);return new Response(JSON.stringify({ok:true,readOnly:true,effectClass:'read',actionType:b.actionType,sourceAuthority:'getAuthoritativeInventory',data}),{status:200})}},
 now:()=>1760000000000,nonce:()=> 'p01-source-receipt-test',
});
const job={actionType:'INVENTORY.OBSERVE_STOCK',id:'test-job',intentId:'test-intent',payload:{limit:100}};
test('signed bridge reports read effect and never source or write authority',async()=>{
 const out=await readerFor({records:[]}).execute(job);
 assert.equal(out.effectClass,'read');assert.equal(out.readOnly,true);
 assert.equal(out.sourceReceiptChecked,false);assert.equal(out.sourceCompletenessVerified,false);
 assert.equal(out.actionAuthorized,false);
});
test('content digest is checked and cannot be promoted to independent certification',async()=>{
 const rec={records:[{sku:'SKU-1',unit:'pcs',quantity_balance:5}],sourceCount:1,
 sourceKind:'inventory',sourceScope:'vyndi_inventory_balance:all',
 schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',
 sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false,
 asOf:'2026-11-05T04:00:00.000Z',asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
 complete:true,hasMore:false,readOnly:true,actionAuthorized:false,productionWriteAuthorized:false};
 const canonical=JSON.stringify({records:[{quantity_balance:5,sku:'SKU-1',unit:'pcs'}],sourceCount:1,sourceKind:'inventory',sourceScope:rec.sourceScope});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 rec.sourceRevision=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 const out=await readerFor(rec).execute(job);
 assert.equal(out.sourceReceiptChecked,true);assert.equal(out.sourceCompletenessVerified,false);
 assert.equal(out.data.sourceRevision,rec.sourceRevision);
 await assert.rejects(()=>readerFor({...rec,sourceRevision:'f'.repeat(64)}).execute(job),e=>e.code==='VYNDI_SOURCE_RECEIPT_INVALID');
 await assert.rejects(()=>readerFor({...rec,sourceCompletenessVerified:true}).execute(job),e=>e.code==='VYNDI_SOURCE_RECEIPT_INVALID');
});

test('purchase-order content receipt uses exact typed scope and rejects tampered hashes',async()=>{
 const canonical={sourceKind:'purchaseOrders',sourceScope:'vyndi_purchase_orders:open_status_v1',
  sourceCount:1,records:[{id:'PO-11',status:'draft',record_revision:1}]};
 const text=JSON.stringify({records:[{id:'PO-11',record_revision:1,status:'draft'}],sourceCount:1,sourceKind:canonical.sourceKind,sourceScope:canonical.sourceScope});
 const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
 const data={schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',...canonical,sourceRevision:h,
  asOf:'2026-11-05T05:00:00.000Z',complete:true,hasMore:false,
  sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false,
  asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',readOnly:true,
  actionAuthorized:false,productionWriteAuthorized:false};
 const {checkVyndiSourceReceipt}=await import('./vyndi-source-receipt.mjs');
 assert.equal(await checkVyndiSourceReceipt('PROCUREMENT.OBSERVE_OPEN_POS',data),true);
 await assert.rejects(()=>checkVyndiSourceReceipt('PROCUREMENT.OBSERVE_OPEN_POS',{...data,records:[{id:'PO-11',status:'issued',record_revision:1}]}),
 e=>e.code==='VYNDI_SOURCE_RECEIPT_INVALID');
});
