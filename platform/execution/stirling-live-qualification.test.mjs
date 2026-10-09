import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runStirlingLiveQualification,getStirlingLiveQualificationEvidence} from './stirling-live-qualification.mjs';

function bucket(){
  const objects=new Map();
  return {
    objects,
    async head(k){const x=objects.get(k);return x?{size:x.bytes.byteLength,
      httpMetadata:x.httpMetadata,customMetadata:x.customMetadata}:null},
    async get(k){const x=objects.get(k);return x?{size:x.bytes.byteLength,
      httpMetadata:x.httpMetadata,customMetadata:x.customMetadata,
      arrayBuffer:async()=>x.bytes.buffer.slice(x.bytes.byteOffset,x.bytes.byteOffset+x.bytes.byteLength)}:null},
    async put(k,data,opts={}){
      if(opts.onlyIf?.etagDoesNotMatch==='*'&&objects.has(k))return null;
      const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
      objects.set(k,{bytes:new Uint8Array(bytes),httpMetadata:opts.httpMetadata||{},
        customMetadata:opts.customMetadata||{}});
      return {key:k,size:bytes.byteLength};
    }
  };
}
const env=(r2)=>({VAOS_ARTIFACTS:r2,STIRLING_API_BASE:'https://api.stirling.com',
  INFISICAL_BASE_URL:'https://us.infisical.com',INFISICAL_ENVIRONMENT:'dev',
  STIRLING_INFISICAL_CLIENT_ID:'test-client',STIRLING_INFISICAL_CLIENT_SECRET:'test-secret',
  STIRLING_INFISICAL_PROJECT_ID:'test-project'});
async function testTransport({forbidden=false}={}){
  const fixture=Buffer.from((await readFile(new URL('../../scripts/qualification/wave3-synthetic.pdf.base64',import.meta.url),'utf8')).trim(),'base64');
  const transformed=Buffer.concat([fixture,Buffer.from('\n%vaos-synthetic-rotated-90\n')]);
  let calls=0;
  return {calls:()=>calls,fetchImpl:async(u,init={})=>{
    calls++;
    const url=String(u);
    if(url.endsWith('/api/v1/auth/universal-auth/login'))return Response.json({accessToken:'infisical-token',expiresIn:600});
    if(url.includes('/api/v4/secrets/STIRLING_API_KEY?'))
      return forbidden?Response.json({error:'forbidden'},{status:403}):
        Response.json({secret:{secretValue:'test-stirling-key'}});
    if(url.endsWith('/api/v1/general/rotate-pdf')){
      assert.equal(init.headers['X-API-KEY'],'test-stirling-key');
      assert.equal(init.body.get('angle'),'90');
      return new Response(transformed,{status:200,headers:{'content-type':'application/pdf'}});
    }
    throw Error('Unexpected URL: '+url);
  }};
}
test('one-shot hosted Stirling transforms PDF and independently verifies immutable R2 output hash',async()=>{
  const b=bucket(),upstream=await testTransport();
  const result=await runStirlingLiveQualification({env:env(b),fetchImpl:upstream.fetchImpl,githubRunId:'501'});
  assert.equal(result.status,'PASS');assert.equal(result.auditVerified,true);
  assert.equal(result.outputPdfVerified,true);assert.equal(result.productionActivation,false);
  assert.notEqual(result.sourceSha256,result.outputSha256);
  const before=upstream.calls();
  const cached=await runStirlingLiveQualification({env:env(b),fetchImpl:upstream.fetchImpl,githubRunId:'501'});
  assert.equal(cached.status,'PASS');assert.equal(cached.cached,true);assert.equal(upstream.calls(),before);
  const evidence=await getStirlingLiveQualificationEvidence({env:env(b)});
  assert.equal(evidence.status,'PASS');assert.equal(evidence.outputSha256,result.outputSha256);
  const audit=b.objects.get('qualification/stirling-cloud/v1/evidence.json');
  assert.equal(JSON.stringify(audit).includes('test-stirling-key'),false);
  assert.equal(JSON.stringify(audit).includes('infisical-token'),false);
});
test('Infisical denied scope produces durable HOLD and does not call Stirling Cloud',async()=>{
  const b=bucket(),upstream=await testTransport({forbidden:true});
  const result=await runStirlingLiveQualification({env:env(b),fetchImpl:upstream.fetchImpl});
  assert.equal(result.status,'HOLD');assert.equal(result.productionActivation,false);
  assert.notEqual(result.reason,'STIRLING_LIVE_ARTIFACT_READBACK_VERIFIED');
});
test('independent readback detects modified output bytes despite existing PASS audit',async()=>{
  const b=bucket(),upstream=await testTransport();
  assert.equal((await runStirlingLiveQualification({env:env(b),fetchImpl:upstream.fetchImpl})).status,'PASS');
  const audit=b.objects.get('qualification/stirling-cloud/v1/evidence.json');
  const row=JSON.parse(new TextDecoder().decode(audit.bytes));
  const object=b.objects.get('vaos-artifacts/sha256/'+row.outputSha256);
  object.bytes[0]=0;
  const evidence=await getStirlingLiveQualificationEvidence({env:env(b)});
  assert.equal(evidence.status,'HOLD');
  assert.equal(evidence.reason,'STIRLING_INDEPENDENT_READBACK_FAILED');
});
