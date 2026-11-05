/** Founder-only source lineage metadata; no ERP rows or agent authority. */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const KINDS=Object.freeze([
 {kind:'inventory',type:'InventoryItem',slo:900},
 {kind:'shortages',type:'Shortage',slo:900},
 {kind:'purchaseOrders',type:'PurchaseOrder',slo:3600},
]);
const FIELDS=new Set(['sourceKind','objectType','status','reason','observedCount',
 'projectionCount','lastExtractedAt','receiptAgeSeconds','sloSeconds',
 'cancelledOriginDraftCount','otherObservedOrderCount']);
const hold=(reason)=>({status:'HOLD',reason,sources:[],readOnly:true,
 sourceCompletenessVerified:false,agentUsable:false,
 actionAuthorized:false,productionWriteAuthorized:false});
function valid(data){
 return data?.status==='HOLD'&&data.readOnly===true&&
  data.sourceCompletenessVerified===false&&data.agentUsable===false&&
  data.actionAuthorized===false&&data.productionWriteAuthorized===false&&
  Array.isArray(data.sources)&&data.sources.length===3&&
  data.sources.every((s,i)=>{
   const expected=KINDS[i];
   return s&&typeof s==='object'&&!Array.isArray(s)&&
    Object.keys(s).every(k=>FIELDS.has(k))&&
    s.sourceKind===expected.kind&&s.objectType===expected.type&&
    s.sloSeconds===expected.slo&&['HOLD','SOURCE_UNVERIFIED'].includes(s.status)&&
    ['NO_SIGNED_RECEIPT','RECEIPT_CLOCK_AHEAD','EXTRACTION_OVERDUE','PROJECTION_DRIFT','SOURCE_REVISION_UNVERIFIED'].includes(s.reason)&&
    (s.status==='SOURCE_UNVERIFIED'
      ? s.reason==='SOURCE_REVISION_UNVERIFIED'&&s.observedCount===s.projectionCount
      : s.reason!=='SOURCE_REVISION_UNVERIFIED')&&
    (s.observedCount===null||(Number.isSafeInteger(s.observedCount)&&s.observedCount>=0&&s.observedCount<=100))&&
    Number.isSafeInteger(s.projectionCount)&&s.projectionCount>=0&&s.projectionCount<=100&&
    (s.lastExtractedAt===null||(typeof s.lastExtractedAt==='string'&&
      Number.isFinite(Date.parse(s.lastExtractedAt))&&s.lastExtractedAt.endsWith('Z')))&&
    (s.receiptAgeSeconds===null||(Number.isSafeInteger(s.receiptAgeSeconds)&&s.receiptAgeSeconds>=0))&&
    (s.observedCount!==null||(s.status==='HOLD'&&s.reason==='NO_SIGNED_RECEIPT'&&
      s.lastExtractedAt===null&&s.receiptAgeSeconds===null))&&
    (s.observedCount===null||s.lastExtractedAt!==null)&&
    (s.sourceKind==='purchaseOrders'?
      ((s.cancelledOriginDraftCount===undefined&&s.otherObservedOrderCount===undefined)||
       (Number.isSafeInteger(s.cancelledOriginDraftCount)&&s.cancelledOriginDraftCount>=0&&
        Number.isSafeInteger(s.otherObservedOrderCount)&&s.otherObservedOrderCount>=0&&
        s.cancelledOriginDraftCount+s.otherObservedOrderCount<=s.projectionCount&&
        (s.status==='HOLD'||
         s.cancelledOriginDraftCount+s.otherObservedOrderCount===s.projectionCount))):
      s.cancelledOriginDraftCount===undefined&&s.otherObservedOrderCount===undefined);
  });
}
export function createOntologyHealthHandler({
 getStore=env=>createSupabaseControlStore(resolveDurableControlConfig(env)),
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET only'));}
  let session;
  try{session=getSession(req);}catch{}
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder access required'));
  try{if(new URL(req.url).search)return res.status(422).json(apiError('QUERY_INVALID','No query parameters permitted'));}
  catch{return res.status(422).json(apiError('QUERY_INVALID','Invalid URL'));}
  try{
   const data=await getStore(req.env).getOntologySourceHealth();
   if(!valid(data))return res.status(503).json({data:hold('ONTOLOGY_HEALTH_UNVERIFIED')});
   return res.status(200).json({data});
  }catch{return res.status(503).json({data:hold('ONTOLOGY_HEALTH_UNAVAILABLE')});}
 };
}
export default createOntologyHealthHandler();
