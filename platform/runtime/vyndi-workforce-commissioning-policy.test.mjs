import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateActionPolicy, evaluateWriteQualificationPolicy, POLICY_DECISION } from './policy-engine.mjs';

const readActions=[
  'COMMERCIAL.OBSERVE_PIPELINE',
  'PROCUREMENT.OBSERVE_SHORTAGE',
  'INVENTORY.OBSERVE_STOCK',
  'PRODUCTION.OBSERVE_WIP',
  'MAINTENANCE.OBSERVE_ASSET',
  'FINANCE.OBSERVE_LEDGER',
  'PEOPLE.OBSERVE_WORKFORCE',
  'ENGINEERING.OBSERVE_CONFIGURATION',
];

const writeActions=[
  'COMMERCIAL.COMMIT_ORDER',
  'COMMERCIAL.CHANGE_COMMITMENT',
  'PROCUREMENT.CREATE_PO',
  'PROCUREMENT.CHANGE_PO',
  'INVENTORY.RESERVE_MATERIAL',
  'INVENTORY.ISSUE_MATERIAL',
  'PRODUCTION.RELEASE_JOB',
  'PRODUCTION.ADVANCE_STAGE',
  'MAINTENANCE.OPEN_WORK_ORDER',
  'MAINTENANCE.RETURN_TO_SERVICE',
  'FINANCE.PREPARE_PAYMENT',
  'PEOPLE.PREPARE_PAYROLL',
  'PEOPLE.CHANGE_EMPLOYEE_MASTER',
  'ENGINEERING.CONFIGURATION_CHANGE',
  'ENGINEERING.RELEASE_CONFIGURATION',
];

test('eight commissioned VYNDI read actions are live autonomous observations',()=>{
  for(const actionType of readActions){
    const result=evaluateActionPolicy({actionType,authority:5,risk:'low'});
    assert.equal(result.decision,POLICY_DECISION.ALLOW,actionType);
    assert.equal(result.reason,'POLICY_AUTHORIZED',actionType);
  }
});

test('all VYNDI mutation actions remain prepare-only until write commissioning',()=>{
  for(const actionType of writeActions){
    const result=evaluateActionPolicy({actionType,authority:5,risk:'low'});
    assert.equal(result.decision,POLICY_DECISION.PREPARE_ONLY,actionType);
    assert.equal(result.reason,'WORKFORCE_BRIDGE_PREPARE_ONLY',actionType);
  }
});

test('Stage-3 write qualification policy only opens the synthetic commercial canary path',()=>{
  const allowed=evaluateWriteQualificationPolicy({
    actionType:'COMMERCIAL.COMMIT_ORDER',
    authority:4,
    risk:'low',
    payload:{writeQualification:true,qualificationProfile:'COMMERCIAL_WRITE_CANARY_V1'},
  });
  assert.equal(allowed.decision,POLICY_DECISION.AWAIT_APPROVAL);
  assert.equal(allowed.reason,'WRITE_QUALIFICATION_APPROVAL_REQUIRED');

  for(const candidate of [
    {actionType:'COMMERCIAL.COMMIT_ORDER',payload:{writeQualification:true,qualificationProfile:'WRONG_PROFILE'}},
    {actionType:'INVENTORY.RESERVE_MATERIAL',payload:{writeQualification:true,qualificationProfile:'COMMERCIAL_WRITE_CANARY_V1'}},
  ]){
    const denied=evaluateWriteQualificationPolicy({...candidate,authority:4,risk:'low'});
    assert.equal(denied.decision,POLICY_DECISION.DENY);
  }

  const ordinary=evaluateActionPolicy({actionType:'COMMERCIAL.COMMIT_ORDER',authority:4,risk:'low'});
  assert.equal(ordinary.decision,POLICY_DECISION.PREPARE_ONLY);
});

