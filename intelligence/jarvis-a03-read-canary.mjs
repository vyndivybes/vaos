/**
 * A03 bounded execution pilot. Invokes only the three previously approved
 * VYNDI signed READ actions. No action policy changes, mission closure,
 * autonomous dispatch, financial posting, stock, procurement or release.
 * All source metadata remains CONTENT_DIGEST_ONLY, never DB certified.
 */
import {checkVyndiSourceReceipt,VYNDI_SOURCE_RECEIPT_ROUTES} from '../platform/execution/vyndi-source-receipt.mjs';
import {getVyndiBridgeRoute} from '../packages/contracts/vyndi-write-bridge.mjs';

const ROUTES=Object.freeze(Object.entries(VYNDI_SOURCE_RECEIPT_ROUTES).map(([actionType,x])=>{
 const route=getVyndiBridgeRoute(actionType);
 if(!route||route.effectClass!=='read'||route.executionEnabled!==true||
  typeof route.authority!=='string')throw Error('A03_READ_ROUTE_NOT_QUALIFIED');
 return Object.freeze({actionType,sourceKind:x.kind,sourceScope:x.scope,authority:route.authority});
}));
const empty=(sourceKind,status)=>Object.freeze({sourceKind,status,sourceCount:null,
 verifiedContentDigest:null,authoritativeRevisionVerified:false,
 sourceCompletenessVerified:false,sameTransactionSnapshotVerified:false,
 productionWriteAuthorized:false});
const base=Object.freeze({
 schemaVersion:'VAOS_JARVIS_A03_SIGNED_READ_CANARY_V1',
 mission:'JARVIS-A03-MANUAL-READ',mode:'FOUNDER_MANUAL_SIGNED_READ',
 qualificationStatus:'HOLD',
 independentBusinessFactsCertified:false,
 sourceCompletenessVerified:false,sameTransactionSnapshotVerified:false,
 businessSourceAuthorityVerified:false,
 businessWritesExecuted:0,modelCalls:0,
 productionWriteAuthorized:false,actionAuthorized:false,
 agentDispatchAuthorized:false,readOnly:true
});
const isoTime=(v,now)=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&
 Date.parse(v)<=now+60000&&now-Date.parse(v)<=900000;
function qualify(reply,route,now){
 if(reply?.actionType!==route.actionType||
  reply?.sourceAuthority!==route.authority||
  reply?.effectClass!=='read'||reply?.readOnly!==true||
  reply?.sourceReceiptChecked!==true||
  reply?.sourceCompletenessVerified!==false||
  reply?.actionAuthorized!==false||
  reply?.productionWriteAuthorized!==false)
  return 'SIGNED_READ_AUTHORITY_INVALID';
 const d=reply.data;
 if(d?.sourceKind!==route.sourceKind||d?.sourceScope!==route.sourceScope||
   d?.readOnly!==true||d?.actionAuthorized!==false||
   d?.productionWriteAuthorized!==false)
  return 'SIGNED_SOURCE_SCOPE_INVALID';
 if(d?.complete!==true||d?.hasMore!==false||!Number.isSafeInteger(d?.sourceCount)||
  d.sourceCount<0||d.sourceCount>100||d.records?.length!==d.sourceCount)
  return 'SOURCE_PAGE_INCOMPLETE';
 if(!isoTime(d.asOf,now))return 'SOURCE_EXTRACT_STALE';
 return null;
}
export async function runA03SignedReadCanary({reader,now=()=>Date.now()}={}){
 const checkedAt=now();
 if(!Number.isFinite(checkedAt))throw Error('A03_CLOCK_INVALID');
 if(typeof reader?.execute!=='function')
  return Object.freeze({...base,status:'HOLD',
   holds:Object.freeze(['SIGNED_READER_UNAVAILABLE']),
   externalReadInvocations:0,
   sources:Object.freeze(ROUTES.map(r=>empty(r.sourceKind,'NOT_ATTEMPTED')))});
 const sources=[],holds=[];
 let invoked=0;
 for(const route of ROUTES){
  if(holds.length){
   sources.push(empty(route.sourceKind,'NOT_ATTEMPTED'));continue;
  }
  invoked++;
  let reply;
  try{
   reply=await reader.execute({
    id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    actionType:route.actionType,
    payload:{missionId:'jarvis:a03:founder-read-canary',limit:100}
   });
  }catch{holds.push('SIGNED_READ_UNAVAILABLE');sources.push(empty(route.sourceKind,'HOLD'));continue;}
  let reason=qualify(reply,route,checkedAt);
  if(!reason){
   try{if(await checkVyndiSourceReceipt(route.actionType,reply.data)!==true)
     reason='SIGNED_RECEIPT_REJECTED';}
   catch{reason='SIGNED_RECEIPT_REJECTED';}
  }
  if(reason){holds.push(route.sourceKind.toUpperCase()+':'+reason);
   sources.push(empty(route.sourceKind,'HOLD'));continue;}
  sources.push(Object.freeze({
   ...empty(route.sourceKind,'SIGNED_BOUNDED_OBSERVATION'),
   sourceCount:reply.data.sourceCount,
   verifiedContentDigest:reply.data.sourceRevision,
   scopedQueryCompletenessObserved:true,
   asOf:reply.data.asOf
  }));
 }
 return Object.freeze({
  ...base,status:holds.length?'HOLD':'BOUNDED_READ_COMPLETE',
  holds:Object.freeze([...new Set([...holds,'INDEPENDENT_SOURCE_REVISION_REQUIRED',
   'CROSS_SOURCE_TRANSACTION_SNAPSHOT_UNVERIFIED','A03_OPERATIONAL_QUALIFICATION_PENDING'])]),
  externalReadInvocations:invoked,
  sources:Object.freeze(sources)
 });
}
