import test from 'node:test';
import assert from 'node:assert/strict';
import { runProductionReadOnlyObservation } from './production-l5-observer.mjs';

const production = { id:'production', status:'ACTIVE', qualificationLevel:3,
  capabilities:{'PRODUCTION.OBSERVE_WIP':5}, responsibilityContractId:'production-controller-contract' };
const qa = { id:'qa',status:'ACTIVE',qualificationLevel:3 };
const contract={ id:'production-controller-contract',autonomousActions:['PRODUCTION.OBSERVE_WIP'],
  prohibitedActions:['EVIDENCE.DELETE'], approvalRequiredActions:['PRODUCTION.RELEASE_JOB'] };
const snapshot = {workforce:{digitalEmployees:[production,qa],responsibilityContracts:[contract]}};
const now = () => new Date('2026-10-10T16:31:00.000Z');
const verifiedReceipt=Object.freeze({
 schemaVersion:'VAOS_L5_SCOPED_OBSERVATION_RECEIPT_V1',
 idempotencyKey:'vaos-production-l5:2026-10-10T16:00:00.000Z',
 actionType:'PRODUCTION.OBSERVE_WIP',jobId:'job-1',intentId:'intent-1',
 adapterId:'vyndi.read-bridge.v1',sourceAuthority:'getProductionJobCards',
 sourceContentSha256:'a'.repeat(64),independentlyReRead:true,observedRows:2,
 verified:true,businessWrites:false,
});
function harness({mode='read-only-v1',state=snapshot,intentStatus='AUTHORIZED',
 executeStatus='SUCCEEDED',receipt=verifiedReceipt}={}) {
 const calls=[];
 const controlService={snapshot:async()=>{calls.push('snapshot');return state},
  proposeIntent:async input=>{calls.push({propose:input});return {status:intentStatus}}};
 const executionEngine={processProductionObservation:async input=>{calls.push({execute:input});return {status:executeStatus,jobId:'job-1',observationReceipt:receipt}}};
 return {calls,run:()=>runProductionReadOnlyObservation({controlService,executionEngine,mode:()=>mode,now,
  missionId:'VAOS-CARBON-FRAME-S-20261010'})};
}
test('authorizes an exact hourly L5 observation by scoped claim only',async()=>{
 const h=harness(),result=await h.run();
 assert.equal(result.status,'PASS');assert.equal(result.actionType,'PRODUCTION.OBSERVE_WIP');
 assert.equal(h.calls.length,3);
 assert.equal(h.calls[1].propose.agentId,'production');
 assert.equal(h.calls[1].propose.risk,'low');
 assert.equal(h.calls[1].propose.actionType,'PRODUCTION.OBSERVE_WIP');
 assert.equal(h.calls[1].propose.payload.missionId,'VAOS-CARBON-FRAME-S-20261010');
 assert.equal(h.calls[1].propose.idempotencyKey,'vaos-production-l5:2026-10-10T16:00:00.000Z');
 assert.equal(h.calls[2].execute.idempotencyKey,'vaos-production-l5:2026-10-10T16:00:00.000Z');
});
test('does not run another execution for already completed hourly intent',async()=>{
 const h=harness({intentStatus:'EXECUTED'}),result=await h.run();
 assert.equal(result.status,'ALREADY_OBSERVED');assert.equal(h.calls.length,2);
});
test('fail closed when disabled, Q-level too low, contract changed, or verifier unavailable',async()=>{
 for(const changes of [
 {mode:'disabled'},
 {state:{workforce:{digitalEmployees:[{...production,qualificationLevel:2},qa],responsibilityContracts:[contract]}}},
 {state:{workforce:{digitalEmployees:[production,qa],responsibilityContracts:[{...contract,autonomousActions:[]}]}}},
 {state:{workforce:{digitalEmployees:[{...production,capabilities:{'PRODUCTION.OBSERVE_WIP':4}},qa],responsibilityContracts:[contract]}}},
 {state:{workforce:{digitalEmployees:[production,{...qa,qualificationLevel:2}],responsibilityContracts:[contract]}}},
 {state:{workforce:{digitalEmployees:[{...production,status:'RESTRICTED'},qa],responsibilityContracts:[contract]}}},
 ]) {const h=harness(changes);const result=await h.run();assert.equal(result.status,'HOLD');assert.equal(h.calls.some(x=>x.propose),false)}
});
test('reports HOLD instead of claiming success for unsuccessful scoped execution',async()=>{
 const h=harness({executeStatus:'DEAD_LETTER'});assert.equal((await h.run()).status,'HOLD');
});
test('kill switch is rechecked after intent authorization',async()=>{
 let check=0, executions=0;
 const result=await runProductionReadOnlyObservation({
  controlService:{snapshot:async()=>snapshot,proposeIntent:async()=>({status:'AUTHORIZED'})},
  executionEngine:{processProductionObservation:async()=>{executions++;return {status:'SUCCEEDED'}}},
  mode:()=>++check===1?'read-only-v1':'disabled',now,
 });
 assert.equal(result.status,'HOLD');assert.equal(executions,0);
});


test('G9: a scoped L5 PASS includes an exact hourly readback receipt instead of a generic success claim',async()=>{
 const h=harness();
 const r=await h.run();
 assert.equal(r.status,'PASS');
 assert.equal(r.executionJobId,'job-1');
 assert.equal(r.intentId,'intent-1');
 assert.equal(r.evidence,'TWO_SIGNED_SOURCE_READS');
 assert.equal(r.sourceContentSha256,'a'.repeat(64));
 assert.equal(r.businessWrites,false);
 assert.equal(r.actionType,'PRODUCTION.OBSERVE_WIP');
});

test('G9: a success flag without exact authorized source evidence is held, never described as autonomous completion',async()=>{
 const invalidReceipts=[
  null,{}, 
  {...verifiedReceipt,verified:false},
  {...verifiedReceipt,jobId:'some-other-job'},
  {...verifiedReceipt,intentId:''},
  {...verifiedReceipt,idempotencyKey:'vaos-production-l5:2026-10-10T15:00:00.000Z'},
  {...verifiedReceipt,sourceAuthority:'user-submitted'},
  {...verifiedReceipt,actionType:'PRODUCTION.RELEASE_JOB'},
  {...verifiedReceipt,adapterId:'unknown'},
  {...verifiedReceipt,independentlyReRead:false},
  {...verifiedReceipt,businessWrites:true},
  {...verifiedReceipt,observedRows:-1},
  {...verifiedReceipt,sourceContentSha256:'not-a-source-hash'},
 ];
 for(const receipt of invalidReceipts){
  const h=harness({receipt});
  const result=await h.run();
  assert.equal(result.status,'HOLD',JSON.stringify(receipt));
  assert.equal(result.reason,'PRODUCTION_MONITOR_EXECUTION_NOT_VERIFIED',JSON.stringify(receipt));
  assert.equal(result.executionJobId,undefined);
 }
});

test('G9: a previously executed hourly intent is a recorded state, not a newly proven signed source read',async()=>{
 const h=harness({intentStatus:'EXECUTED'});
 const result=await h.run();
 assert.equal(result.status,'ALREADY_OBSERVED');
 assert.equal(result.businessWrites,false);
 assert.equal(result.freshReadbackVerified,false);
 assert.equal(h.calls.filter(x=>x.execute).length,0);
});
