/**
 * Founder-only OIDC relying-party protocol for the existing VYNDI Better Auth
 * account. Entire feature defaults OFF until the real issuer, confidential
 * client, per-account subject binding and browser acceptance are commissioned.
 * This does not replace or bypass either current login or authorize ERP writes.
 *
 * RFC 7636 PKCE S256, RFC 9207 authorization-response issuer, OIDC ID token
 * signature, audience, nonce and stable subject, plus verified UserInfo.
 */
import crypto from 'node:crypto';

export const FOUNDER_OIDC_COOKIE='__Host-vaos-oidc-pending';
const ISSUER='https://vyndios.vayushastr.workers.dev/api/auth';
const VAOS_ORIGIN='https://vaos.vayushastr.workers.dev';
const CALLBACK=VAOS_ORIGIN+'/api/founder-sso-callback';
const FOUNDER='shyamsundhar1982@gmail.com';
const LIVE_CONFIG='commissioned-v1';
const MAX_PENDING_SECONDS=300;
const KEY_FORMAT=/^[a-f0-9]{64,128}$/i;
const SUBJECT_FORMAT=/^[a-f0-9]{64}$/i;
const CLIENT_FORMAT=/^[A-Za-z0-9._:~-]{6,128}$/;
const SAFE_CODE=/^[A-Za-z0-9._~+\/-]{8,2048}$/;
const B64URL=/^[A-Za-z0-9_-]+$/;
const base64url=bytes=>Buffer.from(bytes).toString('base64url');
const seconds=nowMs=>Math.floor(nowMs/1000);
function reject(code){throw Error(code);}
function constantTimeHex(a,b){
 const x=Buffer.from(String(a),'hex'),y=Buffer.from(String(b),'hex');
 return x.length===32&&y.length===32&&crypto.timingSafeEqual(x,y);
}
export function resolveFounderOidcConfig(env={}){
 const e=env||{};
 const control=e.VAOS_AUTH_HARDENED_CONTROL==='dedicated-hmac-v1' &&
   e.VAOS_VYNDI_OIDC_ENABLED===LIVE_CONFIG;
 const hmac=String(e.VAOS_SESSION_HMAC_KEY||'');
 const clientId=String(e.VAOS_VYNDI_OIDC_CLIENT_ID||'');
 const clientSecret=String(e.VAOS_VYNDI_OIDC_CLIENT_SECRET||'');
 const subjectHash=String(e.VAOS_VYNDI_FOUNDER_SUB_SHA256||'');
 if(!control||!KEY_FORMAT.test(hmac)||hmac.length%2!==0||
    !CLIENT_FORMAT.test(clientId)||clientSecret.length<32||clientSecret.length>128||
    /[\s\x00-\x1f]/.test(clientSecret)||!SUBJECT_FORMAT.test(subjectHash))
   reject('OIDC_NOT_COMMISSIONED');
 return Object.freeze({key:Buffer.from(hmac,'hex'),clientId,clientSecret,
  subjectHash:subjectHash.toLowerCase()});
}
function aeadKey(config){
 return crypto.createHash('sha256').update('VAOS-OIDC-STATE-AEAD-v1\x00')
  .update(config.key).digest();
}
function sealPending(pending,config){
 const iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',aeadKey(config),iv);
 cipher.setAAD(Buffer.from(VAOS_ORIGIN+'|oidc-pending-v1'));
 const value=Buffer.from(JSON.stringify(pending),'utf8');
 const ciphertext=Buffer.concat([cipher.update(value),cipher.final()]);
 return base64url(Buffer.concat([iv,cipher.getAuthTag(),ciphertext]));
}
export function openPendingCookie(value,env,nowMs=Date.now()){
 try{
  const config=resolveFounderOidcConfig(env);
  if(typeof value!=='string'||value.length<64||value.length>2048||!B64URL.test(value))
   reject('OIDC_CALLBACK_REJECTED');
  const raw=Buffer.from(value,'base64url');
  if(raw.length<44||base64url(raw)!==value)reject('OIDC_CALLBACK_REJECTED');
  const iv=raw.subarray(0,12),tag=raw.subarray(12,28),ciphertext=raw.subarray(28);
  const decipher=crypto.createDecipheriv('aes-256-gcm',aeadKey(config),iv);
  decipher.setAAD(Buffer.from(VAOS_ORIGIN+'|oidc-pending-v1'));
  decipher.setAuthTag(tag);
  const pending=JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
  const now=seconds(nowMs);
  if(!pending||pending.v!==1||typeof pending.state!=='string'||pending.state.length!==43||
    typeof pending.nonce!=='string'||pending.nonce.length!==43||
    typeof pending.verifier!=='string'||pending.verifier.length<43||pending.verifier.length>128||
    !B64URL.test(pending.state)||!B64URL.test(pending.nonce)||!B64URL.test(pending.verifier)||
    !Number.isSafeInteger(pending.iat)||!Number.isSafeInteger(pending.exp)||
    pending.exp-pending.iat!==MAX_PENDING_SECONDS||
    pending.iat>now+60||pending.exp<=now||pending.iat<now-MAX_PENDING_SECONDS)
   reject('OIDC_CALLBACK_REJECTED');
  return Object.freeze(pending);
 }catch{reject('OIDC_CALLBACK_REJECTED');}
}
export function beginFounderOidc({env,nowMs=Date.now()}){
 const config=resolveFounderOidcConfig(env);
 const verifier=base64url(crypto.randomBytes(48));
 const pending={v:1,state:base64url(crypto.randomBytes(32)),
  nonce:base64url(crypto.randomBytes(32)),verifier,
  iat:seconds(nowMs),exp:seconds(nowMs)+MAX_PENDING_SECONDS};
 const location=new URL(ISSUER+'/oauth2/authorize');
 for(const [k,v] of Object.entries({
   response_type:'code',client_id:config.clientId,redirect_uri:CALLBACK,
   scope:'openid email',state:pending.state,nonce:pending.nonce,
   code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),
   code_challenge_method:'S256',
 }))location.searchParams.set(k,v);
 const setCookie=FOUNDER_OIDC_COOKIE+'='+sealPending(pending,config)+
  '; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax';
 return Object.freeze({location:location.href,setCookie});
}
export const FOUNDER_OIDC_CLEAR_COOKIE=FOUNDER_OIDC_COOKIE+
 '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
function cookieValue(header){
 const match=String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(FOUNDER_OIDC_COOKIE+'='));
 return match?match.slice(FOUNDER_OIDC_COOKIE.length+1):null;
}
function parseCallback(callbackUrl,pending){
 try{
  const u=new URL(callbackUrl);
  if(u.origin!==VAOS_ORIGIN||u.pathname!=='/api/founder-sso-callback'||
     u.hash||u.username||u.password)reject('OIDC_CALLBACK_REJECTED');
  const keys=[...u.searchParams.keys()];
  if(keys.length!==3||new Set(keys).size!==3||keys.some(k=>!['code','state','iss'].includes(k)))
   reject('OIDC_CALLBACK_REJECTED');
  const code=u.searchParams.get('code'),state=u.searchParams.get('state'),iss=u.searchParams.get('iss');
  if(!SAFE_CODE.test(String(code))||state!==pending.state||iss!==ISSUER)
   reject('OIDC_CALLBACK_REJECTED');
  return code;
 }catch{reject('OIDC_CALLBACK_REJECTED');}
}
function trustedEndpoint(value,allowedPaths){
 try{
  const u=new URL(value);
  return u.origin===new URL(ISSUER).origin&&u.protocol==='https:'&&!u.search&&!u.hash&&
   !u.username&&!u.password&&allowedPaths.includes(u.pathname);
 }catch{return false;}
}
async function providerJson(fetcher,url,options={}){
 try{
  const res=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),...options});
  if(!res?.ok)reject('OIDC_PROVIDER_UNAVAILABLE');
  const data=await res.json();
  if(!data||typeof data!=='object'||Array.isArray(data))reject('OIDC_PROVIDER_UNAVAILABLE');
  return data;
 }catch{reject('OIDC_PROVIDER_UNAVAILABLE');}
}
function decodeJwtJson(fragment){
 if(typeof fragment!=='string'||!B64URL.test(fragment)||fragment.length>6000)
  reject('OIDC_IDENTITY_REJECTED');
 try{
  const obj=JSON.parse(Buffer.from(fragment,'base64url').toString('utf8'));
  if(!obj||typeof obj!=='object'||Array.isArray(obj))reject('OIDC_IDENTITY_REJECTED');
  return obj;
 }catch{reject('OIDC_IDENTITY_REJECTED');}
}
function verifyProviderToken(token,jwks,{clientId,subjectHash,nonce},nowMs){
 try{
  if(typeof token!=='string'||token.length>12000)reject('OIDC_IDENTITY_REJECTED');
  const parts=token.split('.');
  if(parts.length!==3||!B64URL.test(parts[2]))reject('OIDC_IDENTITY_REJECTED');
  const header=decodeJwtJson(parts[0]),claims=decodeJwtJson(parts[1]);
  if(typeof header.kid!=='string'||header.kid.length>128||
     !['RS256','ES256','EdDSA'].includes(header.alg)||header.crit||header.jku||
     header.x5u||header.jwk||header.enc||header.zip||
     (header.typ&&header.typ!=='JWT'))reject('OIDC_IDENTITY_REJECTED');
  if(!Array.isArray(jwks.keys)||jwks.keys.length>30)reject('OIDC_IDENTITY_REJECTED');
  const candidates=jwks.keys.filter(k=>k&&k.kid===header.kid&&
    (!k.use||k.use==='sig')&&(!k.alg||k.alg===header.alg)&&
    (!k.key_ops||k.key_ops.includes('verify')));
  if(candidates.length!==1)reject('OIDC_IDENTITY_REJECTED');
  const jwk=candidates[0],algorithm=header.alg;
  if((algorithm==='RS256'&&(jwk.kty!=='RSA'||typeof jwk.n!=='string'||
      Buffer.from(jwk.n,'base64url').length<256))||
     (algorithm==='ES256'&&(jwk.kty!=='EC'||jwk.crv!=='P-256'))||
     (algorithm==='EdDSA'&&(jwk.kty!=='OKP'||jwk.crv!=='Ed25519')))
    reject('OIDC_IDENTITY_REJECTED');
  const key=crypto.createPublicKey({key:jwk,format:'jwk'});
  const data=Buffer.from(parts[0]+'.'+parts[1]);
  const signature=Buffer.from(parts[2],'base64url');
  const valid=algorithm==='ES256'
    ?crypto.verify('sha256',data,{key,dsaEncoding:'ieee-p1363'},signature)
    :crypto.verify(algorithm==='RS256'?'RSA-SHA256':null,data,key,signature);
  if(!valid)reject('OIDC_IDENTITY_REJECTED');
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  const now=seconds(nowMs);
  if(claims.iss!==ISSUER||!audience.includes(clientId)||
     (audience.length>1&&claims.azp!==clientId)||
     claims.nonce!==nonce||typeof claims.sub!=='string'||claims.sub.length<3||
     typeof claims.exp!=='number'||!Number.isSafeInteger(claims.exp)||
     typeof claims.iat!=='number'||!Number.isSafeInteger(claims.iat)||
     claims.iat>now+60||claims.exp<=now||claims.exp<=claims.iat||
     claims.exp-claims.iat>7200||
     (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now))||
     !constantTimeHex(crypto.createHash('sha256').update(claims.sub).digest('hex'),subjectHash))
    reject('OIDC_IDENTITY_REJECTED');
  return claims.sub;
 }catch{reject('OIDC_IDENTITY_REJECTED');}
}
export async function finishFounderOidc({env,callbackUrl,cookieHeader,nowMs=Date.now(),fetcher=fetch}){
 const config=resolveFounderOidcConfig(env);
 const pending=openPendingCookie(cookieValue(cookieHeader),env,nowMs);
 const code=parseCallback(callbackUrl,pending);
 const discovery=await providerJson(fetcher,ISSUER+'/.well-known/openid-configuration');
 if(discovery.issuer!==ISSUER||
    !trustedEndpoint(discovery.authorization_endpoint,[new URL(ISSUER).pathname+'/oauth2/authorize'])||
    !trustedEndpoint(discovery.token_endpoint,[new URL(ISSUER).pathname+'/oauth2/token'])||
    !trustedEndpoint(discovery.jwks_uri,[new URL(ISSUER).pathname+'/jwks',new URL(ISSUER).pathname+'/oauth2/jwks'])||
    !trustedEndpoint(discovery.userinfo_endpoint,[new URL(ISSUER).pathname+'/oauth2/userinfo']))
   reject('OIDC_PROVIDER_UNAVAILABLE');
 const token=await providerJson(fetcher,discovery.token_endpoint,{
   method:'POST',headers:{
    'content-type':'application/x-www-form-urlencoded',
    authorization:'Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64'),
   },
   body:new URLSearchParams({
    grant_type:'authorization_code',client_id:config.clientId,
    code,redirect_uri:CALLBACK,code_verifier:pending.verifier,
   }).toString(),
 });
 if(typeof token.id_token!=='string'||typeof token.access_token!=='string'||
    token.token_type?.toLowerCase()!=='bearer')reject('OIDC_PROVIDER_UNAVAILABLE');
 const jwks=await providerJson(fetcher,discovery.jwks_uri);
 const verifiedSub=verifyProviderToken(token.id_token,jwks,{
   clientId:config.clientId,subjectHash:config.subjectHash,nonce:pending.nonce},nowMs);
 const userinfo=await providerJson(fetcher,discovery.userinfo_endpoint,{
   headers:{authorization:'Bearer '+token.access_token},
 });
 if(userinfo.sub!==verifiedSub||userinfo.email_verified!==true||
    typeof userinfo.email!=='string'||userinfo.email.trim().toLowerCase()!==FOUNDER)
   reject('OIDC_IDENTITY_REJECTED');
 return Object.freeze({
  founderAuthenticated:true,identitySource:'VYNDI_BETTER_AUTH_OIDC',
  clearCookie:FOUNDER_OIDC_CLEAR_COOKIE,productionWriteAuthorized:false,
 });
}
