/**
 * OIDC return: the ONLY path that can exchange the Better Auth authorization
 * code for a NEW VAOS founder session. No email/role/cookie assertion from the
 * caller is trusted. No ERP data or business-write control is modified.
 */
import {finishFounderOidc,FOUNDER_OIDC_CLEAR_COOKIE} from '../lib/founder-oidc.mjs';
import {commissionedRuntimeEnv} from './founder-sso-start.mjs';
import {createSessionToken,verifySessionToken,buildSessionCookie} from '../lib/auth.mjs';
import {revokeHardenedCookie} from '../lib/session-revocation.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
export function createFounderSsoCallbackHandler({
 getEnv=req=>commissionedRuntimeEnv(req),
 finish=finishFounderOidc,
 newSession=()=>createSessionToken(FOUNDER),
 verifySession=verifySessionToken,
 revokeExisting=req=>revokeHardenedCookie(req.headers?.cookie||'',req.env?.VAOS_ARTIFACTS),
 now=()=>Date.now(),
}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Set-Cookie',FOUNDER_OIDC_CLEAR_COOKIE);
  if(req.method!=='GET'){
   res.setHeader('Allow','GET');
   return res.status(405).json({error:'method_not_allowed'});
  }
  let env;
  try{env=getEnv(req);}catch{return res.status(503).json({error:'oidc_not_commissioned'});}
  let attested;
  try{
   attested=await finish({env,callbackUrl:req.url,cookieHeader:req.headers?.cookie||'',nowMs:now()});
  }catch(error){
   const name=String(error?.message||'');
   return res.status(name==='OIDC_PROVIDER_UNAVAILABLE'?503:401).json({
    error:name==='OIDC_PROVIDER_UNAVAILABLE'?'oidc_provider_unavailable':'oidc_callback_rejected',
   });
  }
  if(attested?.founderAuthenticated!==true||
     attested.identitySource!=='VYNDI_BETTER_AUTH_OIDC'||
     attested.productionWriteAuthorized!==false)
   return res.status(401).json({error:'oidc_callback_rejected'});
  try{
   // Rotate the current browser's VAOS session; a valid old token is only
   // revoked after an authoritative independent issuer login has succeeded.
   const revoked=await revokeExisting(req);
   if(!revoked||typeof revoked.revoked!=='boolean')throw Error('REVOCATION_UNAVAILABLE');
   const token=newSession();
   const verified=verifySession(token);
   if(!verified||verified.email!==FOUNDER||verified.v!==2)
    throw Error('HARDENED_SESSION_MISMATCH');
   res.setHeader('Set-Cookie',[FOUNDER_OIDC_CLEAR_COOKIE,buildSessionCookie(token)]);
  }catch{return res.status(503).json({error:'oidc_session_issuance_unavailable'});}
  res.setHeader('Location','/workspace');
  return res.status(303).end();
 };
}
export default createFounderSsoCallbackHandler();
