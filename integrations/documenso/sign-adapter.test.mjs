import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createDocumensoSignAdapter } from './sign-adapter.mjs';

function manifest(){return{schemaVersion:'vaos.provider.v1',providerId:'documenso',displayName:'Documenso',capabilities:['document.sign'],deploymentModes:['self-hosted'],qualification:{state:'qualified',qualifiedCapabilities:['document.sign'],evidenceRefs:['q']},security:{secretBinding:'required',dataEgress:'controlled',authModes:['bearer'],callbackVerification:'provider-specific'},execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'}}}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'bearer',value:'documenso-token',providerId:'documenso',capabilities:['document.sign']}}})}
function job(){return{id:'job-sign-1',intentId:'intent-sign-1',actionType:'DOCUMENT.SIGN',payload:{documentKey:'nda.standard',sourceArtifactRef:'r2:sha256:abc',signers:[{signerRef:'person:1',email:'a@example.com'}]}}}
function config(){return{secretBindingRef:'secret:documenso:api',documents:{'nda.standard':{templateId:'tpl-1'}},timeoutMs:120000}}

test('Documenso sends governed document and stores completed signed artifact evidence',async()=>{
 const a=createDocumensoSignAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf'}}},artifactBroker:{async put(){return{artifactRef:'r2:sha256:signed',sha256:'signed',contentType:'application/pdf',size:2}}},transport:{async createEnvelope(){return{status:201,body:{envelopeId:'env-1'}}},async waitEnvelope(){return{envelopeId:'env-1',status:'completed',signerRefs:['person:1'],signedBytes:new Uint8Array([2,3])}}},config:config()});
 const r=await a.execute(job());assert.equal(r.effect.resourceId,'env-1');assert.equal(r.effect.signedArtifactRef,'r2:sha256:signed');assert.equal(r.verification.verified,true);
});

test('ambiguous send failure is unknown outcome and not automatically retryable',async()=>{
 const a=createDocumensoSignAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf'}}},artifactBroker:{async put(){}},transport:{async createEnvelope(){const e=new Error('timeout');e.requestSent=true;throw e},async waitEnvelope(){}},config:config()});
 await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'DOCUMENSO_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);throw e}},/DOCUMENSO_OUTCOME_UNKNOWN/);
});

test('signer identity mismatch fails verification',async()=>{
 const a=createDocumensoSignAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf'}}},artifactBroker:{async put(){throw new Error('should not store')}},transport:{async createEnvelope(){return{status:201,body:{envelopeId:'env-1'}}},async waitEnvelope(){return{envelopeId:'env-1',status:'completed',signerRefs:['other'],signedBytes:new Uint8Array([2])}}},config:config()});
 await assert.rejects(()=>a.execute(job()),/DOCUMENSO_VERIFICATION_FAILED/);
});

test('unknown document key fails before credential/provider access',async()=>{
 let touched=false;const j=job();j.payload.documentKey='unknown';const a=createDocumensoSignAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),artifactReader:{async read(){touched=true}},artifactBroker:{async put(){touched=true}},transport:{async createEnvelope(){touched=true},async waitEnvelope(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute(j),/DOCUMENSO_DOCUMENT_NOT_ALLOWED/);assert.equal(touched,false);
});
