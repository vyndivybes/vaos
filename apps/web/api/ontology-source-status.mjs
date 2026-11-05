/** Founder-only, signed and source-scoped observation. NO PO prepare/write. */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createVyndiReadBridgeClient} from '../../../platform/execution/vyndi-read-bridge-client.mjs';
import {VYNDI_SOURCE_RECEIPT_ROUTES} from '../../../platform/execution/vyndi-source-receipt.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
export const ONTOLOGY_SOURCE_ACTIONS=Object.fromEntries(
 Object.entries(VYNDI_SOURCE_RECEIPT_ROUTES).map(([actionType,{kind}])=>[
  kind,{actionType,sourceAuthority:getVyndiBridgeRoute(actionType).authority},
 ]),
);
export function createOntologySignedReader(env,store=createSupabaseControlStore(resolveDurableControlConfig(env))){return createVyndiReadBridgeClient({
 signer:store,
 serviceBinding:env?.VYNDI,
});}
function hold(reason,kind){return {status:'HOLD',reason,sourceKind:kind,
 readOnly:true,sourceCompletenessVerified:false,durableHydrationVerified:false,
 actionAuthorized:false,approvalGranted:false,productionWriteAuthorized:false};}
export function createOntologySourceStatusHandler({getReader=createOntologySignedReader,
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE])}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET only'));}
  let session;
  try{session=getSession(req);}catch{return res.status(401).json(apiError('UNAUTHENTICATED','Authentication required'));}
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Authentication required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder authorization required'));
  if(featureControl(req.env,'VAOS_ONTOLOGY_SOURCE_CONTROL')!=='founder-readonly-v1')
   return res.status(409).json(apiError('SOURCE_OBSERVATION_DISABLED','Source observation not commissioned'));
  let kind;
  try{
   const query=new URL(req.url).searchParams;
   if([...query.keys()].length!==1||query.getAll('source').length!==1||
     !Object.hasOwn(ONTOLOGY_SOURCE_ACTIONS,query.get('source')||''))throw Error();
   kind=query.get('source');
  }catch{return res.status(422).json(apiError('SOURCE_INVALID','Choose inventory, shortages or purchaseOrders'));}
  const expected=ONTOLOGY_SOURCE_ACTIONS[kind];
  let result;
  try{
   result=await getReader(req.env).execute({
    id:`ontology-source:${kind}:${crypto.randomUUID()}`,
    intentId:`ontology-source:${kind}:${crypto.randomUUID()}`,
    actionType:expected.actionType,payload:{missionId:'ontology:source-observe',limit:100},
   });
  }catch{return res.status(503).json(apiError('SIGNED_SOURCE_UNAVAILABLE','Signed VYNDI source read unavailable'));}
  const data=result?.data;
  if(result?.actionType!==expected.actionType||result?.sourceAuthority!==expected.sourceAuthority||
    result?.readOnly!==true||result?.effectClass!=='read'||
    result?.sourceReceiptChecked!==true||
    result?.sourceCompletenessVerified!==false||
    data?.schemaVersion!=='VYNDI_ONTOLOGY_READ_RECEIPT_V1'||data?.sourceKind!==kind||
    data?.sourceCompletenessVerified!==false||data?.sourceRevisionAuthority!=='CONTENT_DIGEST_ONLY')
    return res.status(409).json({data:hold('SOURCE_RECEIPT_NOT_QUALIFIED',kind)});
  if(data.complete!==true||data.hasMore!==false)
    return res.status(409).json({data:hold('SOURCE_PAGE_INCOMPLETE',kind)});
  // Never return underlying rows or infer business freshness from extraction time.
  return res.status(200).json({data:{status:'SOURCE_UNVERIFIED',
    sourceKind:kind,sourceScope:data.sourceScope,sourceCount:data.sourceCount,
    sourceRevision:data.sourceRevision,sourceRevisionAuthority:data.sourceRevisionAuthority,
    extractedAt:data.asOf,asOfAuthority:data.asOfAuthority,
    boundedQueryComplete:true,readOnly:true,
    sourceCompletenessVerified:false,durableHydrationVerified:false,
    actionAuthorized:false,approvalGranted:false,productionWriteAuthorized:false}});
 };
}
export default createOntologySourceStatusHandler();
