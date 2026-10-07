import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../platform/execution/capability-registry.mjs';
import { createCredentialBroker } from '../../platform/execution/credential-broker.mjs';
import { createPaperlessArchiveAdapter } from './archive-adapter.mjs';

function manifest(overrides={}){return{schemaVersion:'vaos.provider.v1',providerId:'paperless-ngx',displayName:'Paperless-ngx',capabilities:['document.archive'],deploymentModes:['self-hosted'],qualification:{state:'qualified',qualifiedCapabilities:['document.archive'],evidenceRefs:['q']},security:{secretBinding:'required',dataEgress:'controlled',authModes:['bearer'],callbackVerification:'none'},execution:{idempotency:'not-supported',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'required'},...overrides}}
function broker(){return createCredentialBroker({async resolveCredential(){return{kind:'bearer',value:'paperless-token',providerId:'paperless-ngx',capabilities:['document.archive']}}})}
function job(overrides={}){return{id:'job-archive-1',intentId:'intent-archive-1',actionType:'DOCUMENT.ARCHIVE',payload:{archiveKey:'quality.records',artifactRef:'r2:sha256:abc',sourceSha256:'abc',contentType:'application/pdf',metadata:{title:'Inspection Report'}},...overrides}}
function config(){return{secretBindingRef:'secret:paperless:api',archives:{'quality.records':{tags:['quality'],documentType:'inspection-record'}},timeoutMs:60000}}

test('Paperless archives governed artifact and verifies immutable provider document identity',async()=>{
 const calls=[];const a=createPaperlessArchiveAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),artifactReader:{async read(ref){assert.equal(ref,'r2:sha256:abc');return{bytes:new Uint8Array([1,2]),sha256:'abc',contentType:'application/pdf'}}},transport:{async submit(r){calls.push(['submit',r]);return{status:202,body:{taskId:'task-1'}}},async waitTask(r){calls.push(['wait',r]);return{status:'SUCCESS',taskId:'task-1',documentId:'doc-9'}},async readDocument(){return{id:'doc-9',title:'Inspection Report',sourceSha256:'abc'}}},config:config()});
 const r=await a.execute(job());
 assert.equal(r.effect.resourceId,'doc-9');assert.equal(r.verification.verified,true);assert.equal(r.verification.sourceSha256,'abc');assert.equal(JSON.stringify(r).includes('paperless-token'),false);
});

test('unknown archive key fails before credential/provider access',async()=>{
 let touched=false;const a=createPaperlessArchiveAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:createCredentialBroker({async resolveCredential(){touched=true}}),artifactReader:{async read(){touched=true}},transport:{async submit(){touched=true},async waitTask(){touched=true},async readDocument(){touched=true}},config:config()});
 await assert.rejects(()=>a.execute(job({payload:{...job().payload,archiveKey:'unknown'}})),/PAPERLESS_ARCHIVE_NOT_ALLOWED/);assert.equal(touched,false);
});

test('post-submit timeout is unknown and never blindly resubmitted',async()=>{
 const a=createPaperlessArchiveAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf'}}},transport:{async submit(){const e=new Error('timeout');e.requestSent=true;throw e},async waitTask(){},async readDocument(){}},config:config()});
 await assert.rejects(async()=>{try{await a.execute(job())}catch(e){assert.equal(e.code,'PAPERLESS_OUTCOME_UNKNOWN');assert.equal(e.retryable,false);assert.equal(e.outcomeUnknown,true);throw e}},/PAPERLESS_OUTCOME_UNKNOWN/);
});

test('provider readback must match source hash',async()=>{
 const a=createPaperlessArchiveAdapter({capabilityRegistry:createCapabilityRegistry({providers:[manifest()]}),credentialBroker:broker(),artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf'}}},transport:{async submit(){return{status:202,body:{taskId:'task-1'}}},async waitTask(){return{status:'SUCCESS',taskId:'task-1',documentId:'doc-1'}},async readDocument(){return{id:'doc-1',sourceSha256:'different'}}},config:config()});
 await assert.rejects(()=>a.execute(job()),/PAPERLESS_VERIFICATION_FAILED/);
});
