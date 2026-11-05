/** Founder-only manual canary: signed VYNDI read -> unverified VAOS receipt. */
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createDurableReceiptIngestor} from '../../../platform/ontology/durable-receipt-ingestor.mjs';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {ONTOLOGY_SOURCE_ACTIONS,createOntologySignedReader} from './ontology-source-status.mjs';

const hold=reason=>({status:'HOLD',reason,readOnly:true,durableReceiptStored:false,
 sourceCompletenessVerified:false,agentUsable:false,actionAuthorized:false,productionWriteAuthorized:false});

export function createOntologyIngestCanaryHandler({
 getStore=env=>createSupabaseControlStore(resolveDurableControlConfig(env)),
 getReader=createOntologySignedReader,
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){
   res.setHeader('Allow','POST');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));
  }
  let session;
  try{session=getSession(req);}catch{}
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Authentication required'));
  if(session.email!=='shyamsundhar1982@gmail.com')
   return res.status(403).json(apiError('FOUNDER_ONLY','Founder authorization required'));
  const url=new URL(req.url);
  if(req.headers?.origin!==url.origin||
     (req.headers?.['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin'))
   return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin request required'));
  if(featureControl(req.env,'VAOS_ONTOLOGY_INGEST_CONTROL')!=='founder-canary-v1')
   return res.status(409).json({data:hold('INGEST_CANARY_DISABLED')});
  const query=url.searchParams,kind=query.get('source');
  if(req.body!==undefined||[...query.keys()].length!==1||
     query.getAll('source').length!==1||!Object.hasOwn(ONTOLOGY_SOURCE_ACTIONS,kind||''))
   return res.status(422).json(apiError('SOURCE_INVALID','Choose one permitted source; no body'));
  const expected=ONTOLOGY_SOURCE_ACTIONS[kind];
  let store,observation;
  try{
   store=getStore(req.env);
   observation=await getReader(req.env,store).execute({
    id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    actionType:expected.actionType,payload:{missionId:'ontology:founder-canary',limit:100},
   });
  }catch{return res.status(503).json({data:hold('SIGNED_SOURCE_UNAVAILABLE')});}
  if(observation?.actionType!==expected.actionType||
     observation?.sourceAuthority!==expected.sourceAuthority)
   return res.status(409).json({data:hold('SOURCE_AUTHORITY_MISMATCH')});
  const ingestor=createDurableReceiptIngestor({
   enabled:true,writeReceipt:receipt=>store.ingestOntologySourceReceipt(receipt),
  });
  const result=await ingestor.store(observation);
  const data={...result,readOnly:true,sourceCompletenessVerified:false,
   durableHydrationVerified:false,agentUsable:false,actionAuthorized:false,productionWriteAuthorized:false};
  return res.status(result.status==='SOURCE_UNVERIFIED'?200:409).json({data});
 };
}
export default createOntologyIngestCanaryHandler();
