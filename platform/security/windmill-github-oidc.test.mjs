import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { verifyWindmillGithubOidc } from './windmill-github-oidc.mjs';

const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'qualification-test-kid',alg:'RS256',use:'sig'};
const ISSUER='https://token.actions.githubusercontent.com';
const RUN='37860012345';
const WF='vyndivybes/vaos/.github/workflows/windmill-live-do-qualification.yml@refs/heads/main';
const NOW=Math.floor(Date.now()/1000);
const baseClaims={
  iss:ISSUER,aud:'vaos-windmill-do-qualification',repository:'vyndivybes/vaos',
  ref:'refs/heads/main',event_name:'push',workflow_ref:WF,
  run_id:RUN,run_attempt:'1',iat:NOW,nbf:NOW-2,exp:NOW+180,
};
function sign(claims=baseClaims){
  const head=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid,typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data=head+'.'+payload;
  const signer=createSign('RSA-SHA256');signer.update(data);signer.end();
  return data+'.'+signer.sign(privateKey).toString('base64url');
}
const fetchJwks=async()=>({ok:true,json:async()=>({keys:[jwk]})});
const verify=(token,fetchImpl=fetchJwks)=>verifyWindmillGithubOidc(token,{fetchImpl,now:()=>NOW});
test('valid signed, audience-bound GitHub push token authorizes only the exact main workflow',async()=>{
  const v=await verify(sign());
  assert.deepEqual(v,{runId:RUN,runAttempt:'1'});
});
test('signature tampering and untrusted public key are rejected',async()=>{
  const t=sign();
  const pieces=t.split('.');
  const tampered=pieces[0]+'.'+Buffer.from(JSON.stringify({...baseClaims,repository:'attacker/repo'})).toString('base64url')+'.'+pieces[2];
  await assert.rejects(verify(tampered),{code:'WINDMILL_GITHUB_IDENTITY_REJECTED'});
  await assert.rejects(verify(t,async()=>({ok:true,json:async()=>({keys:[]})})),{code:'WINDMILL_GITHUB_IDENTITY_REJECTED'});
});
test('wrong scope, audience, ref, trigger, workflow, issuer, stale claims or unknown run ID fail closed',async()=>{
  for(const changes of [
    {aud:'anywhere'},{repository:'someone/other'},{ref:'refs/heads/feature'},
    {event_name:'pull_request'},{workflow_ref:'vyndivybes/vaos/.github/workflows/evil.yml@refs/heads/main'},
    {iss:'https://untrusted.example'}, {exp:NOW-1},{nbf:NOW+90},
    {iat:NOW-700},{run_id:'../../escape'},{run_attempt:'0'},
  ]){
    await assert.rejects(verify(sign({...baseClaims,...changes})),{code:'WINDMILL_GITHUB_IDENTITY_REJECTED'});
  }
});
test('reject unsigned, oversized, wrong-alg and malformed tokens',async()=>{
  for(const bad of ['', 'not.a.jwt','x'.repeat(17000)]){
    await assert.rejects(verify(bad),{code:'WINDMILL_GITHUB_IDENTITY_REJECTED'});
  }
  const hs=Buffer.from(JSON.stringify({alg:'HS256',kid:jwk.kid})).toString('base64url');
  await assert.rejects(verify(hs+'.'+sign().split('.').slice(1).join('.')),{code:'WINDMILL_GITHUB_IDENTITY_REJECTED'});
});
test('network / invalid JWKS never authorizes',async()=>{
  await assert.rejects(verify(sign(),async()=>{throw Error('network unavailable')}),{code:'WINDMILL_GITHUB_IDENTITY_REJECTED'});
  await assert.rejects(verify(sign(),async()=>({ok:false,status:502})),{code:'WINDMILL_GITHUB_IDENTITY_REJECTED'});
});
