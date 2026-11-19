/**
 * Read-only MD identity attestation boundary.
 * Founder approval + email alone are not a shared login. We validate the
 * configured hardened VAOS v2 cookie, then ask VYNDI through its separately
 * nonce-checked P-256 signed service bridge for aggregate Better Auth evidence.
 *
 * Never copy cookies, passwords, OAuth tokens, session IDs or access rights
 * between applications. Never mint a VYNDI session from this response.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken,SESSION_TTL_SECONDS} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createOntologySignedReader} from './ontology-source-status.mjs';
import {normalizeVyndiMdIdentityEvidence,MD_IDENTITY_UNAVAILABLE} from '../lib/md-cross-app-identity.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const ACTION='GOVERNANCE.OBSERVE_MD_IDENTITY';
function validHardenedSession(session,nowMs){
 const nowSeconds=Math.floor(nowMs/1000);
 return session?.v===2&&session.email===FOUNDER&&
  Number.isSafeInteger(session.iat)&&Number.isSafeInteger(session.exp)&&
  typeof session.sid==='string'&&/^[a-f0-9]{32}$/.test(session.sid)&&
  session.iat<=nowSeconds+60&&session.iat>nowSeconds-SESSION_TTL_SECONDS-60&&
  session.exp>nowSeconds&&session.exp>session.iat&&
  session.exp-session.iat<=SESSION_TTL_SECONDS;
}
export function createFounderMdIdentityHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 hardenedAuth=()=>process.env.VAOS_AUTH_HARDENED_CONTROL==='dedicated-hmac-v1',
 getReader=createOntologySignedReader,
 now=()=>Date.now(),
}={}){
 return async (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
   res.setHeader('Allow','GET');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  }
  try{if(new URL(req.url).search)throw Error('query');}
  catch{return res.status(422).json(apiError('MD_IDENTITY_QUERY_FORBIDDEN','No query parameters accepted'));}
  if(!hardenedAuth())
   return res.status(503).json(apiError('MD_HARDENED_AUTH_REQUIRED','Dedicated hardened founder authentication required'));
  let session=null;
  try{session=getSession(req);}catch{ /* A malformed session is anonymous. */ }
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Hardened founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder access only'));
  if(!validHardenedSession(session,now()))
   return res.status(401).json(apiError('MD_SESSION_UNVERIFIED','VAOS hardened session invalid or expired'));
  let linkedEvidence=MD_IDENTITY_UNAVAILABLE;
  try{
   const reader=getReader(req.env);
   if(typeof reader?.execute!=='function')throw Error('reader unavailable');
   const response=await reader.execute({
    id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    actionType:ACTION,payload:{missionId:'governance:founder-md-identity-readonly',limit:1},
   });
   linkedEvidence=normalizeVyndiMdIdentityEvidence(response);
  }catch{ /* Keep the original source/identity HOLD and redact errors. */ }
  return res.status(200).json({data:Object.freeze({
    schemaVersion:'VAOS_FOUNDER_MD_BINDING_V1',status:'HOLD',
    declaredCompany:'Vāyú Shastr Pvt Ltd',
    declaredGovernanceRole:'MANAGING_DIRECTOR',
    vaosFounderSessionVerified:true,
    vyndiAccountLocated:linkedEvidence.existingAccountLocated,
    vyndiAccountEmailVerified:linkedEvidence.vyndiAccountEmailVerified,
    vyndiAccountAdminAssigned:linkedEvidence.vyndiAccountAdminAssigned,
    crossPlatformSsoVerified:false,
    mdAuthenticatedAcrossBoth:false,
    businessApprovalAuthorized:false,
    productionWriteAuthorized:false,
    readOnly:true,
    holds:[...linkedEvidence.holds],
  })});
 };
}
export default createFounderMdIdentityHandler();
