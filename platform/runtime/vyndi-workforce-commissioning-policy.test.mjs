import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateActionPolicy, POLICY_DECISION } from './policy-engine.mjs';

const operationalActions=[
  "COMMERCIAL.OBSERVE_PIPELINE",
  "COMMERCIAL.COMMIT_ORDER",
  "COMMERCIAL.CHANGE_COMMITMENT",
  "PROCUREMENT.OBSERVE_SHORTAGE",
  "PROCUREMENT.CREATE_PO",
  "PROCUREMENT.CHANGE_PO",
  "INVENTORY.OBSERVE_STOCK",
  "INVENTORY.RESERVE_MATERIAL",
  "INVENTORY.ISSUE_MATERIAL",
  "PRODUCTION.OBSERVE_WIP",
  "PRODUCTION.RELEASE_JOB",
  "PRODUCTION.ADVANCE_STAGE",
  "MAINTENANCE.OBSERVE_ASSET",
  "MAINTENANCE.OPEN_WORK_ORDER",
  "MAINTENANCE.RETURN_TO_SERVICE",
  "FINANCE.OBSERVE_LEDGER",
  "FINANCE.PREPARE_PAYMENT",
  "PEOPLE.OBSERVE_WORKFORCE",
  "PEOPLE.PREPARE_PAYROLL",
  "PEOPLE.CHANGE_EMPLOYEE_MASTER",
  "ENGINEERING.OBSERVE_CONFIGURATION",
  "ENGINEERING.CONFIGURATION_CHANGE",
  "ENGINEERING.RELEASE_CONFIGURATION"
];

test('new VYNDI workforce actions remain prepare-only until the write bridge is commissioned',()=>{
  for(const actionType of operationalActions){
    const result=evaluateActionPolicy({actionType,authority:5,risk:'low'});
    assert.equal(result.decision,POLICY_DECISION.PREPARE_ONLY,actionType);
    assert.equal(result.reason,'WORKFORCE_BRIDGE_PREPARE_ONLY',actionType);
  }
});
