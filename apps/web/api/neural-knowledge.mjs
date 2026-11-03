/**
 * Founder-only, read-only knowledge graph gateway. VYNDI uses the existing
 * P-256 signed bridge; all SPARK-derived snapshots require explicit SHA-256
 * pinning in VAOS R2. Never accepts a URL, graph body, or upload from clients.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createVyndiReadBridgeClient} from '../../../platform/execution/vyndi-read-bridge-client.mjs';
import {normalizeNeutralGraph,NEUTRAL_GRAPH_SOURCES} from '../../../integrations/neural-knowledge/neutral-schema.mjs';
import {loadApprovedGraphSnapshot} from '../../../integrations/neural-knowledge/snapshot-reader.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const ACTION='KNOWLEDGE.OBSERVE_VEDM_GRAPH';
const ZERO_SHA=/^[a-f0-9]{64}$/;
const sourceReader=env=>createVyndiReadBridgeClient({
 signer:createSupabaseControlStore(resolveDurableControlConfig(env)),
 serviceBinding:env.VYNDI,
});
function statusOf(env,type){
 if(type==='vyndi-vedm')return typeof env?.VYNDI?.fetch==='function'?'CONFIGURED_UNVERIFIED':'NOT_COMMISSIONED';
 let config=null;
 try{config=JSON.parse(env?.VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES||'null')}catch{}
 return (typeof env?.VAOS_ARTIFACTS?.get==='function'&&ZERO_SHA.test(config?.[type]||''))
   ?'PIN_CONFIGURED_UNVERIFIED':'NOT_COMMISSIONED';
}
export function createNeuralKnowledgeHandler({getVyndiReader=sourceReader,getSnapshot=loadApprovedGraphSnapshot,now=()=>new Date()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET only'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder authentication required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only knowledge graph'));
  const env=req.env||{};
  if(featureControl(env,'VAOS_NEURAL_KNOWLEDGE_CONTROL')!=='founder-readonly-v1')
   return res.status(409).json(apiError('NEURAL_GRAPH_DISABLED','Read-only knowledge gateway not commissioned'));
  let source;
  try{
   const query=new URL(req.url,'https://vaos.local').searchParams;
   if(query.size!==1||query.getAll('source').length!==1||[...query.keys()].some(key=>key!=='source'))throw Error();
   source=query.get('source');
   if(source!=='registry'&&!NEUTRAL_GRAPH_SOURCES.includes(source))throw Error();
  }catch{return res.status(422).json(apiError('SOURCE_INVALID','Select a permitted knowledge source'))}
  if(source==='registry')return res.status(200).json({data:{
   schemaVersion:'VAOS_NEUTRAL_GRAPH_REGISTRY_V1',
   sources:NEUTRAL_GRAPH_SOURCES.map(id=>({id,status:statusOf(env,id)})),
   readOnly:true,actionAuthorized:false,
  }});
  if(statusOf(env,source)==='NOT_COMMISSIONED')
   return res.status(503).json(apiError('NEURAL_GRAPH_SOURCE_HOLD','Source not commissioned'));
  try{
   let envelope,integrityVerified=false;
   if(source==='vyndi-vedm'){
    const read=await getVyndiReader(env).execute({
     id:crypto.randomUUID(),intentId:crypto.randomUUID(),
     actionType:ACTION,payload:{missionId:'neural-knowledge:founder-readonly',limit:100},
    });
    const raw=read?.data;
    if(read?.sourceAuthority!=='compileVedmAuthorityGraph'||read?.actionType!==ACTION
       ||raw?.sourceCommit!==raw?.sourceCommit?.toLowerCase()
       ||raw?.sourceAuthority!=='compileVedmAuthorityGraph')throw Error('SOURCE_AUTHORITY_MISMATCH');
    envelope={schemaVersion:'VAOS_NEUTRAL_GRAPH_SOURCE_V1',sourceType:source,
     sourceRevision:raw.sourceCommit,observedAt:now().toISOString(),payload:raw};
    // A signed request authenticates the bridge, but is not independently
    // signed evidence of current source truth.
   }else{
    const approved=await getSnapshot({env,sourceType:source});
    envelope=approved.snapshot;
    integrityVerified=approved.integrityVerified===true;
   }
   return res.status(200).json({data:normalizeNeutralGraph(envelope,{integrityVerified})});
  }catch{
   // Never leak remote credentials, raw graph bodies or private transport errors.
   return res.status(503).json(apiError('NEURAL_GRAPH_SOURCE_HOLD','Verified read-only graph source unavailable'));
  }
 };
}
export default createNeuralKnowledgeHandler();
