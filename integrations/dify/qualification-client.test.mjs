import test from 'node:test';
import assert from 'node:assert/strict';
import {createDifyQualificationClient} from './qualification-client.mjs';

const payload={provider:'activepieces',event_type:'synthetic_qualification',evidence_url:'https://github.com/vyndivybes/vaos/actions/runs/37918328806',commit_sha:'381b41493b5b103b1cc48715abda0de4e44ec7cd',run_id:'37918328806'};
const success={data:{outputs:{result:'status: PASS'}},workflow_run_id:'dify-run-1'};
function client(fetchImpl,env={DIFY_API_KEY:'test-secret'}){return createDifyQualificationClient({fetchImpl,env});}
test('fails closed when secret is absent',async()=>{const x=await client(()=>{throw Error('must not fetch')},{}).qualify(payload);assert.equal(x.status,'HOLD');assert.equal(x.reason,'DIFY_NOT_CONFIGURED')});
test('rejects non-success HTTP response without leaking credentials',async()=>{const x=await client(async()=>new Response('unauthorized',{status:401})).qualify(payload);assert.equal(x.status,'HOLD');assert.equal(x.reason,'DIFY_HTTP_ERROR')});
test('rejects invalid provider response',async()=>{const x=await client(async()=>new Response('{',{status:200})).qualify(payload);assert.equal(x.status,'HOLD')});
test('does not treat unverified model PASS as qualified',async()=>{const x=await client(async()=>Response.json(success)).qualify(payload);assert.equal(x.status,'HOLD');assert.equal(x.reason,'INDEPENDENT_VERIFICATION_REQUIRED');assert.equal(x.difyRunId,'dify-run-1')});
test('rejects missing payload fields',async()=>{const x=await client(()=>{throw Error('must not fetch')}).qualify({provider:'activepieces'});assert.equal(x.status,'HOLD');assert.equal(x.reason,'INVALID_PAYLOAD')});
test('does not send secrets in response',async()=>{const x=await client(async()=>Response.json(success)).qualify(payload);assert.equal(JSON.stringify(x).includes('test-secret'),false)});
