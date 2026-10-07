import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createStirlingTransformAdapter } from './transform-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'stirling-pdf',displayName:'Stirling PDF',capabilities:['document.transform'],deploymentModes:['self-hosted'],qualification:{state:'qualified',qualifiedCapabilities:['document.transform'],evidenceRefs:['q']},security:{secretBinding:'not-applicable',dataEgress:'none',authModes:['local'],callbackVerification:'none'},execution:{idempotency:'native',retrySemantics:'safe',verificationStrategy:'artifact-hash',healthProbe:'required'}}}
function job(overrides={}){return{id:'job-pdf-1',intentId:'intent-pdf-1',actionType:'DOCUMENT.TRANSFORM',payload:{operationKey:'pdf.compress',sourceArtifactRef:'r2:sha256:abc',options:{quality:'medium'}},...overrides}}
function config(){return{operations:{'pdf.compress':{operation:'compress',outputContentType:'application/pdf',maxOutputBytes:1000}},timeoutMs:60000}}

test('Stirling transforms only approved operation and stores output through artifact broker',async()=>{
 const a=createStirlingTransformAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),artifactReader:{async read(){return{bytes:new Uint8Array([1,2]),sha256:'abc',contentType:'application/pdf'}}},artifactBroker:{async put(input){assert.equal(input.kind,'document-transform');return{artifactRef:'r2:sha256:def',sha256:'def',size:2,contentType:'application/pdf'}}},transport:{async transform(input){assert.equal(input.operation,'compress');return{status:200,bytes:new Uint8Array([2,1]),contentType:'application/pdf'}}},config:config()});
 const r=await a.execute(job());assert.equal(r.effect.resourceId,'r2:sha256:def');assert.equal(r.verification.outputSha256,'def');
});

test('unapproved operation fails before artifact read or provider call',async()=>{
 let touched=false;const a=createStirlingTransformAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),artifactReader:{async read(){touched=true}},artifactBroker:{async put(){touched=true}},transport:{async transform(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute(job({payload:{...job().payload,operationKey:'pdf.run-shell'}})),/STIRLING_OPERATION_NOT_ALLOWED/);assert.equal(touched,false);
});

test('remote URL source is not accepted; only governed artifact reference is allowed',async()=>{
 const a=createStirlingTransformAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),artifactReader:{async read(){}},artifactBroker:{async put(){}},transport:{async transform(){}},config:config()});
 await assert.rejects(()=>a.execute(job({payload:{operationKey:'pdf.compress',sourceUrl:'https://evil.example/x.pdf',options:{}}})),/STIRLING_JOB_INVALID:sourceArtifactRef/);
});

test('output content type mismatch fails before artifact storage',async()=>{
 let stored=false;const a=createStirlingTransformAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf'}}},artifactBroker:{async put(){stored=true}},transport:{async transform(){return{status:200,bytes:new Uint8Array([1]),contentType:'text/html'}}},config:config()});
 await assert.rejects(()=>a.execute(job()),/STIRLING_OUTPUT_INVALID/);assert.equal(stored,false);
});
