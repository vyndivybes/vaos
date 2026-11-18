import test from 'node:test';
import assert from 'node:assert/strict';
import {runScheduledAgentExchange} from './jarvis-agent-exchange.mjs';
import {exchangeHistoryKey,exchangeLatestKey} from '../../intelligence/agent-intelligence-exchange.mjs';

function fakeArchive(){
  const objects=new Map();
  return {objects,async get(key){
    const value=objects.get(key);
    return value?{text:async()=>value}:null;
  },async put(key,value){objects.set(key,value);}};
}
test('scheduled digest stores bounded report history and latest pointer without source rows',async()=>{
  const bucket=fakeArchive();
  const called=[];
  const result=await runScheduledAgentExchange({
    env:{VAOS_ARTIFACTS:bucket},cron:'30 2 * * *',
    scheduledTime:'2026-11-18T02:30:00Z',
    readVaos:async()=>{
      called.push('vaos');
      return {schemaVersion:'VAOS_FOUNDER_ANALYTICS_V1',observedAt:'2026-11-18T02:29:00Z',
        employees:[{id:'orchestrator',sourceStatus:'RECORDED',lifecycle:'ACTIVE',
          work:{total:2,blocked:1,failed:0},raw:{private:'SHOULD_NOT_BE_STORED'}}]};
    },
    readVyndi:async(_env,period)=>{
      called.push('vyndi');
      return {schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,scope:'all',
        period:{from:period.from,to:period.to},
        departments:[{employeeId:'finance',status:'OBSERVED',rows:[{name:'SECRET_FINANCE'}]}]};
    }
  });
  assert.deepEqual(called,['vaos','vyndi']);
  assert.equal(result.status,'HOLD'); // Other agents are not observed, so the aggregate must not say healthy.
  const period={kind:'daily',date:'2026-11-18'};
  const archived=bucket.objects.get(exchangeHistoryKey(period));
  assert.equal(archived,bucket.objects.get(exchangeLatestKey('daily')));
  assert.doesNotMatch(archived,/SHOULD_NOT_BE_STORED|SECRET_FINANCE/);
  assert.equal(JSON.parse(archived).summary.observedAgents,2);
  const replay=await runScheduledAgentExchange({env:{VAOS_ARTIFACTS:bucket},
    cron:'30 2 * * *',scheduledTime:'2026-11-18T02:30:00Z',
    readVaos:()=>{throw Error('SHOULD_NOT_CALL')},
    readVyndi:()=>{throw Error('SHOULD_NOT_CALL')}});
  assert.equal(replay.status,'ALREADY_ARCHIVED');
});
test('missing external services produce an explicitly held archival result',async()=>{
  const bucket=fakeArchive();
  const result=await runScheduledAgentExchange({env:{VAOS_ARTIFACTS:bucket},
    cron:'45 2 * * 1',scheduledTime:'2026-11-23T02:45:00Z',
    readVaos:async()=>{throw Error('SOURCE_DOWN')},
    readVyndi:async()=>{throw Error('SIGNED_BRIDGE_UNAVAILABLE')}});
  assert.equal(result.status,'HOLD');
  assert.equal(result.heldAgents,16);
  assert.equal(result.semanticMemoryUpdated,false);
  assert.equal(result.productionWriteAuthorized,false);
  assert.doesNotMatch(JSON.stringify(result),/SOURCE_DOWN|SIGNED_BRIDGE_UNAVAILABLE/);
});
test('non-exchange cron never touches source or archive; required archive fails closed',async()=>{
  const untouched=await runScheduledAgentExchange({env:{},cron:'0 * * * *',
    scheduledTime:'2026-11-18T02:00:00Z',
    readVaos:()=>{throw Error('NO')},readVyndi:()=>{throw Error('NO')}});
  assert.equal(untouched.status,'SKIP');
  await assert.rejects(()=>runScheduledAgentExchange({env:{},cron:'30 2 * * *',
    scheduledTime:'2026-11-18T02:30:00Z'}),/EXCHANGE_ARCHIVE_UNAVAILABLE/);
});
