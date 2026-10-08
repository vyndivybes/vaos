import test from 'node:test';
import assert from 'node:assert/strict';
import { createVyndiIntentEvent } from '../../packages/contracts/vyndi-vaos-events.mjs';
import { createInMemoryVyndiIngressStore, createVyndiIntentIngress } from './vyndi-intent-ingress.mjs';

function event(overrides={}){
  return createVyndiIntentEvent({
    eventId:'evt-1',source:'urn:vyndi:test',occurredAt:'2026-10-08T00:00:00.000Z',
    missionId:'mission-1',intentId:'intent-1',idempotencyKey:'idem-1',actionType:'X.Y',
    capability:'workflow.orchestrate',riskClass:'medium',dataClassification:'internal',
    authorityRef:'authority:1',input:{x:1},...overrides,
  });
}

test('valid VYNDI intent is accepted exactly once by idempotency key',async()=>{
  const store=createInMemoryVyndiIngressStore();
  const ingress=createVyndiIntentIngress({store});
  const first=await ingress.receive(event());
  const replay=await ingress.receive(event());
  assert.equal(first.status,'ACCEPTED');
  assert.equal(replay.status,'REPLAY');
  assert.equal(store.listAccepted().length,1);
});

test('same idempotency key with different immutable identity is quarantined',async()=>{
  const store=createInMemoryVyndiIngressStore();
  const ingress=createVyndiIntentIngress({store});
  await ingress.receive(event());
  const conflict=event({eventId:'evt-2',intentId:'intent-2'});
  const result=await ingress.receive(conflict);
  assert.equal(result.status,'QUARANTINED');
  assert.equal(result.reasonCode,'VYNDI_IDEMPOTENCY_CONFLICT');
  assert.equal(store.listQuarantine().length,1);
});

test('malformed or provider-coupled event is quarantined rather than executed',async()=>{
  const store=createInMemoryVyndiIngressStore();
  const ingress=createVyndiIntentIngress({store});
  const malformed={...event(),data:{...event().data,providerId:'n8n'}};
  const result=await ingress.receive(malformed);
  assert.equal(result.status,'QUARANTINED');
  assert.match(result.reasonCode,/VYNDI_/);
  assert.equal(store.listAccepted().length,0);
});

test('quarantined item can only replay with explicit authority and corrected valid event',async()=>{
  const store=createInMemoryVyndiIngressStore();
  const ingress=createVyndiIntentIngress({store});
  const malformed={...event(),specversion:'0.3'};
  const q=await ingress.receive(malformed);
  await assert.rejects(()=>ingress.replay({
    quarantineId:q.quarantineId,correctedEvent:event(),authorityRef:'',reason:'fixed schema',
  }),/VYNDI_REPLAY_AUTHORITY_REQUIRED/);

  const result=await ingress.replay({
    quarantineId:q.quarantineId,correctedEvent:event(),authorityRef:'approval:replay-1',reason:'schema corrected',
  });
  assert.equal(result.status,'ACCEPTED');
  assert.equal(store.getQuarantine(q.quarantineId).replayed,true);
});

test('replay cannot bypass validation by supplying another invalid event',async()=>{
  const store=createInMemoryVyndiIngressStore();
  const ingress=createVyndiIntentIngress({store});
  const q=await ingress.receive({...event(),specversion:'0.3'});
  await assert.rejects(()=>ingress.replay({
    quarantineId:q.quarantineId,correctedEvent:{...event(),type:'unsupported'},
    authorityRef:'approval:1',reason:'attempt',
  }),/VYNDI_REPLAY_EVENT_INVALID/);
  assert.equal(store.getQuarantine(q.quarantineId).replayed,false);
});

test('audit metadata excludes business input payload',async()=>{
  const audit=[];
  const ingress=createVyndiIntentIngress({
    store:createInMemoryVyndiIngressStore(),
    recordAudit:async e=>audit.push(e),
  });
  await ingress.receive(event({input:{secretBusinessValue:'do-not-audit'}}));
  assert.equal(JSON.stringify(audit).includes('do-not-audit'),false);
});
