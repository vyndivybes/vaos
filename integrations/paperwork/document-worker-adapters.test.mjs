import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import {
  createPaperworkClassifyAdapter,
  createPaperworkFillAdapter,
  createPaperworkRedactAdapter,
} from './document-worker-adapters.mjs';

function manifest(capability){
  return {
    schemaVersion:'vaos.provider.v1',providerId:'paperwork',displayName:'Paperwork',
    capabilities:[capability],deploymentModes:['managed-saas'],
    qualification:{state:'qualified',qualifiedCapabilities:[capability],evidenceRefs:['q']},
    security:{secretBinding:'required',dataEgress:'external',authModes:['bearer'],callbackVerification:'public-key'},
    execution:{idempotency:'native',retrySemantics:'safe',verificationStrategy:'provider-readback',healthProbe:'required'},
  };
}
function broker(capability){return createCredentialBroker({async resolveCredential(){return{kind:'bearer',value:'paperwork-key',providerId:'paperwork',capabilities:[capability]}}})}
function fileBridge(){return{async ensureFile({artifactRef}){return{fileId:`file-${artifactRef.split(':').at(-1)}`,artifactRef,sourceSha256:artifactRef.split(':').at(-1),contentType:'application/pdf',fileName:'input.pdf'}}}}
function artifactBroker(){return{async put(input){return{artifactRef:'r2:sha256:output',sha256:'output',size:input.bytes.byteLength,contentType:input.contentType}}}}
function baseConfig(overrides={}){return{
  apiBaseUrl:'https://api.cloudraker.com',secretBindingRef:'secret:paperwork:api',
  waitSeconds:0,readWaitSeconds:30,ttlSeconds:86400,maxOutputBytes:1000,
  classifications:{'document.kind':{action:'document-kind',resultField:'category',allowedLabels:['quote','invoice','nda']}},
  fills:{'vendor.onboarding':{action:'vendor-onboarding',output:'flattened',allowedValueKeys:['company_name','tax_id'],allowSourceFiles:true}},
  redactions:{'privacy.standard':{action:'privacy-standard'}},
  ...overrides,
}}

test('classification uses pinned extraction action, citations and allowed labels',async()=>{
 const calls=[];
 const a=createPaperworkClassifyAdapter({
  capabilityRegistry:createCapabilityRegistry({providers:[manifest('document.classify')]}),
  credentialBroker:broker('document.classify'),fileBridge:fileBridge(),
  transport:{
   async startRun(req){calls.push(req);return{status:200,body:{id:'exr-1',status:'processed',output:{value:{category:'quote'},citations:{category:[{fileId:'file-abc',page:0}]}}}}},
   async readRun(){throw new Error('unused')},
  },config:baseConfig(),
 });
 const r=await a.execute({id:'j1',intentId:'i1',actionType:'DOCUMENT.CLASSIFY',payload:{classificationKey:'document.kind',sourceArtifactRef:'r2:sha256:abc'}});
 assert.equal(r.effect.classification,'quote');
 assert.equal(r.verification.verified,true);
 assert.equal(calls[0].url,'https://api.cloudraker.com/v1/extract?wait=0');
 assert.equal(calls[0].headers['Idempotency-Key'],'j1');
 assert.equal(calls[0].body.action,'document-kind');
 assert.equal(calls[0].body.citations,true);
});

test('classification rejects labels outside governed profile',async()=>{
 const a=createPaperworkClassifyAdapter({
  capabilityRegistry:createCapabilityRegistry({providers:[manifest('document.classify')]}),
  credentialBroker:broker('document.classify'),fileBridge:fileBridge(),
  transport:{async startRun(){return{status:200,body:{id:'exr-1',status:'processed',output:{value:{category:'malware'},citations:{category:[{fileId:'f',page:0}]}}}}},async readRun(){}},
  config:baseConfig(),
 });
 await assert.rejects(()=>a.execute({id:'j',intentId:'i',actionType:'DOCUMENT.CLASSIFY',payload:{classificationKey:'document.kind',sourceArtifactRef:'r2:sha256:abc'}}),/PAPERWORK_CLASSIFICATION_REJECTED/);
});

test('fill from governed values produces PDF artifact and only allows configured fields',async()=>{
 const calls=[];
 const a=createPaperworkFillAdapter({
  capabilityRegistry:createCapabilityRegistry({providers:[manifest('document.fill')]}),
  credentialBroker:broker('document.fill'),fileBridge:fileBridge(),artifactBroker:artifactBroker(),
  transport:{
   async startRun(req){calls.push(req);return{status:200,body:{id:'flr-1',status:'processed',output:{file:{id:'file-out'}}}}},
   async readRun(){throw new Error('unused')},
   async downloadOutput(){return{status:200,bodyBytes:new Uint8Array([1,2]),contentType:'application/pdf'}},
  },config:baseConfig(),
 });
 const r=await a.execute({id:'j2',intentId:'i2',actionType:'DOCUMENT.FILL',payload:{fillKey:'vendor.onboarding',values:{company_name:'Acme',tax_id:'123'}}});
 assert.equal(r.effect.outputArtifactRef,'r2:sha256:output');
 assert.equal(r.verification.outputSha256,'output');
 assert.deepEqual(calls[0].body.values,{company_name:'Acme',tax_id:'123'});
 assert.equal(calls[0].body.action,'vendor-onboarding');

 await assert.rejects(()=>a.execute({id:'j3',intentId:'i3',actionType:'DOCUMENT.FILL',payload:{fillKey:'vendor.onboarding',values:{shell:'bad'}}}),/PAPERWORK_FILL_FIELD_NOT_ALLOWED/);
});

test('fill may draft values from governed source artifacts when profile permits it',async()=>{
 const a=createPaperworkFillAdapter({
  capabilityRegistry:createCapabilityRegistry({providers:[manifest('document.fill')]}),
  credentialBroker:broker('document.fill'),fileBridge:fileBridge(),artifactBroker:artifactBroker(),
  transport:{
   async startRun(req){assert.deepEqual(req.body.files,[{id:'file-aaa'},{id:'file-bbb'}]);return{status:200,body:{id:'flr-2',status:'processed',output:{file:{id:'file-out'}}}}},
   async readRun(){},async downloadOutput(){return{status:200,bodyBytes:new Uint8Array([1]),contentType:'application/pdf'}},
  },config:baseConfig(),
 });
 const r=await a.execute({id:'j',intentId:'i',actionType:'DOCUMENT.FILL',payload:{fillKey:'vendor.onboarding',sourceArtifactRefs:['r2:sha256:aaa','r2:sha256:bbb']}});
 assert.equal(r.verification.verified,true);
});

test('redact uses only saved governed policy and seals new PDF artifact',async()=>{
 const a=createPaperworkRedactAdapter({
  capabilityRegistry:createCapabilityRegistry({providers:[manifest('document.redact')]}),
  credentialBroker:broker('document.redact'),fileBridge:fileBridge(),artifactBroker:artifactBroker(),
  transport:{
   async startRun(req){assert.equal(req.body.action,'privacy-standard');assert.deepEqual(req.body.file,{id:'file-abc'});return{status:200,body:{id:'rdr-1',status:'processed',output:{file:{id:'redacted-file'}}}}},
   async readRun(){},async downloadOutput(){return{status:200,bodyBytes:new Uint8Array([3]),contentType:'application/pdf'}},
  },config:baseConfig(),
 });
 const r=await a.execute({id:'j',intentId:'i',actionType:'DOCUMENT.REDACT',payload:{redactionKey:'privacy.standard',sourceArtifactRef:'r2:sha256:abc'}});
 assert.equal(r.effect.outputArtifactRef,'r2:sha256:output');
 assert.equal(r.effect.canonicalStateUpdated,false);
});

test('unknown profiles fail before credentials or provider calls',async()=>{
 let touched=false;
 for(const [creator,cap,payload] of [
  [createPaperworkClassifyAdapter,'document.classify',{classificationKey:'unknown',sourceArtifactRef:'r2:sha256:abc'}],
  [createPaperworkFillAdapter,'document.fill',{fillKey:'unknown',values:{}}],
  [createPaperworkRedactAdapter,'document.redact',{redactionKey:'unknown',sourceArtifactRef:'r2:sha256:abc'}],
 ]){
  const a=creator({
   capabilityRegistry:createCapabilityRegistry({providers:[manifest(cap)]}),
   credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),
   fileBridge:{async ensureFile(){touched=true}},artifactBroker:{async put(){touched=true}},
   transport:{async startRun(){touched=true},async readRun(){touched=true},async downloadOutput(){touched=true}},
   config:baseConfig(),
  });
  await assert.rejects(()=>a.execute({id:'j',intentId:'i',actionType:'X.Y',payload}),/PAPERWORK_(CLASSIFICATION|FILL|REDACTION)_NOT_ALLOWED/);
 }
 assert.equal(touched,false);
});

test('ambiguous dispatch is safely retryable because Paperwork supports Idempotency-Key',async()=>{
 for(const [creator,cap,payload] of [
  [createPaperworkClassifyAdapter,'document.classify',{classificationKey:'document.kind',sourceArtifactRef:'r2:sha256:abc'}],
  [createPaperworkFillAdapter,'document.fill',{fillKey:'vendor.onboarding',values:{company_name:'Acme'}}],
  [createPaperworkRedactAdapter,'document.redact',{redactionKey:'privacy.standard',sourceArtifactRef:'r2:sha256:abc'}],
 ]){
  const a=creator({
   capabilityRegistry:createCapabilityRegistry({providers:[manifest(cap)]}),credentialBroker:broker(cap),
   fileBridge:fileBridge(),artifactBroker:artifactBroker(),
   transport:{async startRun(){const e=new Error('timeout');e.requestSent=true;throw e},async readRun(){},async downloadOutput(){}},
   config:baseConfig(),
  });
  await assert.rejects(async()=>{try{await a.execute({id:'stable-job',intentId:'i',actionType:'X.Y',payload})}catch(e){assert.equal(e.code,'PAPERWORK_DISPATCH_RETRYABLE');assert.equal(e.retryable,true);assert.equal(e.outcomeUnknown,false);throw e}},/PAPERWORK_DISPATCH_RETRYABLE/);
 }
});
