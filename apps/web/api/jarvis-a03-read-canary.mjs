/**
 * Explicit founder-consented A03 read-only canary. No model-chosen tools,
 * business mutation, automatic scheduling or source authority promotion.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {createOntologySignedReader} from './ontology-source-status.mjs';
import {runA03SignedReadCanary} from '../../../intelligence/jarvis-a03-read-canary.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
export function createJarvisA03ReadCanaryHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 getReader=createOntologySignedReader,now=()=>Date.now()
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));}
  let session;try{session=getSession(req);}catch{}
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only signed source canary'));
  if(featureControl(req.env,'VAOS_A03_READ_CANARY_CONTROL')!=='founder-manual-readonly-v1')
   return res.status(409).json(apiError('A03_DISABLED','Manual source canary not commissioned'));
  let url;try{url=new URL(req.url);}catch{return res.status(422).json(apiError('REQUEST_INVALID','Invalid URL'));}
  if(url.search)return res.status(422).json(apiError('REQUEST_INVALID','Query strings are not accepted'));
  if(req.headers?.origin!==url.origin)
   return res.status(403).json(apiError('ORIGIN_DENIED','Matching origin required'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('JSON_REQUIRED','JSON required'));
  const input=req.body;
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!=='confirm,operation'||
    input.confirm!==true||input.operation!=='VERIFY_SIGNED_SOURCE_READS')
   return res.status(422).json(apiError('A03_SCOPE_DENIED','Explicit fixed-scope read consent required'));
  let result;
  try{result=await runA03SignedReadCanary({reader:getReader(req.env),now});}
  catch{return res.status(503).json(apiError('A03_RUNTIME_HOLD','Signed source observation unavailable'));}
  return res.status(200).json({data:result});
 };
}
export default createJarvisA03ReadCanaryHandler();
