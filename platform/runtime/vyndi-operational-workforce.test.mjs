import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUTHORITY } from '../../packages/contracts/agent.mjs';
import {
  VYNDI_OPERATIONAL_DIGITAL_EMPLOYEES,
  VYNDI_OPERATIONAL_RESPONSIBILITY_CONTRACTS,
  VYNDI_OPERATIONAL_TARGET_QUALIFICATION,
} from '../../packages/contracts/vyndi-workforce.mjs';
import { createDigitalWorkforceRegistry } from './digital-workforce-registry.mjs';
import { evaluateActionPolicy, POLICY_DECISION } from './policy-engine.mjs';

const expectedIds=[
  'commercial','procurement','inventory','production',
  'maintenance','finance','people','engineering-configuration',
];

test('VYNDI operational roster adds exactly eight governed employees',()=>{
  assert.deepEqual(VYNDI_OPERATIONAL_DIGITAL_EMPLOYEES.map(e=>e.id),expectedIds);
  assert.equal(VYNDI_OPERATIONAL_RESPONSIBILITY_CONTRACTS.length,8);
  assert.equal(new Set(VYNDI_OPERATIONAL_RESPONSIBILITY_CONTRACTS.map(c=>c.id)).size,8);
  for(const employee of VYNDI_OPERATIONAL_DIGITAL_EMPLOYEES){
    assert.equal(employee.status,'PROPOSED');
    assert.equal(employee.qualificationLevel,0);
    assert.equal(employee.confidence,0);
    assert.match(employee.supervisor,/VAOS Orchestrator/);
    assert.ok(employee.tools.includes('VYNDI governed API'));
    assert.ok(employee.tools.includes('VAOS Automation Fabric'));
    assert.ok([2,3,4].includes(VYNDI_OPERATIONAL_TARGET_QUALIFICATION[employee.id]));
    assert.equal(Object.keys(employee.capabilities).some(cap=>cap==='*'),false);
  }
});

test('responsibility contracts enforce observation autonomy, approval-bound mutation and evidence-delete prohibition',()=>{
  const registry=createDigitalWorkforceRegistry();
  for(const contract of VYNDI_OPERATIONAL_RESPONSIBILITY_CONTRACTS) registry.registerResponsibilityContract(contract);
  for(const employee of VYNDI_OPERATIONAL_DIGITAL_EMPLOYEES) registry.propose(employee);

  for(const employee of VYNDI_OPERATIONAL_DIGITAL_EMPLOYEES){
    const contract=VYNDI_OPERATIONAL_RESPONSIBILITY_CONTRACTS.find(c=>c.id===employee.responsibilityContractId);
    assert.ok(contract);
    assert.ok(contract.prohibitedActions.includes('EVIDENCE.DELETE'));

    for(const action of contract.autonomousActions){
      assert.equal(employee.capabilities[action],AUTHORITY.AUTONOMOUS_EXECUTION);
      const policy=evaluateActionPolicy({actionType:action,authority:employee.capabilities[action]});
      assert.equal(policy.decision,POLICY_DECISION.ALLOW);
    }
    for(const action of contract.approvalRequiredActions){
      assert.equal(employee.capabilities[action],AUTHORITY.APPROVED_EXECUTION);
      const policy=evaluateActionPolicy({actionType:action,authority:employee.capabilities[action]});
      if(action==='PEOPLE.CHANGE_EMPLOYEE_MASTER'){
        assert.equal(policy.decision,POLICY_DECISION.AWAIT_APPROVAL);
        assert.equal(policy.reason,'HUMAN_APPROVAL_REQUIRED');
      }else{
        assert.equal(policy.decision,POLICY_DECISION.PREPARE_ONLY);
        assert.equal(policy.reason,'WORKFORCE_BRIDGE_PREPARE_ONLY');
      }
    }

    assert.deepEqual(
      registry.authorizeAction(employee.id,contract.autonomousActions[0]),
      {decision:'DENY',reason:'DIGITAL_EMPLOYEE_NOT_ACTIVE'},
    );
  }
});

test('durable migration defines the same eight identities without activating them',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261008100100_vyndi_operational_workforce_v1.sql',import.meta.url),'utf8');
  for(const id of expectedIds){
    assert.match(sql,new RegExp("\\('"+id+"'"));
  }
  assert.match(sql,/totalTargetWorkforce',16/);
  assert.match(sql,/activationGranted',false/);
  assert.match(sql,/businessTruthAuthority','VYNDI'/);
  assert.match(sql,/governanceAuthority','VAOS'/);
  const proposed=(sql.match(/,0,'PROPOSED'/g)||[]).length;
  assert.equal(proposed,8);
});

test('high-assurance financial and engineering configuration roles target Q4',()=>{
  assert.equal(VYNDI_OPERATIONAL_TARGET_QUALIFICATION.finance,4);
  assert.equal(VYNDI_OPERATIONAL_TARGET_QUALIFICATION['engineering-configuration'],4);
});
