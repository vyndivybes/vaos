import test from 'node:test';
import assert from 'node:assert/strict';
import {loadApprovedGraphSnapshot} from './snapshot-reader.mjs';
const source='graphify';
const doc=JSON.stringify({schemaVersion:'VAOS_NEUTRAL_GRAPH_SOURCE_V1',sourceType:source,sourceRevision:'a'.repeat(40),observedAt:'2026-11-03T07:00:00Z',payload:{nodes:[{id:'x',type:'project',title:'Frame'}],edges:[]}});
async function digest(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
test('approved SHA-256 R2 graph snapshot is loaded from fixed key only',async()=>{
 const expected=await digest(doc);let key;
 const env={VAOS_ARTIFACTS:{async get(k){key=k;return{size:doc.length,text:async()=>doc}}},VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES:JSON.stringify({graphify:expected})};
 const result=await loadApprovedGraphSnapshot({env,sourceType:source});
 assert.equal(key,'knowledge/neutral-v1/graphify.json');
 assert.equal(result.integrityVerified,true);
 assert.equal(result.snapshot.sourceType,source);
});
test('unconfigured, mismatched, oversized and invalid R2 snapshots fail closed',async()=>{
 let touched=false;
 const bucket={async get(){touched=true;return{size:doc.length,text:async()=>doc}}};
 await assert.rejects(()=>loadApprovedGraphSnapshot({env:{VAOS_ARTIFACTS:bucket},sourceType:'graphify'}),/SNAPSHOT_NOT_COMMISSIONED/);
 assert.equal(touched,false);
 const configured={VAOS_ARTIFACTS:bucket,VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES:JSON.stringify({graphify:'b'.repeat(64)})};
 await assert.rejects(()=>loadApprovedGraphSnapshot({env:configured,sourceType:'graphify'}),/SNAPSHOT_INTEGRITY_HOLD/);
 const oversized={VAOS_ARTIFACTS:{async get(){return{size:900000,text:async()=>{throw Error('should not download')}}}},VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES:JSON.stringify({graphify:'b'.repeat(64)})};
 await assert.rejects(()=>loadApprovedGraphSnapshot({env:oversized,sourceType:'graphify'}),/SNAPSHOT_SIZE_DENIED/);
 await assert.rejects(()=>loadApprovedGraphSnapshot({env:configured,sourceType:'unexpected'}),/SNAPSHOT_SOURCE_DENIED/);
});

test('an approved snapshot hash in the existing free-tier feature bundle admits exact R2 bytes',async()=>{
 const approved=await digest(doc);
 const env={VAOS_FEATURE_FLAGS:JSON.stringify({VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES:JSON.stringify({graphify:approved})}),
  VAOS_ARTIFACTS:{async get(){return{size:new TextEncoder().encode(doc).length,text:async()=>doc}}}};
 const result=await loadApprovedGraphSnapshot({env,sourceType:'graphify'});
 assert.equal(result.integrityVerified,true);
 assert.equal(result.snapshot.payload.nodes[0].id,'x');
});
test('invalid hash bundle and mismatched bytes remain HOLD with no fallback to unknown configuration',async()=>{
 const bucket={async get(){return{size:new TextEncoder().encode(doc).length,text:async()=>doc}}};
 await assert.rejects(()=>loadApprovedGraphSnapshot({env:{VAOS_FEATURE_FLAGS:'{invalid',VAOS_ARTIFACTS:bucket},sourceType:'graphify'}),/NOT_COMMISSIONED/);
 await assert.rejects(()=>loadApprovedGraphSnapshot({env:{VAOS_FEATURE_FLAGS:JSON.stringify({VAOS_NEURAL_GRAPH_SNAPSHOT_HASHES:JSON.stringify({graphify:'a'.repeat(64)})}),VAOS_ARTIFACTS:bucket},sourceType:'graphify'}),/SNAPSHOT_INTEGRITY_HOLD/);
});
