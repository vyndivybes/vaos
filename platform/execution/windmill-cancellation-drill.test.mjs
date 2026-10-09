import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindmillCancellationDrill} from './windmill-cancellation-drill.mjs';
function fakePersistence(){
  const data=new Map();let pending=Promise.resolve();
  const transaction=fn=>{
    const task=pending.then(async()=>{
      const changes=new Map();
      const tx={
        async get(k){return changes.has(k)?changes.get(k):data.get(k)},
        async put(k,v){changes.set(k,structuredClone(v))},
      };
      const result=await fn(tx);
      for(const [k,v] of changes)data.set(k,v);
      return result;
    });
    pending=task.catch(()=>{});
    return task;
  };
  return {transaction,async get(k){return data.get(k)},async put(k,v){data.set(k,structuredClone(v))}};
}

const p={runId:'37910000001',runAttempt:'1'},q={runId:'37910000002',runAttempt:'1'},job='019effff-aaaa-7bbb-8ccc-0123456789ab';
function setup(){const store=fakePersistence();let at=1000;return {create:()=>createWindmillCancellationDrill({store,setAlarm:async()=>{},now:()=>at}),expire:()=>{at+=60000;}};}
test('concurrent requests admit exactly one global isolated slot with no queued dispatch',async()=>{
 const f=setup();const r=await Promise.allSettled([f.create().start(p),f.create().start(q)]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(r.find(x=>x.status==='fulfilled').value.queuedRuns,0);
 assert.equal((await f.create().snapshot()).active.deadlineMs,61000);
});
test('a new instance preserves fence and unknown dispatch outcomes remain occupied after expiry',async()=>{
 const f=setup();await f.create().start(p);f.expire();await f.create().expire();
 assert.equal((await f.create().snapshot()).active.state,'QUARANTINED');
 await assert.rejects(f.create().start(q),{code:'WINDMILL_HOLD_SLOT_OCCUPIED'});
 await assert.rejects(f.create().bind({...p,providerJobId:job}),{code:'WINDMILL_HOLD_EXPIRED'});
});
test('running bind, one cancel permission, exact terminal readback releases and same run cannot replay',async()=>{
 const f=setup();await f.create().start(p);await f.create().bind({...p,providerJobId:job});
 await assert.rejects(f.create().cancel({...q,providerJobId:job}));
 await f.create().cancel({...p,providerJobId:job});await assert.rejects(f.create().cancel({...p,providerJobId:job}));
 await assert.rejects(f.create().finish({...p,providerJobId:job,canceled:false,success:false}));
 assert.equal((await f.create().finish({...p,providerJobId:job,canceled:true,success:false})).status,'RELEASED');
 await assert.rejects(f.create().start(p),{code:'WINDMILL_HOLD_REPLAY'});
 assert.equal((await f.create().snapshot()).auditCount,4);
});
