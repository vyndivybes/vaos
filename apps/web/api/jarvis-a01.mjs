/** Founder-only JARVIS A01 read-only signed source-consistency dossier.
 * No AI inference, PO writes, business mutations, storage writes or auto-promotion.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {createOntologySignedReader,ONTOLOGY_SOURCE_ACTIONS} from './ontology-source-status.mjs';
import {createSupabaseControlStore} from '../../../platform/persistence/supabase-store.mjs';
import {resolveDurableControlConfig} from '../lib/durable-control-provider.mjs';
import {createA01SourceEvidence,reconcileA01Sources,A01_SOURCE_KINDS} from '../../../intelligence/jarvis-a01-reconciliation.mjs';
import {runA01SpecialistReview} from '../../../intelligence/jarvis-a01-specialists.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const getHealth=async env=>createSupabaseControlStore(resolveDurableControlConfig(env)).getOntologySourceHealth();

export function createJarvisA01Handler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 getReader=createOntologySignedReader,getHealth:readHealth=getHealth,
 runSpecialists=runA01SpecialistReview,now=()=>Date.now(),
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  let user;try{user=getSession(req);}catch{}
  if(!user)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(user.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder access only'));
  if(featureControl(req.env,'VAOS_ONTOLOGY_SOURCE_CONTROL')!=='founder-readonly-v1')
   return res.status(409).json(apiError('A01_DISABLED','Signed source observation not commissioned'));
  try{if(new URL(req.url).search)return res.status(422).json(apiError('A01_QUERY_REJECTED','No query parameters accepted'));}
  catch{return res.status(422).json(apiError('A01_QUERY_REJECTED','Invalid URL'));}
  let reader,health;
  try{
   reader=getReader(req.env);
   if(typeof reader?.execute!=='function')throw Error('A01_READER_INVALID');
   health=await readHealth(req.env);
  }catch{return res.status(503).json(apiError('A01_EVIDENCE_UNAVAILABLE','Independent durable source comparison unavailable'));}
  const read=async()=>{
   const pairs=await Promise.all(A01_SOURCE_KINDS.map(async kind=>{
    const actionType=ONTOLOGY_SOURCE_ACTIONS[kind]?.actionType;
    try{
     if(!actionType)throw Error('A01_SOURCE_NOT_COMMISSIONED');
     const data=await reader.execute({
      id:crypto.randomUUID(),intentId:crypto.randomUUID(),
      actionType,payload:{missionId:'jarvis:a01:read-only-source-reconciliation',limit:100}
     });
     return [kind,data];
    }catch{return [kind,null];}
   }));
   return createA01SourceEvidence(Object.fromEntries(pairs));
  };
  try{
   // Two separate cryptographically signed bridge calls per source, each
   // assigned its own random execution ID and signed nonce.
   const first=await read(),second=await read();
   const result=await reconcileA01Sources({first,second,health,now:now()});
   // Only the consistency gate admits a bounded specialist evidence review.
   // Even a successful review cannot promote CONTENT_DIGEST_ONLY to DB authority.
   let specialistReview={status:'NOT_RUN_SOURCE_GATE_HOLD',
    readOnly:true,actionAuthorized:false,productionWriteAuthorized:false,
    aiModelInvocations:0,findings:[]};
   if(result.consistencyGate==='PASS'){
    try{
     specialistReview=await runSpecialists({reader});
     if(!specialistReview||
      !['BOUNDED_EVIDENCE','SOURCE_HOLD'].includes(specialistReview.status)||
      specialistReview.actionAuthorized!==false||
      specialistReview.productionWriteAuthorized!==false||
      specialistReview.aiModelInvocations!==0)throw Error('A01_SPECIALIST_INVALID');
    }catch{
     specialistReview={status:'SOURCE_HOLD',holds:['SPECIALIST_REVIEW_UNAVAILABLE'],
      readOnly:true,actionAuthorized:false,productionWriteAuthorized:false,
      aiModelInvocations:0,findings:[]};
    }
   }
   return res.status(200).json({data:{...result,specialistReview}});
  }catch{return res.status(503).json(apiError('A01_RECONCILIATION_HOLD','Evidence could not be reconciled'));}
 };
}
export default createJarvisA01Handler();
