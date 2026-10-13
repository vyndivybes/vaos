import {randomUUID} from 'node:crypto';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {G3_REQUIRED_READS,assessG3SourceReadiness} from '../../../intelligence/g3-source-readiness.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const CONTROL='founder-readonly-browser-v1';
/** Founder-triggered bounded source-provenance check. No raw rows, optimizer
 * imports, AI inference, paid tools, database writes or agent dispatches.
 * VEDM and VIBPE document authority remain separate, explicit HOLDs.
 */
export function createG3ReadinessHandler({getReader=makeCommercialReader,now=()=>Date.now()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only predictive input qualification'));
  if(req.env?.VAOS_VOICE_CONTROL!==CONTROL)
   return res.status(409).json(apiError('G3_READINESS_DISABLED','Founder read-only gateway not commissioned'));
  let reader;
  try{reader=getReader(req.env);if(!reader||typeof reader.execute!=='function')throw Error('NO_GATEWAY');}
  catch{return res.status(503).json(apiError('G3_GATEWAY_HOLD','Signed read-only gateway unavailable'));}
  // Contract is assembled exclusively from allowlisted runtime routes and
  // server-issued retrieval receipts. Upstream metadata cannot forge these.
  const results=await Promise.all(G3_REQUIRED_READS.map(async route=>{
   try{
    const result=await reader.execute({
     actionType:route.actionType,
     id:'g3-readonly:'+randomUUID(),intentId:'g3-readonly:'+randomUUID(),
     payload:{limit:50,missionId:'vaos-founder-g3-source-readiness'}
    });
    if(result?.actionType!==route.actionType||result?.sourceAuthority!==route.authority||
       !result.data||typeof result.data!=='object')
     throw Error('G3_SOURCE_AUTHORITY_MISMATCH');
    const stamp=new Date(now()).toISOString();
    return {domain:route.domain,actionType:route.actionType,
     sourceAuthority:route.authority,status:'OBSERVED',gatewayReadAt:stamp};
   }catch{
    return {domain:route.domain,actionType:route.actionType,
     sourceAuthority:null,status:'HOLD',gatewayReadAt:null};
   }
  }));
  try{
   const report=assessG3SourceReadiness(results,{now:now()});
   return res.status(200).json({data:report});
  }catch{
   return res.status(503).json(apiError('G3_QUALIFICATION_HOLD','Source input qualification unavailable'));
  }
 };
}
export default createG3ReadinessHandler();
