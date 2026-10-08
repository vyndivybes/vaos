import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaperworkFileBridge } from './file-bridge.mjs';

test('Paperwork file bridge registers governed artifact bytes, uploads once, and verifies ready file',async()=>{
  const calls=[];
  const bridge=createPaperworkFileBridge({
    artifactReader:{async read(ref){assert.equal(ref,'r2:sha256:abc');return{bytes:new Uint8Array([1,2,3]),sha256:'abc',contentType:'application/pdf',fileName:'quote.pdf'}}},
    credentialPort:{async withToken(fn){return fn('paperwork-token')}},
    transport:{
      async createFile(req){calls.push({op:'create',req});return{id:'file-1',uploadUrl:'https://upload.example/one'}},
      async uploadBytes(req){calls.push({op:'upload',req});return{status:200}},
      async readFile(req){calls.push({op:'read',req});return{id:'file-1',status:'ready',name:'quote.pdf',mimeType:'application/pdf'}},
    },
  });
  const result=await bridge.ensureFile({artifactRef:'r2:sha256:abc',executionJobId:'job-1',intentId:'intent-1'});
  assert.equal(result.fileId,'file-1');
  assert.equal(result.sourceSha256,'abc');
  assert.equal(calls[0].req.body.mimeType,'application/pdf');
  assert.equal(calls[1].req.url,'https://upload.example/one');
  assert.equal(calls[1].req.contentType,'application/pdf');
  assert.equal(JSON.stringify(result).includes('paperwork-token'),false);
});

test('bridge caches artifact-to-file mapping and does not upload same artifact twice',async()=>{
  let creates=0,uploads=0;
  const bridge=createPaperworkFileBridge({
    artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf',fileName:'a.pdf'}}},
    credentialPort:{async withToken(fn){return fn('token')}},
    transport:{
      async createFile(){creates++;return{id:'file-1',uploadUrl:'https://upload.example/one'}},
      async uploadBytes(){uploads++;return{status:200}},
      async readFile(){return{id:'file-1',status:'ready',mimeType:'application/pdf'}},
    },
  });
  const a=await bridge.ensureFile({artifactRef:'r2:sha256:abc',executionJobId:'j1',intentId:'i1'});
  const b=await bridge.ensureFile({artifactRef:'r2:sha256:abc',executionJobId:'j2',intentId:'i2'});
  assert.equal(a.fileId,b.fileId);
  assert.equal(creates,1);
  assert.equal(uploads,1);
});

test('upload URL is treated as ephemeral secret-like transport data and never returned',async()=>{
  const bridge=createPaperworkFileBridge({
    artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf',fileName:'a.pdf'}}},
    credentialPort:{async withToken(fn){return fn('token')}},
    transport:{
      async createFile(){return{id:'file-1',uploadUrl:'https://upload.example/secret-signed-url'}},
      async uploadBytes(){return{status:200}},
      async readFile(){return{id:'file-1',status:'ready',mimeType:'application/pdf'}},
    },
  });
  const r=await bridge.ensureFile({artifactRef:'r2:sha256:abc',executionJobId:'j',intentId:'i'});
  assert.equal(JSON.stringify(r).includes('secret-signed-url'),false);
});

test('file not ready remains reconcilable and does not re-register artifact',async()=>{
  let creates=0;
  const bridge=createPaperworkFileBridge({
    artifactReader:{async read(){return{bytes:new Uint8Array([1]),sha256:'abc',contentType:'application/pdf',fileName:'a.pdf'}}},
    credentialPort:{async withToken(fn){return fn('token')}},
    transport:{
      async createFile(){creates++;return{id:'file-1',uploadUrl:'https://upload.example/one'}},
      async uploadBytes(){return{status:200}},
      async readFile(){return{id:'file-1',status:'processing'}},
    },
  });
  await assert.rejects(async()=>{try{await bridge.ensureFile({artifactRef:'r2:sha256:abc',executionJobId:'j',intentId:'i'})}catch(e){assert.equal(e.code,'PAPERWORK_FILE_NOT_READY');assert.equal(e.providerRunId,'file-1');throw e}},/PAPERWORK_FILE_NOT_READY/);
  assert.equal(creates,1);
});
