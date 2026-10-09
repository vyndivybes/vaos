import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlackNotificationAdapter} from './notification-adapter.mjs';

const event={eventId:'evt-001',kind:'provider.hold',severity:'warning',summary:'Provider held pending verification',evidenceRef:'qual:42'};
function setup(overrides={}){
  const calls=[];
  const transport={async request(input){calls.push(input);return {status:200,body:{ok:true,channel:'C0C90LK78KA',ts:'1791580014.000001'}}}};
  return {calls,adapter:createSlackNotificationAdapter({token:'xoxb-test',channelId:'C0C90LK78KA',enabled:true,transport,...overrides})};
}
test('sends a bounded allowlisted status, verifies Slack acknowledgment and returns evidence reference',async()=>{
  const {adapter,calls}=setup();
  const r=await adapter.execute({id:'job-1',intentId:'intent-1',payload:event});
  assert.equal(r.providerId,'slack');
  assert.equal(r.capability,'notification.send');
  assert.equal(r.verification.verified,true);
  assert.equal(r.providerRunId,'1791580014.000001');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://slack.com/api/chat.postMessage');
  assert.equal(calls[0].headers.Authorization,'Bearer xoxb-test');
  assert.equal(calls[0].body.channel,'C0C90LK78KA');
  assert.equal(calls[0].body.metadata.event_payload.eventId,'evt-001');
  assert.equal(calls[0].body.text.includes('xoxb-test'),false);
});
test('disabled or unconfigured is fail closed, no calls',async()=>{
  const {adapter,calls}=setup({enabled:false});
  await assert.rejects(()=>adapter.execute({id:'job',intentId:'i',payload:event}),/SLACK_DISABLED/);
  assert.equal(calls.length,0);
  assert.throws(()=>createSlackNotificationAdapter({enabled:true,channelId:'C0C90LK78KA',transport:{request(){}}}),/SLACK_TOKEN_REQUIRED/);
});
test('unsafe event types and messages are rejected before network use',async()=>{
  const {adapter,calls}=setup();
  for(const payload of [
    {...event,kind:'security.secret'},
    {...event,summary:'a'.repeat(500)},
    {...event,token:'should-never-send'},
    {...event,summary:'hello <@U123> malicious ping'},
  ])await assert.rejects(()=>adapter.execute({id:'job',intentId:'i',payload}),/SLACK_EVENT_INVALID/);
  assert.equal(calls.length,0);
});
test('provider errors do not expose tokens or message content',async()=>{
  const {adapter}=setup({transport:{async request(){return{status:200,body:{ok:false,error:'invalid_auth'}}}}});
  await assert.rejects(()=>adapter.execute({id:'job',intentId:'i',payload:event}),e=>e.code==='SLACK_DELIVERY_REJECTED'&&!e.message.includes('invalid_auth'));
});
test('network uncertainty stops automatic retry and requires reconciliation',async()=>{
  const {adapter}=setup({transport:{async request(){throw new Error('xoxb-private')}}});
  await assert.rejects(()=>adapter.execute({id:'job',intentId:'i',payload:event}),e=>e.code==='SLACK_DELIVERY_UNCERTAIN'&&e.outcomeUnknown===true&&e.retryable===false);
});
test('Slack response must match selected channel and contain timestamp',async()=>{
  const {adapter}=setup({transport:{async request(){return{status:200,body:{ok:true,channel:'CWRONG',ts:'1791580014.000001'}}}}});
  await assert.rejects(()=>adapter.execute({id:'job',intentId:'i',payload:event}),/SLACK_DELIVERY_UNVERIFIED/);
});
