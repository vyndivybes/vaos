import test from 'node:test';
import assert from 'node:assert/strict';
import {checkVyndiSourceReceipt} from './vyndi-source-receipt.mjs';
const action='INVENTORY.OBSERVE_STOCK';
const data=async()=>{
 const input={sourceKind:'inventory',sourceScope:'vyndi_inventory_balance:all',
  sourceCount:1,records:[{sku:'PRIVATE-SKU',unit:'pcs',quantity_balance:2}]};
 const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?
  Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
 const digest=await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify(stable(input))));
 const sourceRevision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return {...input,schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',
  sourceRevision,asOf:'2026-11-19T13:20:00.000Z',complete:true,hasMore:false,
  sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',sourceCompletenessVerified:false,
  asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',readOnly:true,
  actionAuthorized:false,productionWriteAuthorized:false};
};
test('A01 VAOS independently validates signed VYNDI same-statement DB content fingerprint and MVCC syntax',async()=>{
 const base=await data();
 const richer={...base,sourceScopeFingerprint:'f'.repeat(64),
  sourceMvccSnapshot:'3423254:3423254:',
  sourceFingerprintAuthority:'SAME_STATEMENT_SQL_CONTENT_DIGEST',
  sourceSnapshotAuthority:'PG_MVCC_SNAPSHOT_NOT_SOURCE_REVISION'};
 assert.equal(await checkVyndiSourceReceipt(action,richer),true);
 assert.equal(await checkVyndiSourceReceipt(action,base),true,'old V1 receipts remain valid');
 assert.equal(richer.sourceCompletenessVerified,false);
 assert.equal(richer.sourceRevisionAuthority,'CONTENT_DIGEST_ONLY');
 assert.equal(richer.productionWriteAuthorized,false);
});
test('A01 malformed or incomplete fingerprint/snapshot pairs must fail closed',async()=>{
 const base=await data();const richer={...base,sourceScopeFingerprint:'f'.repeat(64),
  sourceMvccSnapshot:'3423254:3423254:',
  sourceFingerprintAuthority:'SAME_STATEMENT_SQL_CONTENT_DIGEST',
  sourceSnapshotAuthority:'PG_MVCC_SNAPSHOT_NOT_SOURCE_REVISION'};
 for(const x of [
  {sourceScopeFingerprint:undefined},
  {sourceMvccSnapshot:undefined},
  {sourceScopeFingerprint:'f'.repeat(40)},
  {sourceScopeFingerprint:'f'.repeat(63)+'Q'},
  {sourceMvccSnapshot:'broken'},
  {sourceMvccSnapshot:'9:2:'},
  {sourceMvccSnapshot:'3423254:3423254:9999999'},
  {sourceFingerprintAuthority:'CDC_CERTIFIED'},
  {sourceSnapshotAuthority:'SOURCE_REVISION_CERTIFIED'},
  {sourceCompletenessVerified:true},
  {sourceRevisionAuthority:'DATABASE_WAL_CDC'},
  {actionAuthorized:true},
  {productionWriteAuthorized:true}
 ])await assert.rejects(()=>checkVyndiSourceReceipt(action,{...richer,...x}),
  /VYNDI_SOURCE_RECEIPT_INVALID/);
});
test('A01 legacy source observation cannot smuggle new fingerprint authority claims without both evidence fields',async()=>{
 const base=await data();
 for(const change of [
  {sourceScopeFingerprint:'f'.repeat(64)},
  {sourceMvccSnapshot:'3423254:3423254:'},
  {sourceFingerprintAuthority:'SAME_STATEMENT_SQL_CONTENT_DIGEST'},
  {sourceSnapshotAuthority:'PG_MVCC_SNAPSHOT_NOT_SOURCE_REVISION'}
 ])await assert.rejects(()=>checkVyndiSourceReceipt(action,{...base,...change}),
  /VYNDI_SOURCE_RECEIPT_INVALID/);
});
