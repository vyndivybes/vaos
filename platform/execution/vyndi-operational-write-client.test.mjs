import test from 'node:test';
import assert from 'node:assert/strict';
import { createVyndiOperationalWriteClient } from './vyndi-operational-write-client.mjs';

test('People master operational write signs approval lineage and expected revision',async()=>{
  let captured;
  const client=createVyndiOperationalWriteClient({
    signer:{async signVyndiBridgeRequest(){return {keyId:'vyndi-primary-p256-v1',signature:'sig-test'}}},
    serviceBinding:{
      async fetch(url,options){
        captured={url,options};
        const body=JSON.parse(options.body);
        return new Response(JSON.stringify({
          ok:true,
          operationalWrite:true,
          readOnly:false,
          actionType:body.actionType,
          sourceAuthority:'savePeopleRecordDraft',
          operationalWriteProfile:'PEOPLE_DRAFT_MASTER_V1',
          resourceId:body.input.id,
          outcome:'EXECUTED',
          finalState:'draft',
          initialRevision:body.input.expectedRevision,
          finalRevision:body.input.expectedRevision+1,
          replay:false,
        }),{status:200,headers:{'content-type':'application/json'}});
      },
    },
    now:()=>1760000000000,
    nonce:()=> 'nonce-stage4-people-0001',
  });

  const result=await client.execute({
    id:'job-stage4-1',
    intentId:'intent-stage4-1',
    actionType:'PEOPLE.CHANGE_EMPLOYEE_MASTER',
    payload:{
      operationalWrite:true,
      operationalWriteProfile:'PEOPLE_DRAFT_MASTER_V1',
      id:'role-temp',
      expectedRevision:1,
      displayName:'Temporary / Future Role',
      functionName:'Operations',
      roleTitle:'Temporary Role',
      engagementType:'planned_role',
      startMonth:12,
      endMonth:null,
      notes:'Stage-4 controlled update',
      _vaosControl:{
        idempotencyKey:'stage4-key-0001',
        approvalId:'approval-stage4-1',
        requestedBy:'maker@example.test',
        approvedBy:'checker@example.test',
      },
    },
  });

  const body=JSON.parse(captured.options.body);
  assert.equal(body.purpose,'write-execute');
  assert.equal(body.actionType,'PEOPLE.CHANGE_EMPLOYEE_MASTER');
  assert.equal(body.employeeId,'people');
  assert.equal(body.approvalId,'approval-stage4-1');
  assert.equal(body.operationalWriteProfile,'PEOPLE_DRAFT_MASTER_V1');
  assert.equal(body.idempotencyKey,'stage4-key-0001');
  assert.equal(body.input.id,'role-temp');
  assert.equal(body.input.expectedRevision,1);
  assert.match(body.input.sourceReference,/^VAOS\|intent-stage4-1\|job-stage4-1$/);
  assert.match(body.requestedByHash,/^[0-9a-f]{64}$/);
  assert.match(body.approvedByHash,/^[0-9a-f]{64}$/);
  assert.notEqual(body.requestedByHash,body.approvedByHash);
  assert.equal(result.finalState,'draft');
  assert.equal(result.initialRevision,1);
  assert.equal(result.finalRevision,2);
});

test('People master operational write fails closed without expectedRevision and independent approval',async()=>{
  const client=createVyndiOperationalWriteClient({
    signer:{async signVyndiBridgeRequest(){return {keyId:'vyndi-primary-p256-v1',signature:'sig-test'}}},
    serviceBinding:{async fetch(){throw new Error('must not call transport')}},
  });
  await assert.rejects(
    ()=>client.execute({
      id:'job-stage4-2',intentId:'intent-stage4-2',actionType:'PEOPLE.CHANGE_EMPLOYEE_MASTER',
      payload:{
        operationalWrite:true,operationalWriteProfile:'PEOPLE_DRAFT_MASTER_V1',
        id:'role-temp',displayName:'Temp',functionName:'Ops',roleTitle:'Temp',
        engagementType:'planned_role',startMonth:12,endMonth:null,notes:'',
        _vaosControl:{idempotencyKey:'stage4-key-0002',approvalId:'approval-stage4-2',requestedBy:'same@example.test',approvedBy:'same@example.test'},
      },
    }),
    /EXPECTED_REVISION|SOD_REQUIRED/,
  );
});

test('People master write treats a 503 response as an unknown outcome and forbids blind retry',async()=>{
  const client=createVyndiOperationalWriteClient({
    signer:{async signVyndiBridgeRequest(){return {keyId:'vyndi-primary-p256-v1',signature:'sig-test'}}},
    serviceBinding:{async fetch(){return new Response(JSON.stringify({error:'upstream_unknown'}),{status:503,headers:{'content-type':'application/json'}})}},
    now:()=>1760000000000,
    nonce:()=> 'nonce-stage4-people-503-test',
  });
  const job={
    id:'job-stage4-503',intentId:'intent-stage4-503',actionType:'PEOPLE.CHANGE_EMPLOYEE_MASTER',
    payload:{
      operationalWrite:true,operationalWriteProfile:'PEOPLE_DRAFT_MASTER_V1',
      id:'role-temp',expectedRevision:1,displayName:'Future role',functionName:'Operations',
      roleTitle:'Temporary Role',engagementType:'planned_role',
      startMonth:12,endMonth:null,notes:'test',
      _vaosControl:{idempotencyKey:'stage4-key-503',approvalId:'approval-stage4-503',
        requestedBy:'maker@example.test',approvedBy:'checker@example.test'},
    },
  };
  await assert.rejects(()=>client.execute(job),(error)=>{
    assert.equal(error.code,'VYNDI_OPERATIONAL_WRITE_FAILED');
    assert.equal(error.retryable,false,'ambiguous business writes must never auto retry');
    return true;
  });
});

test('People master write wraps transport errors as non-retryable unknown outcomes',async()=>{
  const client=createVyndiOperationalWriteClient({
    signer:{async signVyndiBridgeRequest(){return {keyId:'vyndi-primary-p256-v1',signature:'sig-test'}}},
    serviceBinding:{async fetch(){throw new Error('connection_reset')}},now:()=>1760000000000,
  });
  await assert.rejects(()=>client.execute({
    id:'job-stage4-lost',intentId:'intent-stage4-lost',actionType:'PEOPLE.CHANGE_EMPLOYEE_MASTER',
    payload:{
      operationalWrite:true,operationalWriteProfile:'PEOPLE_DRAFT_MASTER_V1',
      id:'role-temp',expectedRevision:1,displayName:'Future role',functionName:'Operations',
      roleTitle:'Temporary Role',engagementType:'planned_role',startMonth:12,endMonth:null,notes:'',
      _vaosControl:{idempotencyKey:'stage4-key-lost',approvalId:'approval-stage4-lost',
        requestedBy:'maker@example.test',approvedBy:'checker@example.test'},
    },
  }),error=>{
    assert.equal(error.code,'VYNDI_OPERATIONAL_WRITE_OUTCOME_UNKNOWN');
    assert.equal(error.retryable,false);
    return true;
  });
});
