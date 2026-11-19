/** Verify internal source-content consistency only. A digest is NOT a signed DB revision. */
export const VYNDI_SOURCE_RECEIPT_ROUTES=Object.freeze({
 'INVENTORY.OBSERVE_STOCK':Object.freeze({kind:'inventory',scope:'vyndi_inventory_balance:all'}),
 'PROCUREMENT.OBSERVE_SHORTAGE':Object.freeze({kind:'shortages',scope:'vyndi_live_job_card_requirements:released_in_progress_positive_shortage'}),
 'PROCUREMENT.OBSERVE_OPEN_POS':Object.freeze({kind:'purchaseOrders',scope:'vyndi_purchase_orders:open_status_v1'}),
});
function bad(){const e=Error('VYNDI_SOURCE_RECEIPT_INVALID');e.code='VYNDI_SOURCE_RECEIPT_INVALID';throw e;}
function stable(x){
 if(Array.isArray(x))return x.map(stable);
 if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
 return x;
}
function iso(s){
 if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/.test(s))return false;
 const ms=Date.parse(s);return Number.isFinite(ms)&&new Date(ms).toISOString()===s.replace(/(?:\.([0-9]{1,3}))?Z$/,(_m,f)=>'.'+(f||'').padEnd(3,'0')+'Z');
}
/** A digest alone does not establish unique business entities. Match the
 * producer's canonical keys independently, without importing producer code. */
function canonicalSourceIdentity(kind,row){
 if(!row||typeof row!=='object'||Array.isArray(row))bad();
 const keys=kind==='inventory'?['sku','unit']:
  kind==='shortages'?['job_card_id','job_card_line_id','sku']:
  kind==='purchaseOrders'?['id']:null;
 if(!keys)bad();
 const parts=keys.map(key=>row[key]);
 if(parts.some(value=>typeof value!=='string'||value.length===0||value.trim()!==value))bad();
 // Line identity is global; parent job and stock code are still mandatory.
 return kind==='shortages'?JSON.stringify([row.job_card_line_id]):JSON.stringify(parts);
}
/** New VYNDI scope digest is an SQL-content observation, not a CDC revision.
 * Legacy V1 receipts omit all four fields; partial/fake claims fail closed. */
function checkDatabaseScopeObservation(data){
 const names=['sourceScopeFingerprint','sourceMvccSnapshot',
  'sourceFingerprintAuthority','sourceSnapshotAuthority'];
 if(!names.some(k=>Object.hasOwn(data,k)))return;
 if(names.some(k=>!Object.hasOwn(data,k)))bad();
 if(!/^[a-f0-9]{64}$/.test(data.sourceScopeFingerprint||'')||
  data.sourceFingerprintAuthority!=='SAME_STATEMENT_SQL_CONTENT_DIGEST'||
  data.sourceSnapshotAuthority!=='PG_MVCC_SNAPSHOT_NOT_SOURCE_REVISION')
  bad();
 const token=data.sourceMvccSnapshot;
 if(typeof token!=='string'||token.length>4096)bad();
 const match=/^(\d+):(\d+):((?:\d+(?:,\d+)*)?)$/.exec(token);
 if(!match)bad();
 const low=BigInt(match[1]),high=BigInt(match[2]);
 if(low>high)bad();
 if(match[3]&&match[3].split(',').some(n=>{
   const v=BigInt(n);return v<low||v>=high;
 }))bad();
}

export async function checkVyndiSourceReceipt(actionType,data){
 const expected=VYNDI_SOURCE_RECEIPT_ROUTES[actionType];
 if(!expected||!data||typeof data!=='object'||data.schemaVersion===undefined)return false;
 if(data.schemaVersion!=='VYNDI_ONTOLOGY_READ_RECEIPT_V1'||
   data.sourceKind!==expected.kind||data.sourceScope!==expected.scope||
   data.readOnly!==true||data.actionAuthorized!==false||
   data.productionWriteAuthorized!==false||data.sourceCompletenessVerified!==false||
   data.sourceRevisionAuthority!=='CONTENT_DIGEST_ONLY'||
   data.asOfAuthority!=='EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME'||
   !Array.isArray(data.records)||data.records.length>100||
   !Number.isSafeInteger(data.sourceCount)||data.sourceCount<data.records.length||
   data.complete!==(data.sourceCount===data.records.length)||
   data.hasMore!==(data.sourceCount>data.records.length)||
   !iso(data.asOf)||!/^[a-f0-9]{64}$/.test(data.sourceRevision||''))bad();
 checkDatabaseScopeObservation(data);
 // Validate identity before treating an internally consistent hash as checked.
 // An empty first page when sourceCount is nonzero is not an admissible extract.
 if(data.sourceCount>0&&data.records.length===0)bad();
 const seen=new Set();
 for(const row of data.records){
  const id=canonicalSourceIdentity(expected.kind,row);
  if(seen.has(id))bad();
  seen.add(id);
 }
 const canonical=JSON.stringify(stable({sourceKind:data.sourceKind,sourceScope:data.sourceScope,sourceCount:data.sourceCount,records:data.records}));
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==data.sourceRevision)bad();
 return true;
}
