import test from 'node:test';
import assert from 'node:assert/strict';
import {createDifyLiveQualificationHandler} from './dify-live-qualification.mjs';
const handler=createDifyLiveQualificationHandler({createClient:()=>({qualify:async()=>({status:'HOLD',reason:'INDEPENDENT_VERIFICATION_REQUIRED',difyRunId:'test'})})});
function req(method='POST',headers={},body={confirm:'run-synthetic-dify-once'}){return {method,url:'https://vaos.vayushastr.workers.dev/api/dify-live-qualification',headers,body,env:{}}}
test('rejects unauthenticated live invocation',async()=>{const r=await handler(req('POST',{origin:'https://vaos.vayushastr.workers.dev','content-type':'application/json'}));assert.equal(r.status,403)});
test('rejects GET before any outbound request',async()=>{const r=await handler(req('GET'));assert.equal(r.status,405)});
