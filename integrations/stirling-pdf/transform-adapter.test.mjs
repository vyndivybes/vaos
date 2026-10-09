import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createStirlingTransformAdapter } from './transform-adapter.mjs';

function manifest(overrides={}) {
  return {
    schemaVersion:'vaos.provider.v1',
    providerId:'stirling-pdf',
    displayName:'Stirling PDF',
    capabilities:['document.transform'],
    deploymentModes:['self-hosted'],
    qualification:{state:'qualified',qualifiedCapabilities:['document.transform'],evidenceRefs:['q']},
    security:{secretBinding:'required',dataEgress:'controlled',authModes:['api-key'],callbackVerification:'none'},
    execution:{idempotency:'vaos-enforced',retrySemantics:'safe',verificationStrategy:'artifact-hash',healthProbe:'required'},
    ...overrides,
  };
}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'api-key',value:'stirling-key',providerId:'stirling-pdf',capabilities:['document.transform']}}})}
function job(overrides={}) {
  return {
    id:'job-pdf-1',intentId:'intent-pdf-1',actionType:'DOCUMENT.TRANSFORM',
    payload:{
      operationKey:'pdf.rotate-90',
      sourceArtifactRef:'r2:sha256:abc',
      options:{angle:90},
    },
    ...overrides,
  };
}
function config(overrides={}) {
  return {
    baseUrl:'https://stirling.internal.example',
    secretBindingRef:'secret:stirling:api',
    operations:{
      'pdf.rotate-90':{
        endpointPath:'/api/v1/general/rotate-pdf',
        operation:'rotate-pdf',
        inputContentTypes:['application/pdf'],
        outputContentType:'application/pdf',
        allowedOptions:['angle'],
        deterministic:true,
        maxOutputBytes:1000,
      },
      'pdf.compress':{
        endpointPath:'/api/v1/misc/compress-pdf',
        operation:'compress-pdf',
        inputContentTypes:['application/pdf'],
        outputContentType:'application/pdf',
        allowedOptions:['optimizeLevel'],
        deterministic:true,
        maxOutputBytes:1000,
      },
    },
    timeoutMs:60000,
    ...overrides,
  };
}
function sourceReader(){
  return {async read(ref){assert.equal(ref,'r2:sha256:abc');return{bytes:new Uint8Array([1,2]),sha256:'abc',contentType:'application/pdf'}}};
}
function outputBroker(){
  return {async put(input){
    assert.equal(input.kind,'document.transform');
    assert.deepEqual(input.sourceRefs,['r2:sha256:abc']);
    return{artifactRef:'r2:sha256:def',sha256:'def',size:input.bytes.byteLength,contentType:'application/pdf'};
  }};
}

test('Stirling transforms only approved operation and seals output through artifact broker',async()=>{
  const calls=[];
  const a=createStirlingTransformAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),
    artifactReader:sourceReader(),
    artifactBroker:outputBroker(),
    transport:{async transform(input){calls.push(input);return{status:200,bodyBytes:new Uint8Array([2,1]),contentType:'application/pdf'}}},
    config:config(),
  });
  const r=await a.execute(job());
  assert.equal(r.effect.resourceId,'r2:sha256:def');
  assert.equal(r.effect.outputSha256,'def');
  assert.equal(r.verification.sourceSha256,'abc');
  assert.equal(r.verification.outputSha256,'def');
  assert.equal(r.verification.verified,true);
  assert.equal(calls[0].url,'https://stirling.internal.example/api/v1/general/rotate-pdf');
  assert.equal(calls[0].headers['X-API-KEY'],'stirling-key');
  assert.equal(calls[0].operation,'rotate-pdf');
  assert.deepEqual(calls[0].options,{angle:90});
  assert.equal(JSON.stringify(r).includes('stirling-key'),false);
});

test('unapproved operation or option fails before artifact read, credential or provider call',async()=>{
  let touched=false;
  const b=createCredentialBroker({async resolveCredential(){touched=true;throw new Error('no')}});
  const a=createStirlingTransformAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:b,
    artifactReader:{async read(){touched=true}},
    artifactBroker:{async put(){touched=true}},
    transport:{async transform(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>a.execute(job({payload:{...job().payload,operationKey:'pdf.url-to-pdf'}})),/STIRLING_OPERATION_NOT_ALLOWED/);
  await assert.rejects(()=>a.execute(job({payload:{...job().payload,options:{angle:90,remoteUrl:'https:\/\/evil.example'}}})),/STIRLING_OPTION_NOT_ALLOWED/);
  assert.equal(touched,false);
});

test('remote URL source is never accepted; only governed artifact reference is allowed',async()=>{
  let touched=false;
  const a=createStirlingTransformAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),
    artifactReader:{async read(){touched=true}},
    artifactBroker:{async put(){touched=true}},
    transport:{async transform(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>a.execute(job({payload:{operationKey:'pdf.compress',sourceUrl:'https://evil.example/x.pdf',options:{}}})),/STIRLING_JOB_INVALID:sourceArtifactRef/);
  assert.equal(touched,false);
});

test('provider qualification gate fails closed before artifact read or transform',async()=>{
  let touched=false;
  const a=createStirlingTransformAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest({qualification:{state:'evaluation',qualifiedCapabilities:[]}})]}),
    credentialBroker:broker(),
    artifactReader:{async read(){touched=true}},
    artifactBroker:{async put(){touched=true}},
    transport:{async transform(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>a.execute(job()),/STIRLING_PROVIDER_NOT_QUALIFIED/);
  assert.equal(touched,false);
});

test('network ambiguity is retryable only for deterministic configured transforms',async()=>{
  const a=createStirlingTransformAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),
    artifactReader:sourceReader(),
    artifactBroker:outputBroker(),
    transport:{async transform(){const e=new Error('timeout');e.requestSent=true;throw e}},
    config:config(),
  });
  await assert.rejects(async()=>{
    try{await a.execute(job())}
    catch(error){
      assert.equal(error.code,'STIRLING_TRANSFORM_RETRYABLE');
      assert.equal(error.retryable,true);
      assert.equal(error.outcomeUnknown,false);
      throw error;
    }
  },/STIRLING_TRANSFORM_RETRYABLE/);
});

test('input type, output type and output size policies fail closed before persistence',async()=>{
  for(const mode of ['input','type','size']){
    let stored=false;
    const reader=mode==='input'
      ?{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'text/html'}}}
      :sourceReader();
    const transport={async transform(){
      if(mode==='type')return{status:200,bodyBytes:new Uint8Array([1]),contentType:'text/html'};
      if(mode==='size')return{status:200,bodyBytes:new Uint8Array([1,2,3,4]),contentType:'application/pdf'};
      return{status:200,bodyBytes:new Uint8Array([1]),contentType:'application/pdf'};
    }};
    const cfg=mode==='size'?config({operations:{'pdf.rotate-90':{...config().operations['pdf.rotate-90'],maxOutputBytes:3}}}):config();
    const a=createStirlingTransformAdapter({
      capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
      credentialBroker:broker(),artifactReader:reader,
      artifactBroker:{async put(){stored=true}},
      transport,config:cfg,
    });
    await assert.rejects(()=>a.execute(job()),/STIRLING_(INPUT_TYPE_REJECTED|OUTPUT_INVALID|OUTPUT_TOO_LARGE)/);
    assert.equal(stored,false);
  }
});

test('provider must return bytes; remote output URLs are rejected',async()=>{
  const a=createStirlingTransformAdapter({
    capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),
    credentialBroker:broker(),artifactReader:sourceReader(),artifactBroker:outputBroker(),
    transport:{async transform(){return{status:200,body:{url:'https://example/output.pdf'},contentType:'application/pdf'}}},
    config:config(),
  });
  await assert.rejects(()=>a.execute(job()),/STIRLING_OUTPUT_INVALID/);
});


import { createStirlingCloudTransport } from './transform-adapter.mjs';

test('Stirling Cloud transport builds guarded multipart POST with API key and PDF bytes',async()=>{
  let requests=0;
  const transport=createStirlingCloudTransport({fetchImpl:async(url,init)=>{
    requests++;
    assert.equal(url,'https://api.stirling.com/api/v1/general/rotate-pdf');
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'manual');
    assert.equal(init.headers['X-API-KEY'],'redacted-test-key');
    assert.equal(init.body.get('angle'),'90');
    const file=init.body.get('fileInput');
    assert.equal(file.type,'application/pdf');
    assert.equal(await file.text(),'%PDF-1.4 synthetic');
    return new Response('%PDF-1.4 transformed',{status:200,headers:{'content-type':'application/pdf'}});
  }});
  const result=await transport.transform({
    url:'https://api.stirling.com/api/v1/general/rotate-pdf',
    method:'POST',headers:{'X-API-KEY':'redacted-test-key'},
    operation:'rotate-pdf',sourceBytes:new TextEncoder().encode('%PDF-1.4 synthetic'),
    sourceContentType:'application/pdf',options:{angle:90},timeoutMs:1000,
  });
  assert.equal(result.status,200);
  assert.equal(result.contentType,'application/pdf');
  assert.equal(new TextDecoder().decode(result.bodyBytes),'%PDF-1.4 transformed');
  assert.equal(requests,1);
});

test('Stirling Cloud transport denies other hosts, redirects, non-PDF results and unexpected angles',async()=>{
  let requests=0;
  const ok=()=>({url:'https://api.stirling.com/api/v1/general/rotate-pdf',method:'POST',
    headers:{'X-API-KEY':'test-secret'},operation:'rotate-pdf',
    sourceBytes:new TextEncoder().encode('%PDF-1.4 test'),sourceContentType:'application/pdf',
    options:{angle:90},timeoutMs:1000});
  const transport=createStirlingCloudTransport({fetchImpl:async()=>{
    requests++;return new Response('',{status:302,headers:{location:'https://evil.invalid'}});
  }});
  await assert.rejects(()=>transport.transform({...ok(),url:'https://evil.invalid/api/v1/general/rotate-pdf'}),/STIRLING_TRANSPORT_URL_REJECTED/);
  await assert.rejects(()=>transport.transform({...ok(),options:{angle:0}}),/STIRLING_TRANSPORT_REQUEST_REJECTED/);
  await assert.rejects(()=>transport.transform(ok()),/STIRLING_TRANSPORT_REDIRECT_BLOCKED/);
  assert.equal(requests,1);
  const html=createStirlingCloudTransport({fetchImpl:async()=>new Response('<html>bad</html>',{status:200,headers:{'content-type':'text/html'}})});
  await assert.rejects(()=>html.transform(ok()),/STIRLING_TRANSPORT_OUTPUT_REJECTED/);
});
