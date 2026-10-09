import test from 'node:test';
import assert from 'node:assert/strict';
import {createDifyExactRunVerifier} from './exact-run-verifier.mjs';

const SHA='7ca10821419f7fd315f8bae4f1591e7605dd282b';
const RUN='051bdeb7-b9f7-4354-bfbd-1dbc0e22b385';
const payload={provider:'activepieces',event_type:'synthetic_qualification',
  evidence_url:'https://github.com/vyndivybes/vaos/actions/runs/37928775640',
  commit_sha:SHA,run_id:'37928775640'};
const good={id:RUN,status:'succeeded',created_at:1791565692,
  inputs:{qualification_payload:JSON.stringify(payload)},
  outputs:{result:'Completed workflow; status PASS'}};
function verifier(body=good,options={}){
  return createDifyExactRunVerifier({env:{DIFY_API_KEY:'fake-test-key'},
    fetchImpl:async(url,init)=>{
      assert.equal(init.method,'GET');
      assert.equal(url,'https://api.dify.ai/v1/workflows/run/'+RUN);
      return Response.json(body);
    },...options});
}
test('exact persisted request identity and successful execution qualifies without trusting model PASS',async()=>{
 const r=await verifier().verifyExistingRun();
 assert.equal(r.status,'PASS');assert.equal(r.reason,'DIFY_EXACT_RUN_VERIFIED');
 assert.equal(r.runId,RUN);assert.equal(r.productionActivation,false);
 assert.equal(r.identityVerified,true);assert.equal(r.outputPresent,true);
 assert.ok(!JSON.stringify(r).includes('fake-test-key'));
 assert.ok(!JSON.stringify(r).includes('Completed workflow'));
});
test('success run with wrong GitHub evidence stays HOLD',async()=>{
 const r=await verifier({...good,inputs:{qualification_payload:JSON.stringify({...payload,run_id:'wrong'})}}).verifyExistingRun();
 assert.equal(r.status,'HOLD');assert.equal(r.reason,'DIFY_INPUT_IDENTITY_MISMATCH');
});
test('success run with no evidence-bearing input stays HOLD',async()=>{
 const r=await verifier({...good,inputs:{}}).verifyExistingRun();
 assert.equal(r.status,'HOLD');
});
test('Dify status failed cannot pass',async()=>{
 const r=await verifier({...good,status:'failed'}).verifyExistingRun();
 assert.equal(r.status,'HOLD');
});
test('missing structured output cannot pass',async()=>{
 const r=await verifier({...good,outputs:{}}).verifyExistingRun();
 assert.equal(r.status,'HOLD');
});
test('mismatched Dify run ID cannot pass',async()=>{
 const r=await verifier({...good,id:'another-run'}).verifyExistingRun();
 assert.equal(r.status,'HOLD');
});
test('no API key fails before outbound request',async()=>{
 const r=await createDifyExactRunVerifier({env:{},fetchImpl:()=>{throw Error('unexpected outbound')}}).verifyExistingRun();
 assert.equal(r.status,'HOLD');
});
test('HTTP denial fails without reflecting provider message',async()=>{
 const r=await createDifyExactRunVerifier({env:{DIFY_API_KEY:'fake-test-key'},
 fetchImpl:async()=>new Response('secret private provider message',{status:401})}).verifyExistingRun();
 assert.equal(r.status,'HOLD');assert.equal(r.httpStatus,401);
 assert.equal(JSON.stringify(r).includes('secret private'),false);
});
