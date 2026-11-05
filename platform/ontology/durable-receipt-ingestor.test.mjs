import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDurableReceiptIngestor} from './durable-receipt-ingestor.mjs';
const fixture=async()=>{const data={
 sourceKind:'inventory',sourceScope:'vyndi_inventory_balance:all',
 sourceCount:1,records:[{sku:'F-1',unit:'pcs',quantity_balance:2}],
 schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',
 sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false,
 asOf:'2026-11-05T04:00:00.000Z',asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
 complete:true,hasMore:false,readOnly:true,
 actionAuthorized:false,productionWriteAuthorized:false};
 const canonical=JSON.stringify({records:[{quantity_balance:2,sku:'F-1',unit:'pcs'}],sourceCount:1,
  sourceKind:'inventory',sourceScope:'vyndi_inventory_balance:all'});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 data.sourceRevision=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 return {actionType:'INVENTORY.OBSERVE_STOCK',sourceAuthority:'getAuthoritativeInventory',
  effectClass:'read',readOnly:true,sourceReceiptChecked:true,sourceCompletenessVerified:false,
  actionAuthorized:false,productionWriteAuthorized:false,data};
};
test('disabled by default: no store call',async()=>{
 let calls=0;const adapter=createDurableReceiptIngestor({writeReceipt:async()=>{calls++;}});
 const result=await adapter.store(await fixture());
 assert.equal(result.status,'HOLD');assert.equal(calls,0);
});
test('verified bounded observation reaches trusted store but is never agent usable',async()=>{
 let saved;const adapter=createDurableReceiptIngestor({enabled:true,
  writeReceipt:async data=>{saved=data;return {status:'SOURCE_UNVERIFIED',sourceKind:'inventory',
   receiptId:'r-1',durableReceiptStored:true,sourceCompletenessVerified:false,
   agentUsable:false,actionAuthorized:false,productionWriteAuthorized:false}}});
 const r=await adapter.store(await fixture());
 assert.equal(r.status,'SOURCE_UNVERIFIED');assert.equal(r.agentUsable,false);
 assert.equal(r.productionWriteAuthorized,false);assert.equal(saved.sourceCount,1);
});
test('tampered receipt, partial extract or unqualified execution never touches persistence',async()=>{
 const f=await fixture();let calls=0;const adapter=createDurableReceiptIngestor({enabled:true,
  writeReceipt:async()=>{calls++;return {status:'SOURCE_UNVERIFIED'}}});
 for(const row of [
  {...f,sourceReceiptChecked:false},
  {...f,data:{...f.data,complete:false,hasMore:true}},
  {...f,data:{...f.data,records:[{sku:'F-1',unit:'pcs',quantity_balance:99}]}},
  {...f,actionType:'PROCUREMENT.CREATE_PO'},
  {...f,productionWriteAuthorized:true,readOnly:false},
 ]){assert.equal((await adapter.store(row)).status,'HOLD');}
 assert.equal(calls,0);
});
test('receipt store failures or self-certified agent authority are HOLD',async()=>{
 const f=await fixture();
 const a=createDurableReceiptIngestor({enabled:true,writeReceipt:async()=>{throw Error('private secret')}});
 assert.equal((await a.store(f)).status,'HOLD');
 const b=createDurableReceiptIngestor({enabled:true,writeReceipt:async()=>({status:'SOURCE_UNVERIFIED',
  sourceKind:'inventory',durableReceiptStored:true,agentUsable:true,productionWriteAuthorized:true})});
 assert.equal((await b.store(f)).status,'HOLD');
});
test('migration is private, RLS enabled, server-key guarded and never promotes OBSERVED',async()=>{
 const sql=await readFile(new URL('../../supabase/migrations/20261105060000_ontology_receipt_persistence_v1.sql',import.meta.url),'utf8');
 for(const marker of ['ontology_source_receipts','ontology_projection_objects','ontology_source_watermarks',
  'enable row level security','assert_server_key','pg_advisory_xact_lock',
  'OUT_OF_ORDER_OR_CONFLICTING_RECEIPT','SOURCE_UNVERIFIED',
  'revoke all on function public.vaos_ontology_ingest_read_receipt_v1']){
  assert.ok(sql.includes(marker),marker);
 }
 assert.ok(!sql.includes("'OBSERVED'"));
 assert.match(sql,/schemaVersion' is distinct from 'VYNDI_ONTOLOGY_READ_RECEIPT_V1'/);
 assert.match(sql,/sourceRevisionAuthority' is distinct from 'CONTENT_DIGEST_ONLY'/);
 assert.match(sql,/if v_old_as_of = v_as_of and v_old_digest = v_digest/);
 assert.match(sql,/'replay',true/);
});

test('only the expected signed read authority may submit an unprivileged observation',async()=>{
 const good=await fixture();let writes=0;
 const adapter=createDurableReceiptIngestor({enabled:true,
  writeReceipt:async()=>{writes++;return {status:'SOURCE_UNVERIFIED'};}});
 for(const observation of [
  {...good,sourceAuthority:'self-certified'},
  {...good,actionAuthorized:true},
  {...good,productionWriteAuthorized:true},
 ]){
  const result=await adapter.store(observation);
  assert.equal(result.status,'HOLD');
 }
 assert.equal(writes,0);
});
test('persistence cannot confirm a receipt without identity and explicit non-authority',async()=>{
 const good=await fixture();
 const valid={status:'SOURCE_UNVERIFIED',sourceKind:'inventory',receiptId:'r-1',
  durableReceiptStored:true,sourceCompletenessVerified:false,agentUsable:false,
  actionAuthorized:false,productionWriteAuthorized:false};
 for(const bad of [
  {...valid,receiptId:null},
  {...valid,receiptId:' '},
  {...valid,sourceCompletenessVerified:true},
  {...valid,actionAuthorized:true},
  {...valid,actionAuthorized:undefined},
 ]){
  const result=await createDurableReceiptIngestor({enabled:true,
   writeReceipt:async()=>bad}).store(good);
  assert.equal(result.status,'HOLD');
  assert.equal(result.agentUsable,false);
  assert.equal(result.productionWriteAuthorized,false);
 }
});
