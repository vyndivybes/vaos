import test from 'node:test';
import assert from 'node:assert/strict';
import {createDifyRunHistoryClient} from './run-history.mjs';
const env={DIFY_API_KEY:'test-secret'};
test('history readback uses GET and returns only incident metadata, not outputs or secrets',async()=>{
  const client=createDifyRunHistoryClient({env,fetchImpl:async(url,opts)=>{
    assert.equal(opts.method,'GET');
    assert.match(url,/created_at__after=/);
    return Response.json({has_more:false,data:[{id:'log-1',created_at:1791565703,
      details:{secret:'should never show'},workflow_run:{id:'run-1',status:'succeeded',outputs:{result:'private'}}}]});
  }});
  const result=await client.readIncident();
  assert.equal(result.reason,'INCIDENT_RUN_CANDIDATES_FOUND');
  assert.equal(result.completeReadback,true);
  assert.equal(result.runCandidates[0].runId,'run-1');
  assert.equal(JSON.stringify(result).includes('private'),false);
  assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('history empty window stays HOLD not PASS and never enables routing',async()=>{
  const client=createDifyRunHistoryClient({env,fetchImpl:async()=>Response.json({has_more:false,data:[]})});
  const result=await client.readIncident();
  assert.equal(result.status,'HOLD');assert.equal(result.reason,'NO_INCIDENT_RUN_OBSERVED');
  assert.equal(result.productionActivation,false);
});
test('non-200 auth failures are HOLD and do not echo response bodies',async()=>{
  const client=createDifyRunHistoryClient({env,fetchImpl:async()=>new Response('sensitive',{status:401})});
  const result=await client.readIncident();
  assert.equal(result.reason,'DIFY_LOG_HTTP_ERROR');
  assert.equal(result.httpStatus,401);
  assert.equal(JSON.stringify(result).includes('sensitive'),false);
});
test('incomplete pagination never appears conclusive',async()=>{
  const client=createDifyRunHistoryClient({env,fetchImpl:async()=>Response.json({has_more:true,data:[]})});
  assert.equal((await client.readIncident()).reason,'DIFY_LOG_PAGINATION_INCOMPLETE');
});
