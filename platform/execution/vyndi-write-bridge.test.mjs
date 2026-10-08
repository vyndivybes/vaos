import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VYNDI_BRIDGE_ROUTES,
  VYNDI_BRIDGE_ROUTE_STATE,
  VYNDI_BRIDGE_EFFECT,
  getVyndiBridgeReadiness,
  getVyndiBridgeRoute,
} from '../../packages/contracts/vyndi-write-bridge.mjs';
import { createVyndiWriteBridgeAdapter, prepareVyndiBridgeEnvelope } from './vyndi-write-bridge.mjs';

const expectedEmployees=new Set([
  'commercial','procurement','inventory','production',
  'maintenance','finance','people','engineering-configuration','project',
]);

test('bridge preserves all 23 operational capabilities and adds exactly one read-only project schedule route',()=>{
  assert.equal(VYNDI_BRIDGE_ROUTES.length,24);
  assert.equal(new Set(VYNDI_BRIDGE_ROUTES.map(r=>r.actionType)).size,24);
  assert.deepEqual(new Set(VYNDI_BRIDGE_ROUTES.map(r=>r.employeeId)),expectedEmployees);
  for(const route of VYNDI_BRIDGE_ROUTES){
    assert.ok(route.verificationRefs.length>0,route.actionType);
    assert.match(route.sourceFile,/^src\/lib\//);
    if(route.effectClass===VYNDI_BRIDGE_EFFECT.MUTATION){
      assert.equal(route.approvalRequired,true);
      if(route.actionType==='PEOPLE.CHANGE_EMPLOYEE_MASTER'){
        assert.equal(route.executionEnabled,true);
        assert.equal(route.state,VYNDI_BRIDGE_ROUTE_STATE.WRITE_READY);
      }else{
        assert.equal(route.executionEnabled,false);
      }
    }
  }
});

test('Stage-4 keeps nine reads live, opens one approved write, and leaves fourteen mutations disabled',()=>{
  const readiness=getVyndiBridgeReadiness();
  assert.equal(readiness.executionEnabled,true);
  assert.equal(readiness.routeCount,24);
  assert.equal(readiness.readReady,9);
  assert.equal(readiness.writePrepared,14);
  assert.equal(readiness.writeReady,1);
  assert.deepEqual(readiness.gaps,[]);
  const reads=VYNDI_BRIDGE_ROUTES.filter(r=>r.effectClass===VYNDI_BRIDGE_EFFECT.READ);
  const writes=VYNDI_BRIDGE_ROUTES.filter(r=>r.effectClass===VYNDI_BRIDGE_EFFECT.MUTATION);
  assert.equal(reads.length,9);
  assert.ok(reads.every(r=>r.state===VYNDI_BRIDGE_ROUTE_STATE.READ_READY && r.executionEnabled===true));
  assert.equal(writes.length,15);
  assert.deepEqual(
    writes.filter(r=>r.executionEnabled===true).map(r=>r.actionType),
    ['PEOPLE.CHANGE_EMPLOYEE_MASTER'],
  );
  assert.ok(writes.filter(r=>r.actionType!=='PEOPLE.CHANGE_EMPLOYEE_MASTER').every(r=>r.executionEnabled===false));
});

test('all three previously missing canonical authorities remain resolved',()=>{
  assert.equal(getVyndiBridgeRoute('PROCUREMENT.CHANGE_PO').authority,'amendPurchaseOrder');
  assert.equal(getVyndiBridgeRoute('PRODUCTION.ADVANCE_STAGE').authority,'advanceProductionTravellerStage');
  assert.equal(getVyndiBridgeRoute('FINANCE.PREPARE_PAYMENT').authority,'prepareSupplierPayment');
});

test('prepared mutation envelope requires approval and remains disabled',()=>{
  assert.throws(
    ()=>prepareVyndiBridgeEnvelope({
      employeeId:'commercial',actionType:'COMMERCIAL.COMMIT_ORDER',
      missionId:'M-1',intentId:'I-1',idempotencyKey:'K-1',input:{id:'SO-1'},
    }),
    error=>error.code==='VYNDI_BRIDGE_APPROVAL_REQUIRED',
  );
  const envelope=prepareVyndiBridgeEnvelope({
    employeeId:'commercial',actionType:'COMMERCIAL.COMMIT_ORDER',
    missionId:'M-1',intentId:'I-1',idempotencyKey:'K-1',approvalRef:'APP-1',input:{id:'SO-1'},
  });
  assert.equal(envelope.executionEnabled,false);
  assert.equal(envelope.target.authority,'saveSalesOrder');
});

test('commissioned read envelope carries live execution state without approval',()=>{
  const envelope=prepareVyndiBridgeEnvelope({
    employeeId:'finance',actionType:'FINANCE.OBSERVE_LEDGER',
    missionId:'READ-M',intentId:'READ-I',idempotencyKey:'READ-K',
  });
  assert.equal(envelope.executionEnabled,true);
  assert.equal(envelope.approvalRef,null);
  assert.equal(envelope.target.authority,'getAccountingWorkbench');
});

test('write bridge adapter still refuses uncommissioned mutations',async()=>{
  let calls=0;
  const adapter=createVyndiWriteBridgeAdapter({transport:async()=>{calls+=1;return {ok:true}}});
  const envelope=adapter.prepare({
    employeeId:'maintenance',actionType:'MAINTENANCE.OPEN_WORK_ORDER',
    missionId:'M-4',intentId:'I-4',idempotencyKey:'K-4',approvalRef:'APP-4',
  });
  await assert.rejects(adapter.execute(envelope),error=>error.code==='VYNDI_WRITE_BRIDGE_NOT_COMMISSIONED');
  assert.equal(calls,0);
});

test('commissioned read may traverse a supplied transport',async()=>{
  const adapter=createVyndiWriteBridgeAdapter({transport:async(envelope)=>({ok:true,actionType:envelope.actionType})});
  const envelope=adapter.prepare({
    employeeId:'inventory',actionType:'INVENTORY.OBSERVE_STOCK',
    missionId:'READ-M2',intentId:'READ-I2',idempotencyKey:'READ-K2',
  });
  const result=await adapter.execute(envelope);
  assert.deepEqual(result,{ok:true,actionType:'INVENTORY.OBSERVE_STOCK'});
});

test('employee/action mismatch fails closed',()=>{
  assert.throws(
    ()=>prepareVyndiBridgeEnvelope({
      employeeId:'finance',actionType:'COMMERCIAL.OBSERVE_PIPELINE',
      missionId:'M-2',intentId:'I-2',idempotencyKey:'K-2',
    }),
    error=>error.code==='VYNDI_BRIDGE_EMPLOYEE_MISMATCH',
  );
});

test('Stage-4 marks exactly one mutation WRITE_READY and leaves fourteen WRITE_PREPARED',()=>{
  const writes=VYNDI_BRIDGE_ROUTES.filter(r=>r.effectClass===VYNDI_BRIDGE_EFFECT.MUTATION);
  const ready=writes.filter(r=>r.state==='WRITE_READY'&&r.executionEnabled===true);
  const prepared=writes.filter(r=>r.state===VYNDI_BRIDGE_ROUTE_STATE.WRITE_PREPARED&&r.executionEnabled===false);
  assert.deepEqual(ready.map(r=>r.actionType),['PEOPLE.CHANGE_EMPLOYEE_MASTER']);
  assert.equal(prepared.length,14);
});

test('generic prepared bridge cannot execute the Stage-4 mutation even with a transport',async()=>{
  let calls=0;
  const adapter=createVyndiWriteBridgeAdapter({transport:async()=>{calls+=1;return {ok:true}}});
  const envelope=adapter.prepare({
    employeeId:'people',
    actionType:'PEOPLE.CHANGE_EMPLOYEE_MASTER',
    missionId:'STAGE4-M',
    intentId:'STAGE4-I',
    idempotencyKey:'STAGE4-K',
    approvalRef:'STAGE4-APP',
    input:{id:'role-temp',expectedRevision:1},
  });
  assert.equal(envelope.executionEnabled,true);
  await assert.rejects(
    ()=>adapter.execute(envelope),
    error=>error.code==='VYNDI_OPERATIONAL_WRITE_DEDICATED_ADAPTER_REQUIRED',
  );
  assert.equal(calls,0);
});

