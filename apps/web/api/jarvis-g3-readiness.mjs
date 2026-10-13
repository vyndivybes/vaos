import {randomUUID} from 'node:crypto';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {G3_REQUIRED_READS,assessG3SourceReadiness} from '../../../intelligence/g3-source-readiness.mjs';
import {auditG3NumericSource,summarizeG3NumericAudits} from '../../../intelligence/g3-quantitative-contract.mjs';
import {assessG3CrossSource} from '../../../intelligence/g3-cross-source-reconciliation.mjs';
import {inspectG3SourceProvenance} from '../../../intelligence/g3-provenance-preflight.mjs';
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
    // Inspect only canonical field contracts; do not keep or project raw rows.
    const numeric=auditG3NumericSource(route.domain,result.data);
    return {observation:{domain:route.domain,actionType:route.actionType,
     sourceAuthority:route.authority,status:'OBSERVED',gatewayReadAt:stamp},numeric,sourceData:result.data};
   }catch{
    return {observation:{domain:route.domain,actionType:route.actionType,
     sourceAuthority:null,status:'HOLD',gatewayReadAt:null},
     numeric:auditG3NumericSource(route.domain,null),sourceData:null};
   }
  }));
  try{
   const report=assessG3SourceReadiness(results.map(x=>x.observation),{now:now()});
   const quantitativeDiagnostics=summarizeG3NumericAudits(results.map(x=>x.numeric));
   const observedSources=Object.fromEntries(
    G3_REQUIRED_READS.map((route,index)=>[route.domain,results[index].sourceData]));
   const crossSourceDiagnostics=assessG3CrossSource(observedSources);
   const sourceProvenanceDiagnostics=inspectG3SourceProvenance(observedSources);
   return res.status(200).json({data:{
    ...report,quantitativeDiagnostics,crossSourceDiagnostics,sourceProvenanceDiagnostics
   }});
  }catch{
   return res.status(503).json(apiError('G3_QUALIFICATION_HOLD','Source input qualification unavailable'));
  }
 };
}
export default createG3ReadinessHandler();
