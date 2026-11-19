/**
 * Separate opt-in OIDC sign-in entrypoint. Never active until the VYNDI
 * issuer and registered confidential VAOS OAuth client have passed review.
 * Existing VAOS password login stays unchanged.
 */
import {beginFounderOidc,resolveFounderOidcConfig} from '../lib/founder-oidc.mjs';
const SAME_KEYS=['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY',
 'VAOS_VYNDI_OIDC_ENABLED','VAOS_VYNDI_OIDC_CLIENT_ID',
 'VAOS_VYNDI_OIDC_CLIENT_SECRET','VAOS_VYNDI_FOUNDER_SUB_SHA256'];
export function commissionedRuntimeEnv(req,runtime=process.env){
 const env=req.env;
 if(!env||SAME_KEYS.some(k=>typeof env[k]!=='string'||env[k]!==runtime[k]))
  throw Error('OIDC_NOT_COMMISSIONED');
 resolveFounderOidcConfig(env);
 return env;
}
export function createFounderSsoStartHandler({
 getEnv=req=>commissionedRuntimeEnv(req),
 begin=beginFounderOidc,
}={}){
 return function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  try{
   const url=new URL(req.url);
   if(url.origin!=='https://vaos.vayushastr.workers.dev'||url.pathname!=='/api/founder-sso-start'||
      url.search||url.hash)throw Error('OIDC_REQUEST_REJECTED');
  }catch{return res.status(422).json({error:'oidc_request_rejected'});}
  let initiated;
  try{initiated=begin({env:getEnv(req)});}catch{
   return res.status(503).json({error:'oidc_not_commissioned'});
  }
  res.setHeader('Set-Cookie',initiated.setCookie);
  res.setHeader('Location',initiated.location);
  return res.status(302).end();
 };
}
export default createFounderSsoStartHandler();
