/** A06–A10 founder-only, manually consented, zero-write synthetic qualification drills. */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {runA06A10OfflineDrills} from '../../../intelligence/jarvis-a06-a10-operational-drills.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
export function createJarvisA06A10DrillHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 runDrills=runA06A10OfflineDrills
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){
   res.setHeader('Allow','POST');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST only'));
  }
  let session;try{session=getSession(req);}catch{}
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only qualification drills'));
  let url;try{url=new URL(req.url);}catch{
   return res.status(422).json(apiError('INVALID_URL','Invalid URL'));
  }
  if(req.headers?.origin!==url.origin)
   return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin consent required'));
  if(url.search)
   return res.status(422).json(apiError('QUERY_DENIED','Query parameters cannot change drill scope'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('JSON_REQUIRED','JSON required'));
  const input=req.body;
  if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).sort().join(',')!=='confirm,operation'||
   input.confirm!==true||input.operation!=='RUN_OFFLINE_SYNTHETIC_DRILL')
   return res.status(422).json(apiError('DRILL_SCOPE_DENIED','Only explicit synthetic drill consent accepted'));
  try{
   const result=await runDrills();
   if(result?.schemaVersion!=='VAOS_JARVIS_A06_A10_OFFLINE_DRILL_V1'||
    result.status!=='HOLD'||result.syntheticOnly!==true||
    result.independentQualificationCertified!==false||
    result.businessWritesExecuted!==0||result.providersInvoked!==0||
    result.modelInvocations!==0||result.productionRecoveryExecuted!==false||
    !Array.isArray(result.stages)||result.stages.length!==5||
    result.stages.some((s,i)=>s?.stage!=='A0'+(i+6)&&!(i===4&&s?.stage==='A10')||s?.status!=='HOLD'))
    throw Error('DRILL_RUNTIME_UNVERIFIED');
   return res.status(200).json({data:result});
  }catch{
   return res.status(503).json(apiError('DRILL_HOLD','Qualification drill failed closed'));
  }
 };
}
export default createJarvisA06A10DrillHandler();
