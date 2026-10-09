import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindmillDurableLedger } from '../../integrations/windmill/durable-ledger.mjs';
import { createWindmillRestartDrill } from './windmill-restart-drill.mjs';

function store() {
  const data=new Map();
  let queue=Promise.resolve();
  const transaction=fn=>{
    const result=queue.then(async()=>{
      const changes=new Map();
      const tx={
        async get(k){return changes.has(k)?changes.get(k):data.get(k);},
        async put(k,v){changes.set(k,structuredClone(v));},
      };
      const value=await fn(tx);
      for(const [k,v] of changes)data.set(k,v);
      return value;
    });
    queue=result.catch(()=>{});
    return result;
  };
  return {transaction,async sync(){},async get(k){return data.get(k);},async put(k,v){data.set(k,structuredClone(v));}};
}
const RUN='37860000001';
const permit=jobId=>({jobId,scriptPath:'f/vaos/qualification_ping',
  authorityRef:'qualification:manual-approved',approvedAction:true,
  productionEnabled:false,maxRuntimeSeconds:1});
async function started(){
  const storage=store(),now=Date.now();
  const l=createWindmillDurableLedger({store:storage,now:()=>now});
  const jobId='drill-'+RUN+'-a';
  const grant=await l.reserve(permit(jobId));
  await l.beginDispatch({jobId,epoch:grant.epoch});
  await storage.put('drill:start',{runId:RUN,jobId,epoch:grant.epoch,deadlineMs:now-10});
  // Real Cloudflare live setup uses an alarm receipt written by alarm().
  // Simulate the prerequisite in the test, not the restart itself.
  const timed=createWindmillDurableLedger({store:storage,now:()=>now+2000});
  await timed.expire();
  await storage.put('drill:alarm',{runId:RUN,epoch:grant.epoch,
    quarantined:true,observedAtMs:now+2000});
  return {storage,jobId,grant,now};
}
test('forced restart writes pre-abort checkpoint and invokes Cloudflare context abort once',async()=>{
  const f=await started();
  const drill=createWindmillRestartDrill({store:f.storage,now:()=>f.now+2000});
  let count=0;
  await assert.rejects(drill.begin({runId:RUN,instanceId:'instance-1',abort:()=>{
    count++;throw new Error('CF_RESET_EXPECTED');
  }}),/CF_RESET_EXPECTED/);
  assert.equal(count,1);
  const record=await f.storage.get('restart:before');
  assert.equal(record.runId,RUN);
  assert.equal(record.instanceId,'instance-1');
  assert.equal(record.jobId,f.jobId);
  assert.equal(record.epoch,f.grant.epoch);
});
test('new Durable Object constructor instance proves original fenced lease survived abort',async()=>{
  const f=await started();
  const drill=createWindmillRestartDrill({store:f.storage,now:()=>f.now+2000});
  await assert.rejects(drill.begin({runId:RUN,instanceId:'instance-1',abort:()=>{
    throw new Error('CF_RESET_EXPECTED');
  }}));
  const original=await drill.observe({runId:RUN,instanceId:'instance-1'});
  assert.equal(original.status,'WAITING');
  const next=createWindmillRestartDrill({store:f.storage,now:()=>f.now+3000});
  const observed=await next.observe({runId:RUN,instanceId:'instance-2'});
  assert.equal(observed.status,'RESTART_VERIFIED');
  assert.equal(observed.sameDurableObject,true);
  assert.equal(observed.previouslyReservedSlotStillBlocked,true);
  assert.equal(observed.instanceChanged,true);
  assert.equal(observed.providerDispatchCount,0);
  assert.equal(observed.windmillCalls,0);
  assert.equal((await next.observe({runId:RUN,instanceId:'instance-3'})).status,'RESTART_VERIFIED');
});
test('abort waits for the checkpoint to be committed and refuses a failed flush',async()=>{
  const f=await started();
  let commit;
  const flushed=new Promise(resolve=>{commit=resolve;});
  let syncStarted=false,aborted=false;
  f.storage.sync=async()=>{syncStarted=true;await flushed;};
  const drill=createWindmillRestartDrill({store:f.storage,now:()=>f.now+2000});
  const pending=assert.rejects(drill.begin({runId:RUN,instanceId:'instance-1',abort:()=>{
    aborted=true;throw new Error('CF_RESET_EXPECTED');
  }}),/CF_RESET_EXPECTED/);
  for(let n=0;n<30&&!syncStarted;n++)await Promise.resolve();
  assert.equal(syncStarted,true);
  assert.equal(aborted,false);
  commit();await pending;
  assert.equal(aborted,true);
  const g=await started();
  g.storage.sync=async()=>{throw new Error('COMMIT_FAILED');};
  let failedAbort=false;
  await assert.rejects(createWindmillRestartDrill({store:g.storage}).begin({
    runId:RUN,instanceId:'instance-1',abort:()=>{failedAbort=true;},
  }),/COMMIT_FAILED/);
  assert.equal(failedAbort,false);
});
test('invalid start, missing alarm, same-instance nonce and wrong run fail closed',async()=>{
  const f=await started();
  const drill=createWindmillRestartDrill({store:f.storage,now:()=>f.now+2000});
  await assert.rejects(drill.observe({runId:RUN,instanceId:'instance-2'}));
  await assert.rejects(drill.begin({runId:'another',instanceId:'instance-1',abort:()=>{}}));
  await f.storage.put('drill:alarm',null);
  await assert.rejects(drill.begin({runId:RUN,instanceId:'instance-1',abort:()=>{}}));
});
test('real production coordinator has no drill checkpoint, therefore cannot be aborted',async()=>{
  const storage=store();
  const drill=createWindmillRestartDrill({store:storage});
  let invoked=false;
  await assert.rejects(drill.begin({runId:RUN,instanceId:'instance-1',
    abort:()=>{invoked=true;}}));
  assert.equal(invoked,false);
});

