// Founder-only, read-only Stage 8 cutover preflight.
// Never returns secret values, digests, signatures, or session tokens.
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {assessStage8Evidence} from '../lib/stage8-qualification-evidence.mjs';
const LEGACY_MAKER_SHA256='11c5ab3591e9d8c06eeac2afa5d6639021b569e46ae1efbb74f8dc4b81bf08d1';
const HEX256_512=/^[a-f0-9]{64}(?:[a-f0-9]{2}){0,32}$/i;
const DIGEST=/^[a-f0-9]{64}$/i;
const FOUNDER='shyamsundhar1982@gmail.com';
const KEYS=Object.freeze(['VAOS_SESSION_HMAC_KEY','VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256']);

export function evaluateHardenedCutoverReadiness(env={}){
 const source=env||{};
 const secret=typeof source.VAOS_SESSION_HMAC_KEY==='string'?source.VAOS_SESSION_HMAC_KEY.trim():'';
 const maker=typeof source.VAOS_DEV_LOGIN_PASSWORD_SHA256==='string'?source.VAOS_DEV_LOGIN_PASSWORD_SHA256.trim().toLowerCase():'';
 const checker=typeof source.VAOS_DEV_CHECKER_PASSWORD_SHA256==='string'?source.VAOS_DEV_CHECKER_PASSWORD_SHA256.trim().toLowerCase():'';
 const holds=[];
 if(!HEX256_512.test(secret)||secret.length%2!==0)holds.push('HMAC_FORMAT_OR_LENGTH_INVALID');
 if(!DIGEST.test(maker))holds.push('MAKER_CREDENTIAL_DIGEST_INVALID');
 if(maker===LEGACY_MAKER_SHA256)holds.push('LEGACY_MAKER_CREDENTIAL_FORBIDDEN');
 if(!DIGEST.test(checker))holds.push('CHECKER_CREDENTIAL_DIGEST_INVALID');
 if(checker===LEGACY_MAKER_SHA256)holds.push('LEGACY_CHECKER_CREDENTIAL_FORBIDDEN');
 if(DIGEST.test(maker)&&DIGEST.test(checker)&&maker===checker)holds.push('MAKER_CHECKER_CREDENTIAL_COLLISION');
 if(secret&&((DIGEST.test(maker)&&secret.toLowerCase()===maker)
           ||(DIGEST.test(checker)&&secret.toLowerCase()===checker)))holds.push('HMAC_CREDENTIAL_COLLISION');
 return Object.freeze({state:holds.length?'HOLD':'READY',ready:holds.length===0,
  holds:Object.freeze(holds),
  // A code-level assessment is not live founder/checker reauthentication or user authorization.
  authenticatedSignInQualified:false,productionCutoverAuthorized:false,actionAuthorized:false});
}
export function createAuthCutoverReadinessHandler({runtimeEnv=()=>process.env}={}){
 return function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json({error:'unauthenticated'});
  if(session.email!==FOUNDER)return res.status(403).json({error:'founder_only'});
  try{
   const rt=runtimeEnv();
   const settings=req.env;
   let result=evaluateHardenedCutoverReadiness(rt);
   // Ensure bindings are visible to exactly the process.env reader used by auth.mjs.
   const same=!!settings&&KEYS.every(k=>typeof rt?.[k]==='string'
      &&typeof settings?.[k]==='string'&&rt[k]===settings[k]);
   if(!same){
    result={...result,state:'HOLD',ready:false,
      holds:Object.freeze([...new Set([...result.holds,'RUNTIME_BINDING_MISMATCH'])])};
   }
   // Evidence cannot override preflight holds and never authorizes production effects.
   const evidence=assessStage8Evidence(rt?.VAOS_STAGE8_QUALIFICATION_EVIDENCE,{
    key:rt?.VAOS_STAGE8_EVIDENCE_SIGNING_KEY,
    environment:'development',revision:rt?.VAOS_STAGE8_QUALIFICATION_REVISION
   });
   result={...result,authenticatedSignInQualified:result.ready&&evidence.qualified,
     qualificationEvidenceStatus:evidence.qualified?'VERIFIED':evidence.reason,
     productionCutoverAuthorized:false,actionAuthorized:false};
   return res.status(200).json({data:result});
  }catch{
   return res.status(503).json({error:'readiness_unavailable'});
  }
 };
}
export default createAuthCutoverReadinessHandler();
