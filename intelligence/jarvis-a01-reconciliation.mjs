/** A01: cross-check independently signed source reads with VAOS durable projections.
 * Two VYNDI reads can demonstrate internal stability but never establish
 * authoritative source revision or independently certified completeness.
 * This is evidence diagnostics, not autonomous decision authorization.
 */
import {checkVyndiSourceReceipt,VYNDI_SOURCE_RECEIPT_ROUTES} from '../platform/execution/vyndi-source-receipt.mjs';
import {getVyndiBridgeRoute} from '../packages/contracts/vyndi-write-bridge.mjs';

export const A01_SOURCE_KINDS=Object.freeze(['inventory','shortages','purchaseOrders']);
const ROUTES=Object.freeze(Object.fromEntries(
 Object.entries(VYNDI_SOURCE_RECEIPT_ROUTES).map(([actionType,config])=>[
  config.kind,{actionType,scope:config.scope,authority:getVyndiBridgeRoute(actionType)?.authority}
 ])));
const fail=code=>{throw Error(code);};
const finiteTime=value=>typeof value==='string'&&value.endsWith('Z')&&
 Number.isFinite(Date.parse(value))?Date.parse(value):null;

export function createA01SourceEvidence(reads){
 if(!reads||typeof reads!=='object'||Array.isArray(reads))fail('A01_EVIDENCE_INVALID');
 return Object.freeze(Object.fromEntries(A01_SOURCE_KINDS.map(kind=>[kind,reads[kind]??null])));
}
async function inspectSingle(kind,reply,now){
 const expected=ROUTES[kind];
 if(!reply)return {valid:false,hold:'SIGNED_READ_UNAVAILABLE'};
 if(reply.actionType!==expected.actionType||reply.sourceAuthority!==expected.authority||
   reply.effectClass!=='read'||reply.readOnly!==true||
   reply.actionAuthorized!==false||reply.productionWriteAuthorized!==false||
   reply.sourceReceiptChecked!==true||reply.sourceCompletenessVerified!==false)
  return {valid:false,hold:'SIGNED_READ_AUTHORITY_INVALID'};
 const d=reply.data;
 if(d?.complete!==true||d?.hasMore!==false||d?.sourceCount>100)
  return {valid:false,hold:'SOURCE_PAGE_INCOMPLETE'};
 try{
  if(await checkVyndiSourceReceipt(expected.actionType,d)!==true)
   return {valid:false,hold:'SOURCE_RECEIPT_INVALID'};
 }catch{return {valid:false,hold:'SOURCE_RECEIPT_INVALID'};}
 const extractedAt=finiteTime(d.asOf);
 if(extractedAt===null||extractedAt>now+60000||now-extractedAt>900000)
  return {valid:false,hold:'SOURCE_EXTRACT_STALE'};
 return {valid:true,revision:d.sourceRevision,count:d.sourceCount,extractedAt:d.asOf};
}
function inspectProjection(kind,entry,count,now){
 const slo=kind==='purchaseOrders'?3600:900;
 if(!entry||entry.sourceKind!==kind||
  entry.status!=='SOURCE_UNVERIFIED'||entry.reason!=='SOURCE_REVISION_UNVERIFIED'||
  !Number.isSafeInteger(entry.observedCount)||entry.observedCount<0||
  !Number.isSafeInteger(entry.projectionCount)||entry.projectionCount<0||
  entry.sloSeconds!==slo||!Number.isSafeInteger(entry.receiptAgeSeconds)||
  entry.receiptAgeSeconds<0||entry.receiptAgeSeconds>slo)
   return 'PROJECTION_NOT_QUALIFIED';
 const checked=finiteTime(entry.lastExtractedAt);
 if(checked===null||checked>now+60000||now-checked>slo*1000+60000)
  return 'PROJECTION_STALE';
 if(entry.observedCount!==entry.projectionCount||entry.observedCount!==count)
  return 'PROJECTION_COUNT_DRIFT';
 return null;
}

/** All findings are metadata; raw source rows are never returned or stored. */
export async function reconcileA01Sources({first,second,health,now=Date.now()}={}){
 if(!first||!second||!Number.isFinite(now))fail('A01_EVIDENCE_INVALID');
 const healthAuthorized=health?.status==='HOLD'&&
  health?.readOnly===true&&health?.actionAuthorized===false&&
  health?.sourceCompletenessVerified===false&&health?.agentUsable===false&&
  health?.productionWriteAuthorized===false&&
  Array.isArray(health.sources)&&health.sources.length===3&&
  new Set(health.sources.map(s=>s.sourceKind)).size===3;
 const sources=await Promise.all(A01_SOURCE_KINDS.map(async kind=>{
  const [a,b]=await Promise.all([
   inspectSingle(kind,first[kind],now),inspectSingle(kind,second[kind],now)
  ]);
  const holds=[];
  if(!a.valid)holds.push(a.hold);
  if(!b.valid)holds.push(b.hold);
  if(a.valid&&b.valid&&(a.revision!==b.revision||a.count!==b.count))
   holds.push('SIGNED_READ_DRIFT');
  if(a.valid&&b.valid&&!holds.length){
   const projectionHold=healthAuthorized
    ?inspectProjection(kind,health.sources.find(s=>s.sourceKind===kind),a.count,now)
    :'DURABLE_PROJECTION_UNAVAILABLE';
   if(projectionHold)holds.push(projectionHold);
  }else if(!healthAuthorized)holds.push('DURABLE_PROJECTION_UNAVAILABLE');
  return Object.freeze({sourceKind:kind,
   consistency:holds.length?'HOLD':'MATCHED',
   observationCount:a.valid?a.count:null,
   contentDigest:a.valid?a.revision:null,
   secondReadDigest:b.valid?b.revision:null,
   checkedAt:new Date(now).toISOString(),
   ...(a.valid?{extractedAt:a.extractedAt}:{}),
   sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',
   authoritativeRevisionVerified:false,sourceCompletenessVerified:false,
   projectionReconciled:holds.length===0,
   readOnly:true,productionWriteAuthorized:false,holds:[...new Set(holds)]});
 }));
 const consistencyGate=sources.every(s=>s.consistency==='MATCHED')?'PASS':'HOLD';
 const holds=[...new Set([
  ...sources.flatMap(s=>s.holds.map(code=>s.sourceKind+':'+code)),
  'AUTHORITATIVE_DATABASE_REVISION_REQUIRED'
 ])];
 return Object.freeze({
  schemaVersion:'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1',
  mission:'JARVIS-A01',status:'HOLD',consistencyGate,
  sources,holds,sourceCount:sources.length,
  nextActions:consistencyGate==='PASS'
   ?['Obtain independently attributable VYNDI source revision/watermark',
     'Reconcile authorized inventory, shortage and PO ledger totals against source-of-record',
     'Qualify four-domain production investigation after source authority is established']
   :['Resolve signed-read, bounded-page, staleness or projection discrepancies',
     'Repeat signed source reconciliation before investigative recommendations'],
  businessSourceAuthorityVerified:false,canPrepareBusinessAction:false,
  independentBusinessFactsCertified:false,aiModelInvocations:0,
  userAuthorizationEscalated:false,readOnly:true,actionAuthorized:false,
  externalActionDispatched:false,productionWriteAuthorized:false
 });
}
