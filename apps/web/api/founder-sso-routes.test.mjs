import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderSsoStartHandler} from './founder-sso-start.mjs';
import {createFounderSsoCallbackHandler} from './founder-sso-callback.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

const origin='https://vaos.vayushastr.workers.dev';
const callback=origin+'/api/founder-sso-callback?code=one-time-code&state=random&iss=any';
const env={};
function shim(){
 const st={code:null,headers:{},body:undefined,ended:false};
 const res={setHeader(k,v){st.headers[k]=v;return this;},
  status(n){st.code=n;return this;},json(v){st.body=v;return this;},
  end(){st.ended=true;return this;}};
 return {res,st};
}
const req=(method='GET',url=origin+'/api/founder-sso-start')=>({method,url,headers:{cookie:''},env});
test('OIDC routes are registered but unavailable without actual issuer and client commissioning',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-sso-start'],'function');
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-sso-callback'],'function');
 const a=shim();await createFounderSsoStartHandler()(req(),a.res);
 assert.equal(a.st.code,503);
 assert.equal(a.st.headers['Location'],undefined);
 assert.equal(a.st.headers['Set-Cookie'],undefined);
 const b=shim();await createFounderSsoCallbackHandler()(req('GET',callback),b.res);
 assert.equal(b.st.code,503);
 assert.equal(b.st.headers['Location'],undefined);
 assert.ok(String(b.st.headers['Set-Cookie']).includes('Max-Age=0'));
});
test('launcher rejects query injection, wrong origin and POST before interacting with identity provider',async()=>{
 let called=0;
 const handler=createFounderSsoStartHandler({getEnv:()=>env,begin:()=>{
  called++;return {location:'https://vyndios.vayushastr.workers.dev/api/auth/oauth2/authorize',setCookie:'session=test'};
 }});
 for(const [method,url,code] of [
  ['POST',origin+'/api/founder-sso-start',405],
  ['GET',origin+'/api/founder-sso-start?redirect_uri=https://evil.invalid',422],
  ['GET','https://evil.invalid/api/founder-sso-start',422],
 ]){
  const x=shim();await handler(req(method,url),x.res);assert.equal(x.st.code,code);
 }
 assert.equal(called,0);
 const a=shim();await handler(req(),a.res);
 assert.equal(a.st.code,302);
 assert.equal(a.st.headers['Cache-Control'],'no-store');
 assert.equal(a.st.headers['Location'],'https://vyndios.vayushastr.workers.dev/api/auth/oauth2/authorize');
 assert.equal(a.st.headers['Set-Cookie'],'session=test');
 assert.equal(called,1);
});
test('callback never issues session after invalid issuer evidence or tampered callback',async()=>{
 let grants=0;
 const handler=createFounderSsoCallbackHandler({
  getEnv:()=>env,finish:async()=>{throw Error('OIDC_IDENTITY_REJECTED')},
  newSession:()=>{grants++;return 'unsafe';},
 });
 const x=shim();await handler(req('GET',callback),x.res);
 assert.equal(x.st.code,401);
 assert.equal(grants,0);
 assert.equal(x.st.headers['Location'],undefined);
 assert.ok(String(x.st.headers['Set-Cookie']).includes('Max-Age=0'));
 assert.doesNotMatch(JSON.stringify(x.st),/unsafe/);
});
test('genuine trusted OIDC identity can receive a rotated hardened VAOS session only after revocation check',async()=>{
 const old=[];
 const handler=createFounderSsoCallbackHandler({
  getEnv:()=>env,
  finish:async()=>({founderAuthenticated:true,identitySource:'VYNDI_BETTER_AUTH_OIDC',productionWriteAuthorized:false}),
  newSession:()=>{old.push('issue');return 'signature.session';},
  verifySession:()=>({email:'shyamsundhar1982@gmail.com',v:2}),
  revokeExisting:async()=>{old.push('revoke');return {revoked:false};},
 });
 const x=shim();await handler(req('GET',callback),x.res);
 assert.deepEqual(old,['revoke','issue']);
 assert.equal(x.st.code,303);
 assert.equal(x.st.headers['Location'],'/workspace');
 assert.equal(x.st.headers['Set-Cookie'].length,2);
 assert.ok(x.st.headers['Set-Cookie'][0].includes('Max-Age=0'));
 assert.ok(x.st.headers['Set-Cookie'][1].includes('HttpOnly'));
 assert.ok(x.st.headers['Set-Cookie'][1].includes('Secure'));
});
test('session revocation uncertainty, untrusted issuer identity, or invalid principal must not mint a session',async()=>{
 for(const opts of [
  {attested:{founderAuthenticated:true,identitySource:'VYNDI_BETTER_AUTH_OIDC',productionWriteAuthorized:false},revokeExisting:async()=>{throw Error('R2_UNAVAILABLE')},status:503},
  {attested:{founderAuthenticated:true,identitySource:'FAKE',productionWriteAuthorized:false},revokeExisting:async()=>({revoked:false}),status:401},
  {attested:{founderAuthenticated:true,identitySource:'VYNDI_BETTER_AUTH_OIDC',productionWriteAuthorized:true},revokeExisting:async()=>({revoked:false}),status:401},
 ]){
  let minted=0;
  const handler=createFounderSsoCallbackHandler({
   getEnv:()=>env,finish:async()=>opts.attested,
   revokeExisting:opts.revokeExisting,
   newSession:()=>{minted++;return 'new.session';},
  });
  const x=shim();await handler(req('GET',callback),x.res);
  assert.equal(x.st.code,opts.status);
  assert.equal(minted,0);
  assert.equal(x.st.headers['Location'],undefined);
 }
});
