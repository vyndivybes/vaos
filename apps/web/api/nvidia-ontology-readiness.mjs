/** Founder-only preflight. This endpoint never proxies ERP records, SQL or model output. */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {inspectNvidiaAutoOntology,holdNvidiaOntology} from '../../../integrations/nvidia-auto-ontology/readiness.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';

export function createNvidiaOntologyReadinessHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 inspect=inspectNvidiaAutoOntology,
}={}){
 return async function nvidiaOntologyReadiness(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  let session=null;
  try{session=getSession(req);}catch{}
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  try{if(new URL(req.url).search)return res.status(422).json(apiError('QUERY_INVALID','Query parameters are not supported'));}
  catch{return res.status(422).json(apiError('QUERY_INVALID','Invalid request URL'));}
  if(featureControl(req.env,'VAOS_NVIDIA_ONTOLOGY_CONTROL')!=='founder-readonly-v1')
   return res.status(200).json({data:holdNvidiaOntology('ONTOLOGY_CONTROL_DISABLED')});
  try{return res.status(200).json({data:await inspect(req.env)});}
  catch{return res.status(200).json({data:holdNvidiaOntology('ONTOLOGY_PROBE_FAILED')});}
 };
}
export default createNvidiaOntologyReadinessHandler();
