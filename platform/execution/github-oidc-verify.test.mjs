import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGitHubQualificationOidc } from './github-oidc-verify.mjs';

const enc=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
async function signedFixture(overrides={}){
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
  const now=Math.floor(Date.now()/1000);
  const claims={iss:'https://token.actions.githubusercontent.com',aud:'vaos-stirling-cloud-qualification',
    sub:'repo:vyndivybes/vaos:ref:refs/heads/main',repository:'vyndivybes/vaos',
    repository_id:'1407793546',ref:'refs/heads/main',event_name:'push',
    workflow_ref:'vyndivybes/vaos/.github/workflows/stirling-cloud-qualification.yml@refs/heads/main',
    iat:now-5,nbf:now-5,exp:now+120,...overrides};
  const prefix=enc({alg:'RS256',kid:'test-kid',typ:'JWT'})+'.'+enc(claims);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(prefix));
  return {token:prefix+'.'+enc(Buffer.from(signature)),fetchImpl:async()=>new Response(JSON.stringify({keys:[{...publicKey,kid:'test-kid',alg:'RS256'}]}),{status:200,headers:{'content-type':'application/json'}})};
}
test('GitHub OIDC accepts only signed official main-branch workflow',async()=>{
  const fixture=await signedFixture();
  const claim=await verifyGitHubQualificationOidc(fixture.token,{fetchImpl:fixture.fetchImpl});
  assert.equal(claim.repository,'vyndivybes/vaos');
});
test('GitHub OIDC blocks PR claims and forged signature',async()=>{
  const fixture=await signedFixture({event_name:'pull_request'});
  await assert.rejects(()=>verifyGitHubQualificationOidc(fixture.token,{fetchImpl:fixture.fetchImpl}),/STIRLING_GITHUB_IDENTITY_DENIED/);
  const valid=await signedFixture();
  await assert.rejects(()=>verifyGitHubQualificationOidc(valid.token.slice(0,-3)+'aaa',{fetchImpl:valid.fetchImpl}),/STIRLING_GITHUB_SIGNATURE_INVALID/);
});
test('GitHub OIDC blocks expired and wrong-audience signed tokens',async()=>{
  for(const claims of [{exp:Math.floor(Date.now()/1000)-1},{aud:'different'}]){
    const fixture=await signedFixture(claims);
    await assert.rejects(()=>verifyGitHubQualificationOidc(fixture.token,{fetchImpl:fixture.fetchImpl}),/STIRLING_GITHUB_IDENTITY_DENIED/);
  }
});
