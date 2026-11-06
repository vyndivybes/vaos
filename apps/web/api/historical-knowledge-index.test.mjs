import test from 'node:test';
import assert from 'node:assert/strict';
import {sealRecord,openRecord,advanceCheckpoint,validateSyncRequest} from './historical-knowledge-index.mjs';

test('records use authenticated encryption',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const row={source:'gmail',id:'sample-1',text:'fixture text'};
 const sealed=await sealRecord(row,key);
 assert.notEqual(JSON.stringify(sealed).includes(row.text),true);
 assert.deepEqual(await openRecord(sealed,key),row);
});
test('checkpoint remains partial until pagination ends',()=>{
 const first=advanceCheckpoint(null,{source:'gmail',count:2,next:'more'});
 assert.equal(first.state,'PARTIAL');
 const last=advanceCheckpoint(first,{source:'gmail',count:1,next:null});
 assert.equal(last.state,'LISTING_COMPLETE');
 assert.equal(last.contentComplete,false);
});
test('sync request only accepts named source',()=>{
 assert.deepEqual(validateSyncRequest({source:'drive'}),{source:'drive'});
 assert.throws(()=>validateSyncRequest({source:'gmail',url:'any'}));
 assert.throws(()=>validateSyncRequest({source:'unknown'}));
});
