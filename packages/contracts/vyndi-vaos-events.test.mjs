import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVyndiIntentEvent,
  createVaosResultEvent,
  validateVyndiIntentEvent,
} from './vyndi-vaos-events.mjs';

test('VYNDI intent is a versioned CloudEvent with governed correlation and no provider coupling', () => {
  const event=createVyndiIntentEvent({
    eventId:'evt-1',
    source:'urn:vyndi:procurement',
    occurredAt:'2026-10-08T00:00:00.000Z',
    missionId:'mission-1',
    intentId:'intent-1',
    idempotencyKey:'intent-1',
    actionType:'PROCUREMENT.SUPPLIER_ONBOARD',
    capability:'workflow.orchestrate',
    riskClass:'medium',
    dataClassification:'confidential',
    authorityRef:'authority:procurement-manager',
    approvalRef:'approval:42',
    input:{supplierId:'SUP-42'},
  });

  assert.equal(event.specversion,'1.0');
  assert.equal(event.type,'com.vyndi.vaos.intent.v1');
  assert.equal(event.subject,'intent-1');
  assert.equal(event.data.intentId,'intent-1');
  assert.equal(event.data.idempotencyKey,'intent-1');
  assert.equal(event.data.capability,'workflow.orchestrate');
  assert.equal('providerId' in event.data,false);
  assert.deepEqual(event.data.input,{supplierId:'SUP-42'});
});

test('provider-specific routing fields are rejected from VYNDI business intent', () => {
  assert.throws(()=>createVyndiIntentEvent({
    eventId:'evt-1',source:'urn:vyndi:test',occurredAt:'2026-10-08T00:00:00.000Z',
    missionId:'m',intentId:'i',idempotencyKey:'i',actionType:'X.Y',
    capability:'workflow.orchestrate',riskClass:'low',dataClassification:'internal',
    authorityRef:'a',input:{x:1},providerId:'n8n',
  }),/VYNDI_INTENT_PROVIDER_COUPLING_FORBIDDEN/);
});

test('VAOS result event returns verified evidence and provider execution identity without claiming domain authority', () => {
  const event=createVaosResultEvent({
    eventId:'evt-r1',source:'urn:vaos:execution',occurredAt:'2026-10-08T00:00:01.000Z',
    missionId:'mission-1',intentId:'intent-1',executionJobId:'job-1',
    status:'SUCCEEDED',providerId:'n8n',providerRunId:'run-1',
    effectRef:'effect:supplier-onboard:42',
    evidenceRefs:['evidence:run-1','r2:sha256:abc'],
  });

  assert.equal(event.type,'com.vaos.vyndi.result.v1');
  assert.equal(event.subject,'intent-1');
  assert.equal(event.data.status,'SUCCEEDED');
  assert.equal(event.data.executionJobId,'job-1');
  assert.equal(event.data.providerRunId,'run-1');
  assert.deepEqual(event.data.evidenceRefs,['evidence:run-1','r2:sha256:abc']);
  assert.equal(event.data.canonicalStateUpdated,false);
});

test('unknown outcome is first-class in return contract', () => {
  const event=createVaosResultEvent({
    eventId:'evt-r2',source:'urn:vaos:execution',occurredAt:'2026-10-08T00:00:01.000Z',
    missionId:'mission-1',intentId:'intent-1',executionJobId:'job-1',
    status:'UNKNOWN',providerId:'zapier',providerRunId:null,
    effectRef:null,evidenceRefs:['evidence:dispatch'],
  });
  assert.equal(event.data.status,'UNKNOWN');
  assert.equal(event.data.canonicalStateUpdated,false);
});

test('inbound VYNDI intent validation rejects malformed CloudEvents and unsupported versions', () => {
  const good=createVyndiIntentEvent({
    eventId:'evt-1',source:'urn:vyndi:test',occurredAt:'2026-10-08T00:00:00.000Z',
    missionId:'m',intentId:'i',idempotencyKey:'i',actionType:'X.Y',
    capability:'workflow.orchestrate',riskClass:'low',dataClassification:'internal',
    authorityRef:'a',input:{x:1},
  });

  assert.equal(validateVyndiIntentEvent(good).intentId,'i');
  assert.throws(()=>validateVyndiIntentEvent({...good,specversion:'0.3'}),/VYNDI_EVENT_INVALID:specversion/);
  assert.throws(()=>validateVyndiIntentEvent({...good,type:'com.vyndi.vaos.intent.v2'}),/VYNDI_EVENT_UNSUPPORTED_TYPE/);
});

test('intent validation clones input so caller mutation cannot alter authorized event content', () => {
  const input={supplier:{id:'SUP-1'}};
  const event=createVyndiIntentEvent({
    eventId:'evt-1',source:'urn:vyndi:test',occurredAt:'2026-10-08T00:00:00.000Z',
    missionId:'m',intentId:'i',idempotencyKey:'i',actionType:'X.Y',
    capability:'workflow.orchestrate',riskClass:'low',dataClassification:'internal',
    authorityRef:'a',input,
  });
  input.supplier.id='MUTATED';
  assert.equal(event.data.input.supplier.id,'SUP-1');
});
