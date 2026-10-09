import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken} from '../lib/auth.mjs';
import {createDifyExactVerificationHandler} from './dify-exact-verification.mjs';
let calls=0;
const handler=createDifyExactVerificationHandler({createVerifier:()=>({verifyExistingRun:async()=>{calls++;return {status:'PASS',reason:'DIFY_EXACT_RUN_VERIFIED',productionActivation:false}}})});
const base={method:'GET',url:'https://vaos.vayushastr.workers.dev/api/dify-exact-verification',env:{},headers:{origin:'https://vaos.vayushastr.workers.dev'}};
test('unauthenticated run detail never contacts upstream',async()=>{
 calls=0;assert.equal((await handler(base)).status,403);assert.equal(calls,0);
});
test('maker session and matching origin unlock read-only qualification',async()=>{
 calls=0;const req={...base,headers:{...base.headers,cookie:'vaos_session='+createSessionToken('shyamsundhar1982@gmail.com')}};
 const response=await handler(req);assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.reason,'DIFY_EXACT_RUN_VERIFIED');
 assert.equal(body.productionActivation,false);assert.equal(calls,1);
});
test('wrong origin fails without touching Dify',async()=>{
 calls=0;const req={...base,headers:{cookie:'vaos_session='+createSessionToken('shyamsundhar1982@gmail.com')}};
 assert.equal((await handler(req)).status,403);assert.equal(calls,0);
});
test('POST never repeats Dify workflow or invokes run detail',async()=>{
 calls=0;assert.equal((await handler({...base,method:'POST'})).status,405);assert.equal(calls,0);
});
