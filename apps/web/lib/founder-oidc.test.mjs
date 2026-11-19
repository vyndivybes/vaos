import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {beginFounderOidc,finishFounderOidc,openPendingCookie,resolveFounderOidcConfig,FOUNDER_OIDC_COOKIE} from './founder-oidc.mjs';
const issuer='https://vyndios.vayushastr.workers.dev/api/auth';
const base='https://vaos.vayushastr.workers.dev';
const now=Date.parse('2026-11-20T03:00:00Z');
const sub='verified-stable-founder-user';
const env={
 VAOS_AUTH_HARDENED_CONTROL:'dedicated-hmac-v1',VAOS_SESSION_HMAC_KEY:'a'.repeat(64),
 VAOS_VYNDI_OIDC_ENABLED:'commissioned-v1',
 VAOS_VYNDI_OIDC_CLIENT_ID:'vaos-founder-client',
 VAOS_VYNDI_OIDC_CLIENT_SECRET:'s'.repeat(42),
 VAOS_VYNDI_FOUNDER_SUB_SHA256:crypto.createHash('sha256').update(sub).digest('hex'),
};
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const pub={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const issueJwt=claims=>{
 const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify(claims)).toString('base64url');
 const data=h+'.'+b;
 return data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
};
const pending=start=>openPendingCookie(start.setCookie.split(';')[0].split('=')[1],env,now);
const callback=start=>base+'/api/founder-sso-callback?code=one-use-code&state='+encodeURIComponent(pending(start).state)+'&iss='+encodeURIComponent(issuer);
function fakeProvider({claims={},user={},tokenStatus=200,discovery=null,jwks=null}={}){
 const requests=[];
 const fetcher=async(url,init={})=>{
  requests.push({url,init});
  if(url===issuer+'/.well-known/openid-configuration')return{ok:true,json:async()=>discovery||{
   issuer,authorization_endpoint:issuer+'/oauth2/authorize',
   token_endpoint:issuer+'/oauth2/token',jwks_uri:issuer+'/jwks',userinfo_endpoint:issuer+'/oauth2/userinfo'}};
  if(url===issuer+'/oauth2/token')return{ok:tokenStatus===200,json:async()=>({
   id_token:issueJwt({iss:issuer,aud:env.VAOS_VYNDI_OIDC_CLIENT_ID,sub,nonce:fakeProvider.nonce,
    iat:Math.floor(now/1000),exp:Math.floor(now/1000)+300,...claims}),
   access_token:'fake-provider-access-token',token_type:'Bearer'})};
  if(url===issuer+'/jwks')return{ok:true,json:async()=>({keys:jwks??[pub]})};
  if(url===issuer+'/oauth2/userinfo')return{ok:true,json:async()=>({
   sub,email:'shyamsundhar1982@gmail.com',email_verified:true,...user})};
  throw Error('UNEXPECTED_FETCH');
 };
 return {fetcher,requests};
}
test('federation defaults disabled until exact hardened credentials, client and founder subject are provisioned',()=>{
 for(const key of Object.keys(env)){
  const e={...env};delete e[key];
  assert.throws(()=>resolveFounderOidcConfig(e),/OIDC_NOT_COMMISSIONED/);
 }
 assert.throws(()=>resolveFounderOidcConfig({...env,VAOS_VYNDI_OIDC_ENABLED:'true'}),/OIDC_NOT_COMMISSIONED/);
});
test('SSO start produces high-entropy sealed HttpOnly transaction, strict callback and PKCE S256',()=>{
 const a=beginFounderOidc({env,nowMs:now});
 const b=beginFounderOidc({env,nowMs:now});
 const u=new URL(a.location);
 assert.notEqual(a.setCookie,b.setCookie);
 assert.equal(u.pathname,'/api/auth/oauth2/authorize');
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('response_type'),'code');
 assert.equal(u.searchParams.get('scope'),'openid email');
 assert.equal(u.searchParams.get('redirect_uri'),base+'/api/founder-sso-callback');
 assert.ok(a.setCookie.startsWith(FOUNDER_OIDC_COOKIE+'='));
 assert.match(a.setCookie,/HttpOnly/);
 assert.match(a.setCookie,/Secure/);
 assert.match(a.setCookie,/SameSite=Lax/);
 assert.match(a.setCookie,/Max-Age=300/);
 assert.equal(pending(a).state,u.searchParams.get('state'));
 assert.equal(pending(a).nonce,u.searchParams.get('nonce'));
 assert.equal(u.searchParams.get('code_challenge'),crypto.createHash('sha256').update(pending(a).verifier).digest('base64url'));
 assert.ok(pending(a).verifier.length>=43);
 assert.equal(a.setCookie.includes(pending(a).verifier),false);
});
test('verified token, stable subject, verified founder userinfo and nonce admit an identity without business writes',async()=>{
 const a=beginFounderOidc({env,nowMs:now});
 fakeProvider.nonce=pending(a).nonce;
 const provider=fakeProvider();
 const result=await finishFounderOidc({
  env,nowMs:now,callbackUrl:callback(a),cookieHeader:a.setCookie.split(';')[0],fetcher:provider.fetcher});
 assert.equal(result.founderAuthenticated,true);
 assert.equal(result.productionWriteAuthorized,false);
 assert.match(result.clearCookie,/Max-Age=0/);
 assert.equal(provider.requests.length,4);
 const tokenRequest=provider.requests.find(x=>x.url.endsWith('/oauth2/token'));
 assert.equal(tokenRequest.init.method,'POST');
 assert.equal(new URLSearchParams(tokenRequest.init.body).get('code_verifier'),pending(a).verifier);
 assert.equal(tokenRequest.init.headers.authorization,'Basic '+Buffer.from(env.VAOS_VYNDI_OIDC_CLIENT_ID+':'+env.VAOS_VYNDI_OIDC_CLIENT_SECRET).toString('base64'));
});
test('CSRF, callback poisoning, replay from a different browser and expiration all fail before network',async()=>{
 const a=beginFounderOidc({env,nowMs:now});
 const url=callback(a);
 const bad=[
  url.replace(/state=[^&]+/,'state=attacker'),
  url.replace(/iss=[^&]+/,'iss=https%3A%2F%2Fevil.invalid'),
  url+'&code=extra',
  url+'&redirect_uri=https://evil.invalid',
  url.replace(/&iss=[^&]+/,''),
 ];
 for(const u of bad){
  let count=0;
  await assert.rejects(()=>finishFounderOidc({env,nowMs:now,callbackUrl:u,cookieHeader:a.setCookie.split(';')[0],
   fetcher:async()=>{count++;}}),/OIDC_CALLBACK_REJECTED/);
  assert.equal(count,0);
 }
 for(const cookieHeader of ['',FOUNDER_OIDC_COOKIE+'=bogus']){
  await assert.rejects(()=>finishFounderOidc({env,nowMs:now,callbackUrl:url,cookieHeader,fetcher:async()=>{throw Error('unreachable');}}),/OIDC_CALLBACK_REJECTED/);
 }
 await assert.rejects(()=>finishFounderOidc({env,nowMs:now+301000,callbackUrl:url,cookieHeader:a.setCookie.split(';')[0],fetcher:async()=>{throw Error('unreachable');}}),/OIDC_CALLBACK_REJECTED/);
});
test('bad subject, token claims, email status, sender discovery, signatures and token exchange fail closed',async()=>{
 for(const sample of [
  {claims:{sub:'evil'},error:/OIDC_IDENTITY_REJECTED/},
  {claims:{nonce:'evil'},error:/OIDC_IDENTITY_REJECTED/},
  {claims:{aud:'other-client'},error:/OIDC_IDENTITY_REJECTED/},
  {claims:{iss:'https://evil.invalid'},error:/OIDC_IDENTITY_REJECTED/},
  {claims:{exp:Math.floor(now/1000)-10},error:/OIDC_IDENTITY_REJECTED/},
  {user:{email:'someone@invalid.test'},error:/OIDC_IDENTITY_REJECTED/},
  {user:{email_verified:false},error:/OIDC_IDENTITY_REJECTED/},
  {user:{sub:'wrong-user'},error:/OIDC_IDENTITY_REJECTED/},
  {jwks:[],error:/OIDC_IDENTITY_REJECTED/},
  {tokenStatus:401,error:/OIDC_PROVIDER_UNAVAILABLE/},
  {discovery:{issuer,authorization_endpoint:issuer+'/oauth2/authorize',token_endpoint:'https://evil.invalid/token',jwks_uri:issuer+'/jwks',userinfo_endpoint:issuer+'/oauth2/userinfo'},error:/OIDC_PROVIDER_UNAVAILABLE/},
 ]){
  const a=beginFounderOidc({env,nowMs:now});fakeProvider.nonce=pending(a).nonce;
  const provider=fakeProvider(sample);
  await assert.rejects(()=>finishFounderOidc({env,nowMs:now,callbackUrl:callback(a),cookieHeader:a.setCookie.split(';')[0],fetcher:provider.fetcher}),sample.error);
 }
});
