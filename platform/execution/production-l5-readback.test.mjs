import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyProductionWipReadback} from './production-l5-readback.mjs';
const job={actionType:'PRODUCTION.OBSERVE_WIP',id:'job',intentId:'intent',payload:{limit:50}};
const observed={actionType:job.actionType,nonce:'nonce1',sourceAuthority:'getProductionJobCards',data:{records:[{id:'J1',status:'released'}]}};
test('two separately signed identical source reads yield SHA-256 evidence',async()=>{
 const result=await verifyProductionWipReadback({job,observed,bridge:{async execute(){return {...observed,nonce:'nonce2'}}}});
 assert.match(result.sourceContentSha256,/^[0-9a-f]{64}$/);
 assert.equal(result.observedRows,1);assert.equal(result.method,'TWO_SIGNED_SOURCE_READS');
});
test('mismatch fails closed',async()=>{
 await assert.rejects(()=>verifyProductionWipReadback({job,observed,bridge:{async execute(){return {...observed,nonce:'nonce2',data:{records:[]}}}}}),/PRODUCTION_READBACK_CONTENT_MISMATCH/);
});
test('identical nonce fails independent-check gate',async()=>{
 await assert.rejects(()=>verifyProductionWipReadback({job,observed,bridge:{async execute(){return observed}}}),/PRODUCTION_READBACK_INDEPENDENCE_INVALID/);
});
test('wrong capability fails before external read',async()=>{
 let calls=0;
 await assert.rejects(()=>verifyProductionWipReadback({job:{...job,actionType:'PRODUCTION.RELEASE_JOB'},observed,bridge:{async execute(){calls++}}}),/PRODUCTION_READBACK_SOURCE_INVALID/);
 assert.equal(calls,0);
});
