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
  'maintenance','finance','people','engineering-configuration',
]);

test('bridge preparation covers every operational workforce capability exactly once',()=>{
  assert.equal(VYNDI_BRIDGE_ROUTES.length,23);
  assert.equal(new Set(VYNDI_BRIDGE_ROUTES.map(r=>r.actionType)).size,23);
  assert.deepEqual(new Set(VYNDI_BRIDGE_ROUTES.map(r=>r.employeeId)),expectedEmployees);
  for(const route of VYNDI_BRIDGE_ROUTES){
    assert.equal(route.executionEnabled,false);
    assert.ok(route.verificationRefs.length>0,route.actionType);
    assert.match(route.sourceFile,/^src\/lib\//);
    if(route.effectClass===VYNDI_BRIDGE_EFFECT.MUTATION) assert.equal(route.approvalRequired,true);
  }
});

test('all 23 operational routes now have canonical VYNDI authorities while execution remains disabled',()=>{
  const readiness=getVyndiBridgeReadiness();
  assert.equal(readiness.executionEnabled,false);
  assert.equal(readiness.routeCount,23);
  assert.equal(readiness.readReady,8);
  assert.equal(readiness.writePrepared,15);
  assert.deepEqual(readiness.gaps,[]);
  assert.equal(getVyndiBridgeRoute('PROCUREMENT.CHANGE_PO').authority,'amendPurchaseOrder');
  assert.equal(getVyndiBridgeRoute('PRODUCTION.ADVANCE_STAGE').authority,'advanceProductionTravellerStage');
  assert.equal(getVyndiBridgeRoute('FINANCE.PREPARE_PAYMENT').authority,'prepareSupplierPayment');
});

test('prepared mutation envelope requires approval and contains canonical authority plus correlation reference',()=>{
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
  assert.equal(envelope.state,'PREPARED');
  assert.equal(envelope.executionEnabled,false);
  assert.equal(envelope.target.authority,'saveSalesOrder');
  assert.equal(envelope.sourceReference,'VAOS|M-1|I-1');
});

test('employee/action mismatch fails closed and newly closed routes prepare normally',()=>{
  assert.throws(
    ()=>prepareVyndiBridgeEnvelope({
      employeeId:'finance',actionType:'COMMERCIAL.COMMIT_ORDER',
      missionId:'M-2',intentId:'I-2',idempotencyKey:'K-2',approvalRef:'APP-2',
    }),
    error=>error.code==='VYNDI_BRIDGE_EMPLOYEE_MISMATCH',
  );
  const finance=prepareVyndiBridgeEnvelope({
    employeeId:'finance',actionType:'FINANCE.PREPARE_PAYMENT',
    missionId:'M-3',intentId:'I-3',idempotencyKey:'K-3',approvalRef:'APP-3',
  });
  assert.equal(finance.target.authority,'prepareSupplierPayment');
  assert.equal(finance.executionEnabled,false);
});

test('prepared bridge never calls transport before explicit commissioning',async()=>{
  let calls=0;
  const adapter=createVyndiWriteBridgeAdapter({transport:async()=>{calls+=1;return {ok:true}}});
  const envelope=adapter.prepare({
    employeeId:'maintenance',actionType:'MAINTENANCE.OPEN_WORK_ORDER',
    missionId:'M-4',intentId:'I-4',idempotencyKey:'K-4',approvalRef:'APP-4',
  });
  await assert.rejects(adapter.execute(envelope),error=>error.code==='VYNDI_WRITE_BRIDGE_NOT_COMMISSIONED');
  assert.equal(calls,0);
});

test('all read routes are ready but still preparation-only at the bridge boundary',()=>{
  const reads=VYNDI_BRIDGE_ROUTES.filter(r=>r.effectClass===VYNDI_BRIDGE_EFFECT.READ);
  assert.equal(reads.length,8);
  assert.ok(reads.every(r=>r.state===VYNDI_BRIDGE_ROUTE_STATE.READ_READY));
  for(const route of reads){
    const envelope=prepareVyndiBridgeEnvelope({
      employeeId:route.employeeId,actionType:route.actionType,
      missionId:'READ-M',intentId:'READ-'+route.employeeId,idempotencyKey:'READ-K-'+route.employeeId,
    });
    assert.equal(envelope.executionEnabled,false);
  }
});
