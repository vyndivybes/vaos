import test from 'node:test';
import assert from 'node:assert/strict';
import {A01_MISSION_CRON,runA01MissionTick} from './jarvis-a01-mission-tick.mjs';

test('dedicated schedule only scopes runnable mission to A01, never another mission',async()=>{
  assert.equal(A01_MISSION_CRON,'7,22,37,52 * * * *');
  let called=0;
  const service={listRunnableMissions:async()=>({missionIds:['VAOS-OTHER','JARVIS-A01-20261118']}),
    snapshot:async()=>({mission:{id:'JARVIS-A01-20261118',status:'ACTIVE'},handoffs:Array.from({length:8},()=>({status:'PENDING'}))})};
  const out=await runA01MissionTick({control:'signed-readonly-v1',service,
    readDepartment:()=>{},runSweep:async input=>{
      called++;assert.deepEqual(await input.service.listRunnableMissions({limit:1}),{missionIds:['JARVIS-A01-20261118']});
      assert.equal(input.maxMissions,1);assert.equal(input.maxHandoffs,1,'Cloudflare free tier must run only one maker/checker handoff per scheduled invocation');
      assert.equal(input.service.prepareMissionClosure,undefined);
      return {processed:1,submitted:2,verified:1,returned:0,preparedForClosure:0,failures:[]};
    }});
  assert.equal(called,1);assert.equal(out.status,'OBSERVED');
  assert.equal(out.productionWriteAuthorized,false);
});

test('disabled gate never calls service or worker',async()=>{
  const out=await runA01MissionTick({control:'off',service:null,runSweep:()=>{throw Error('must not run')}});
  assert.equal(out.status,'DISABLED');
});

test('no runnable A01 and broken scheduler are transparently held',async()=>{
  const scoped=await runA01MissionTick({control:'signed-readonly-v1',service:{listRunnableMissions:async()=>({missionIds:['VAOS-OTHER']})},readDepartment:()=>{},runSweep:async input=>{
    assert.deepEqual(await input.service.listRunnableMissions({limit:1}),{missionIds:[]});
    return {processed:0,submitted:0,verified:0,returned:0,preparedForClosure:0,failures:[]};
  }});
  assert.equal(scoped.status,'NO_A01_RUNNABLE_WORK');
  await assert.rejects(runA01MissionTick({control:'signed-readonly-v1',service:null,runSweep:async()=>({})}),/A01_TICK_SERVICE_REQUIRED/);
});

test('bounded sweep failures never falsely mark completed or authorized',async()=>{
  const out=await runA01MissionTick({control:'signed-readonly-v1',service:{listRunnableMissions:async()=>({missionIds:['JARVIS-A01-20261118']}),
    snapshot:async()=>({mission:{id:'JARVIS-A01-20261118',status:'ACTIVE'},handoffs:Array.from({length:8},()=>({status:'PENDING'}))})},readDepartment:()=>{},
   runSweep:async()=>({processed:0,submitted:0,verified:0,returned:0,preparedForClosure:0,failures:[{missionId:'JARVIS-A01-20261118',code:'SIGNED_SOURCE_UNAVAILABLE'}]})});
  assert.equal(out.status,'HOLD');assert.equal(out.productionWriteAuthorized,false);
});

test('malformed mission discovery is rejected before work and never interpreted as empty',async()=>{
  await assert.rejects(runA01MissionTick({control:'signed-readonly-v1',readDepartment:()=>{},
    service:{listRunnableMissions:async()=>({missionIds:['JARVIS-A01-20261118','JARVIS-A01-20261118']})},
    runSweep:async input=>{await input.service.listRunnableMissions();}}),/A01_MISSION_DISCOVERY_INVALID/);
});

test('source-unverified mission never auto-closes and fully reviewed handoffs stop consuming',async()=>{
 const base={listRunnableMissions:async()=>({missionIds:['JARVIS-A01-20261118']}),
  prepareMissionClosure:async()=>{throw Error('DO NOT CLOSE')},
  snapshot:async()=>({mission:{id:'JARVIS-A01-20261118',status:'ACTIVE'},
   handoffs:Array.from({length:8},()=>({status:'COMPLETED'}))})};
 const out=await runA01MissionTick({control:'signed-readonly-v1',service:base,readDepartment:()=>{},runSweep:async ({service})=>{
  assert.equal(service.prepareMissionClosure,undefined);
  assert.deepEqual(await service.listRunnableMissions(),{missionIds:[]});
  return {processed:0,submitted:0,verified:0,returned:0,preparedForClosure:0,failures:[]};
 }});
 assert.equal(out.status,'NO_A01_RUNNABLE_WORK');
});
