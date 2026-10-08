import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindmillExecutionSupervisor } from './execution-supervisor.mjs';

const runId='019effff-aaaa-7bbb-8ccc-0123456789ab';
const granted={status:'GRANTED',epoch:7,deadlineMs:1000};
function fixture(){
  const log=[];
  const ledger={
    async reserve(v){log.push('reserve');return granted;},
    async beginDispatch(){log.push('begin');},
    async recordProviderRun(){log.push('record');},
    async finish(v){log.push('finish:'+v.terminalState);},
    async requestCancellation(){log.push('cancel-request');return {state:'CANCEL_PENDING'};},
  };
  const transport={
    async runScript(){log.push('POST');return {status:201,body:runId};},
    async waitForJob(){log.push('GET');return {id:runId,script_path:'f/vaos/qualification_ping',success:true,result:{qualification:'VAOS_WINDMILL_SYNTHETIC_V1',challenge:'ab'.repeat(16)}};},
  };
  return {log,ledger,transport};
}
const input={jobId:'synthetic-test',challenge:'ab'.repeat(16),approvedAction:true};
test('durably fences admission before exactly one POST and releases after verified result',async()=>{
  const f=fixture();
  const s=createWindmillExecutionSupervisor({ledger:f.ledger,transport:f.transport});
  assert.equal((await s.execute(input)).status,'SUCCEEDED_VERIFIED');
  assert.deepEqual(f.log,['reserve','begin','POST','record','GET','finish:SUCCEEDED']);
});
test('blocked admission never dispatches',async()=>{
  const f=fixture(); f.ledger.reserve=async()=>({status:'BLOCKED'});
  const r=await createWindmillExecutionSupervisor({ledger:f.ledger,transport:f.transport}).execute(input);
  assert.equal(r.status,'BLOCKED');
  assert.equal(f.log.length,0);
});
test('ambiguous dispatch is never repeated or released',async()=>{
  const f=fixture();let posts=0;
  f.transport.runScript=async()=>{posts++;throw new Error('timeout');};
  await assert.rejects(createWindmillExecutionSupervisor({ledger:f.ledger,transport:f.transport}).execute(input));
  assert.equal(posts,1);
  assert.deepEqual(f.log,['reserve','begin']);
});
test('readback timeout preserves occupied ledger slot for recovery',async()=>{
  const f=fixture();
  f.transport.waitForJob=async()=>{f.log.push('GET');throw new Error('readback timeout');};
  await assert.rejects(createWindmillExecutionSupervisor({ledger:f.ledger,transport:f.transport}).execute(input));
  assert.deepEqual(f.log,['reserve','begin','POST','record','GET']);
});
test('cancellation is only closed after controller proves readback',async()=>{
  const f=fixture();
  const s=createWindmillExecutionSupervisor({ledger:f.ledger,transport:f.transport,cancellationController:{
    async cancelAndVerify(){f.log.push('cancel-proved');return {status:'CANCELLED_VERIFIED',providerRunId:runId};},
  }});
  const r=await s.cancelVerified({jobId:'synthetic-test',epoch:7,providerRunId:runId,authorizationRef:'qualification:operator-approved',token:'c',readToken:'r',evidenceRef:'github-actions:999'});
  assert.equal(r.status,'CANCELLED_VERIFIED');
  assert.deepEqual(f.log,['cancel-request','cancel-proved','finish:CANCELLED']);
});
test('cancellation uncertainty never releases slot',async()=>{
  const f=fixture();
  const s=createWindmillExecutionSupervisor({ledger:f.ledger,transport:f.transport,cancellationController:{
    async cancelAndVerify(){throw new Error('not terminal');},
  }});
  await assert.rejects(s.cancelVerified({jobId:'synthetic-test',epoch:7,providerRunId:runId,authorizationRef:'qualification:operator-approved',token:'c',readToken:'r',evidenceRef:'github-actions:999'}));
  assert.deepEqual(f.log,['cancel-request']);
});
