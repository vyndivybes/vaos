import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindmillIsolatedDrill, recordWindmillAlarmReceipt} from './windmill-isolated-drill.mjs';
import {createWindmillDurableLedger} from '../../integrations/windmill/durable-ledger.mjs';

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
const RUN='37860012345';
function setup(){
  const clock={ms:Date.parse('2026-10-09T00:00:00Z')};
  const store=fakePersistence();const alarms=[];
  const create=()=>createWindmillIsolatedDrill({
    store,now:()=>clock.ms,setAlarm:async at=>{alarms.push(at)},
  });
  return {clock,store,alarms,create};
}
test('isolated Durable Object admits exactly one and records durable audit without dispatching anything',async()=>{
  const f=setup();
  const result=await f.create().start(RUN);
  assert.equal(result.status,'STARTED');
  assert.equal(result.admission,'PASS');
  assert.equal(result.blockedCompetingJob,true);
  assert.equal(result.productionActivation,false);
  assert.equal(result.windmillCalls,0);
  assert.equal(result.auditCount,2);
  assert.equal(f.alarms.length,1);
});
test('new helper instance after restart reads actual persisted state and quarantines expired slot',async()=>{
  const f=setup();
  await f.create().start(RUN);
  f.clock.ms+=1500;
  const ledger=createWindmillDurableLedger({store:f.store,now:()=>f.clock.ms});
  const outcome=await ledger.expire();
  await recordWindmillAlarmReceipt({store:f.store,runId:RUN,outcome,now:()=>f.clock.ms});
  const result=await f.create().finish(RUN);
  assert.equal(result.status,'PASS');
  assert.equal(result.persistedAcrossRequests,true);
  assert.equal(result.blockedWhileQuarantined,true);
  assert.equal(result.quarantined,true);
  assert.equal(result.alarmObserved,true);
  assert.equal(result.auditCount,3);
  assert.equal(result.productionActivation,false);
  assert.equal(result.windmillCalls,0);
});
test('replay, finish-before-start, wrong run and early timeout all fail closed',async()=>{
  const f=setup();
  await assert.rejects(f.create().finish(RUN));
  await f.create().start(RUN);
  await assert.rejects(f.create().start(RUN));
  await assert.rejects(f.create().finish('37860012346'));
  await assert.rejects(f.create().finish(RUN));
});
test('no release occurs even after successful drill: quarantined state remains fail-closed',async()=>{
  const f=setup();
  await f.create().start(RUN);f.clock.ms+=1100;
  const ledger=createWindmillDurableLedger({store:f.store,now:()=>f.clock.ms});
  const outcome=await ledger.expire();
  await recordWindmillAlarmReceipt({store:f.store,runId:RUN,outcome,now:()=>f.clock.ms});
  await f.create().finish(RUN);
  const status=await f.create().snapshot();
  assert.equal(status.active.state,'QUARANTINED');
  assert.equal(status.failClosed,true);
  assert.equal(status.productionActivation,false);
});

test('timed-out slot without real alarm callback evidence cannot pass',async()=>{
  const f=setup();
  await f.create().start(RUN);f.clock.ms+=1500;
  await assert.rejects(f.create().finish(RUN),{code:'WINDMILL_ISOLATED_DRILL_ALARM_NOT_OBSERVED'});
  const status=await f.create().alarmStatus(RUN);
  assert.equal(status.alarmObserved,false);
});
test('forged alarm metadata cannot bypass durable quarantined state',async()=>{
  const f=setup();
  await f.create().start(RUN);f.clock.ms+=1500;
  await f.store.put('drill:alarm',{runId:RUN,epoch:1,quarantined:true,observedAtMs:f.clock.ms});
  await assert.rejects(f.create().finish(RUN),{code:'WINDMILL_ISOLATED_DRILL_ALARM_NOT_OBSERVED'});
});
test('alarm callback metadata only recorded for valid quarantined slot',async()=>{
  const f=setup();
  await assert.rejects(recordWindmillAlarmReceipt({store:f.store,runId:RUN,outcome:{quarantined:true},now:()=>f.clock.ms}));
  await f.create().start(RUN);
  await assert.rejects(recordWindmillAlarmReceipt({store:f.store,runId:RUN,outcome:{quarantined:false},now:()=>f.clock.ms}));
  const status=await f.create().alarmStatus(RUN);
  assert.equal(status.alarmObserved,false);
});
