import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtifactBroker, createR2ArtifactStore } from './artifact-broker.mjs';

function fakeBucket(){
  const objects=new Map();
  return {
    objects,
    async head(key){
      const row=objects.get(key);
      return row?{key,size:row.bytes.byteLength,httpMetadata:row.httpMetadata,customMetadata:row.customMetadata}:null;
    },
    async put(key,value,options={}){
      const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
      objects.set(key,{bytes,httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}});
      return {key,size:bytes.byteLength};
    },
  };
}
const fakeSha=async bytes=>`digest-${bytes.byteLength}-${[...bytes].reduce((a,b)=>a+b,0)}`;

test('artifact broker stores immutable bytes and returns only hashed evidence metadata', async()=>{
  const bucket=fakeBucket();
  const store=createR2ArtifactStore({bucket,prefix:'vaos'});
  const broker=createArtifactBroker({store,sha256:fakeSha});

  const result=await broker.put({
    executionJobId:'job-1',intentId:'intent-1',kind:'document',
    contentType:'application/pdf',
    bytes:new Uint8Array([1,2,3,4]),
    sourceRefs:['source:quote-1'],
  });

  assert.equal(result.artifactRef,'r2:sha256:digest-4-10');
  assert.equal(result.sha256,'digest-4-10');
  assert.equal(result.size,4);
  assert.equal(result.contentType,'application/pdf');
  assert.deepEqual(result.sourceRefs,['source:quote-1']);
  assert.equal('bytes' in result,false);
  assert.equal(bucket.objects.size,1);
});

test('same content is idempotent and does not rewrite immutable object', async()=>{
  const bucket=fakeBucket();
  let puts=0;
  const originalPut=bucket.put;
  bucket.put=async(...args)=>{puts+=1;return originalPut(...args)};
  const broker=createArtifactBroker({store:createR2ArtifactStore({bucket}),sha256:fakeSha});
  const input={executionJobId:'job-1',intentId:'intent-1',kind:'trace',contentType:'application/zip',bytes:new Uint8Array([9,9])};

  const first=await broker.put(input);
  const second=await broker.put(input);
  assert.equal(first.outcome,'CREATED');
  assert.equal(second.outcome,'REPLAY');
  assert.equal(puts,1);
});

test('artifact metadata mismatch on existing hash fails closed', async()=>{
  const bucket=fakeBucket();
  const store=createR2ArtifactStore({bucket});
  const broker=createArtifactBroker({store,sha256:fakeSha});
  await broker.put({executionJobId:'job-1',intentId:'intent-1',kind:'document',contentType:'application/pdf',bytes:new Uint8Array([1,2])});

  await assert.rejects(
    ()=>broker.put({executionJobId:'job-2',intentId:'intent-2',kind:'document',contentType:'text/plain',bytes:new Uint8Array([1,2])}),
    /ARTIFACT_HASH_METADATA_CONFLICT/,
  );
});

test('artifact size and content type policy are enforced before storage', async()=>{
  const bucket=fakeBucket();
  const broker=createArtifactBroker({
    store:createR2ArtifactStore({bucket}),
    sha256:fakeSha,
    maxBytes:3,
    allowedContentTypes:['application/pdf'],
  });

  await assert.rejects(
    ()=>broker.put({executionJobId:'j',intentId:'i',kind:'document',contentType:'application/pdf',bytes:new Uint8Array([1,2,3,4])}),
    /ARTIFACT_TOO_LARGE/,
  );
  await assert.rejects(
    ()=>broker.put({executionJobId:'j',intentId:'i',kind:'document',contentType:'text/html',bytes:new Uint8Array([1])}),
    /ARTIFACT_CONTENT_TYPE_REJECTED/,
  );
  assert.equal(bucket.objects.size,0);
});

test('R2 store records correlation and lineage metadata but never secret input', async()=>{
  const bucket=fakeBucket();
  const broker=createArtifactBroker({store:createR2ArtifactStore({bucket}),sha256:fakeSha});
  const result=await broker.put({
    executionJobId:'job-1',intentId:'intent-1',kind:'screenshot',contentType:'image/png',
    bytes:new Uint8Array([1]),sourceRefs:['artifact:source'],
    secret:'do-not-store',
  });
  const row=[...bucket.objects.values()][0];
  assert.equal(row.customMetadata.executionJobId,'job-1');
  assert.equal(row.customMetadata.intentId,'intent-1');
  assert.equal(JSON.stringify(row).includes('do-not-store'),false);
  assert.equal(JSON.stringify(result).includes('do-not-store'),false);
});


import { createR2ArtifactReader } from './artifact-broker.mjs';

test('R2 artifact reader verifies immutable PDF hash and source reference',async()=>{
  const bytes=new TextEncoder().encode('%PDF-1.4 synthetic');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const bucket={async get(key){
    assert.equal(key,'vaos-artifacts/sha256/'+digest);
    return {size:bytes.byteLength,httpMetadata:{contentType:'application/pdf'},
      customMetadata:{sha256:digest},arrayBuffer:async()=>bytes.buffer};
  }};
  const reader=createR2ArtifactReader({bucket});
  const out=await reader.read('r2:sha256:'+digest);
  assert.equal(out.sha256,digest);
  assert.equal(out.contentType,'application/pdf');
  assert.equal(new TextDecoder().decode(out.bytes),'%PDF-1.4 synthetic');
});
test('R2 artifact reader rejects tampered bytes and malformed references',async()=>{
  const bucket={async get(){return {size:9,httpMetadata:{contentType:'application/pdf'},
    arrayBuffer:async()=>new TextEncoder().encode('%PDF-FAKE').buffer}}};
  const reader=createR2ArtifactReader({bucket});
  await assert.rejects(()=>reader.read('https://evil.invalid/pdf'),/ARTIFACT_REFERENCE_INVALID/);
  await assert.rejects(()=>reader.read('r2:sha256:'+'a'.repeat(64)),/ARTIFACT_HASH_VERIFICATION_FAILED/);
});
