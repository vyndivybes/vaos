import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindmillDurableLedger } from './durable-ledger.mjs';

function persistence() {
  const data = new Map();
  let queue = Promise.resolve();
  return {
    transaction: fn => {
      const run = queue.then(async () => {
        const pending = new Map();
        const tx = {
          async get(key) { return pending.has(key) ? pending.get(key) : data.get(key); },
          async put(key, value) { pending.set(key, structuredClone(value)); },
        };
        const result = await fn(tx);
        for (const [key,value] of pending) data.set(key,value);
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
const permit = (jobId='synthetic-a') => ({
  jobId, scriptPath:'f/vaos/qualification_ping',
  authorityRef:'qualification:manual-approved', approvedAction:true,
  maxRuntimeSeconds:60, productionEnabled:false,
});
const context = (persist = persistence(), when = {at:Date.parse('2026-10-09T00:00:00Z')}) =>
  ({persist,when,ledger:createWindmillDurableLedger({store:persist,now:()=>when.at})});
test('atomic global single-slot admission rejects simultaneous different executions', async()=>{
  const {ledger}=context();
  const r=await Promise.all([ledger.reserve(permit('a')),ledger.reserve(permit('b'))]);
  assert.equal(r.filter(x=>x.status==='GRANTED').length,1);
  assert.equal(r.filter(x=>x.status==='BLOCKED').length,1);
  assert.equal((await ledger.snapshot()).maxConcurrentRuns,1);
  assert.equal((await ledger.snapshot()).queuedRuns,0);
});
test('duplicate replay cannot gain a second dispatch grant',async()=>{
  const {ledger}=context();
  const first=await ledger.reserve(permit());
  const replay=await ledger.reserve(permit());
  assert.equal(first.status,'GRANTED');
  assert.equal(replay.status,'ALREADY_RESERVED');
  assert.equal(replay.epoch,first.epoch);
});
test('ledger survives process restart and refuses a second job',async()=>{
  const {persist,when,ledger}=context();
  const first=await ledger.reserve(permit());
  const restarted=createWindmillDurableLedger({store:persist,now:()=>when.at});
  assert.equal((await restarted.reserve(permit('other'))).status,'BLOCKED');
  await restarted.beginDispatch({jobId:'synthetic-a',epoch:first.epoch});
  await restarted.recordProviderRun({jobId:'synthetic-a',epoch:first.epoch,providerRunId:'019effff-aaaa-7bbb-8ccc-0123456789ab'});
  assert.equal((await restarted.snapshot()).active.state,'RUNNING');
});
test('timeout quarantines in-flight dispatch; does not release or automatically retry',async()=>{
  const {ledger,when}=context();
  const granted=await ledger.reserve(permit());
  await ledger.beginDispatch({jobId:'synthetic-a',epoch:granted.epoch});
  when.at+=61000;
  const expired=await ledger.expire();
  assert.equal(expired.active.state,'QUARANTINED');
  assert.equal((await ledger.reserve(permit('another'))).status,'BLOCKED');
  assert.equal((await ledger.snapshot()).active.state,'QUARANTINED');
});
test('only independently verified terminal readback releases occupied slot',async()=>{
  const {ledger}=context();
  const granted=await ledger.reserve(permit());
  await ledger.beginDispatch({jobId:'synthetic-a',epoch:granted.epoch});
  const providerRunId='019effff-aaaa-7bbb-8ccc-0123456789ab';
  await ledger.recordProviderRun({jobId:'synthetic-a',epoch:granted.epoch,providerRunId});
  await assert.rejects(ledger.finish({
    jobId:'synthetic-a',epoch:granted.epoch,providerRunId,verified:false,
    evidenceRef:'github-actions:123',terminalState:'SUCCEEDED',
  }));
  assert.equal((await ledger.snapshot()).active.state,'RUNNING');
  await ledger.finish({
    jobId:'synthetic-a',epoch:granted.epoch,providerRunId,verified:true,
    verificationSource:'windmill.api.job-readback',evidenceRef:'github-actions:123',
    terminalState:'SUCCEEDED',
  });
  assert.equal((await ledger.snapshot()).active,null);
  assert.equal((await ledger.reserve(permit('another'))).status,'GRANTED');
});
test('fencing token rejects stale completion or duplicate provider dispatch',async()=>{
  const {ledger}=context();
  const a=await ledger.reserve(permit());
  await assert.rejects(ledger.beginDispatch({jobId:'synthetic-a',epoch:a.epoch+1}));
  await ledger.beginDispatch({jobId:'synthetic-a',epoch:a.epoch});
  await assert.rejects(ledger.beginDispatch({jobId:'synthetic-a',epoch:a.epoch}));
  await assert.rejects(ledger.recordProviderRun({jobId:'synthetic-a',epoch:a.epoch+1,providerRunId:'wrong'}));
});
test('cancellation requires provider ID and independent terminal evidence before releasing',async()=>{
  const {ledger}=context();
  const a=await ledger.reserve(permit());
  await assert.rejects(ledger.requestCancellation({jobId:'synthetic-a',epoch:a.epoch}));
  await ledger.beginDispatch({jobId:'synthetic-a',epoch:a.epoch});
  const providerRunId='019effff-aaaa-7bbb-8ccc-0123456789ab';
  await ledger.recordProviderRun({jobId:'synthetic-a',epoch:a.epoch,providerRunId});
  const pending=await ledger.requestCancellation({jobId:'synthetic-a',epoch:a.epoch});
  assert.equal(pending.state,'CANCEL_PENDING');
  assert.equal((await ledger.reserve(permit('other'))).status,'BLOCKED');
  await assert.rejects(ledger.finish({jobId:'synthetic-a',epoch:a.epoch,providerRunId,verified:true,terminalState:'CANCELLED',verificationSource:'user-click',evidenceRef:'x'}));
  await ledger.finish({jobId:'synthetic-a',epoch:a.epoch,providerRunId,verified:true,terminalState:'CANCELLED',verificationSource:'windmill.api.job-readback',evidenceRef:'github-actions:cancellation'});
  assert.equal((await ledger.snapshot()).active,null);
});
test('audit events never include secret payloads and stay durable after restart',async()=>{
  const {ledger,persist,when}=context();
  const a=await ledger.reserve(permit());
  await ledger.beginDispatch({jobId:'synthetic-a',epoch:a.epoch});
  const next=createWindmillDurableLedger({store:persist,now:()=>when.at});
  const status=await next.snapshot();
  assert.equal(status.auditCount,2);
  assert.equal(status.active.state,'DISPATCHING');
  assert.doesNotMatch(JSON.stringify(status),/token|Bearer|secret/i);
});
test('reject arbitrary scripts, negative budgets and production enabled requests',async()=>{
  const {ledger}=context();
  for(const values of [
    {scriptPath:'f/vaos/engineering_mass_estimate'},{productionEnabled:true},
    {approvedAction:false},{maxRuntimeSeconds:300},
  ]){
    await assert.rejects(ledger.reserve({...permit(),...values}));
  }
  assert.equal((await ledger.snapshot()).active,null);
});
