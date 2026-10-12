import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSlackSigningCommissioning} from './slack-signing-commissioning.mjs';

const secure=[{name:'VAOS_SLACK_SIGNING_SECRET_SECURE',type:'secret_text'},
 {name:'SLACK_BOT_TOKEN',type:'secret_text'}];
test('Plaintext signing binding without encrypted replacement is a commissioning HOLD',()=>{
 const x=assessSlackSigningCommissioning([{name:'SLACK_SIGNING_SECRET',type:'plain_text'},
  {name:'SLACK_BOT_TOKEN',type:'secret_text'}]);
 assert.equal(x.state,'HOLD');
 assert.deepEqual(x.holds,['ENCRYPTED_SIGNING_BINDING_ABSENT','PLAINTEXT_LEGACY_BINDING_PRESENT','SIGNED_EVENT_DELIVERY_UNVERIFIED']);
 assert.equal(x.commissioned,false);
});
test('Both bindings is migration, never acceptance until legacy removed and live signature verified',()=>{
 const x=assessSlackSigningCommissioning([...secure,{name:'SLACK_SIGNING_SECRET',type:'plain_text'}],{signedEventVerified:true});
 assert.equal(x.state,'HOLD');
 assert.deepEqual(x.holds,['PLAINTEXT_LEGACY_BINDING_PRESENT']);
});
test('Secret metadata alone cannot pretend to certify signed Slack event delivery',()=>{
 const x=assessSlackSigningCommissioning(secure);
 assert.equal(x.state,'HOLD');assert.deepEqual(x.holds,['SIGNED_EVENT_DELIVERY_UNVERIFIED']);
 const passed=assessSlackSigningCommissioning(secure,{signedEventVerified:true});
 assert.equal(passed.state,'PASS');assert.equal(passed.commissioned,true);
 assert.equal(passed.dataSource,'BINDING_METADATA_ONLY');
});
test('Wrong type, absent bot token, malformed evidence and extra secret values never leak',()=>{
 const secretValue='NO_SHOW_TOP_SECRET';
 const v=assessSlackSigningCommissioning([
  {name:'VAOS_SLACK_SIGNING_SECRET_SECURE',type:'plain_text',text:secretValue},
  {name:'SLACK_BOT_TOKEN',type:'plain_text',text:secretValue}],{signedEventVerified:true});
 assert.equal(v.state,'HOLD');
 assert.ok(v.holds.includes('SIGNING_BINDING_NOT_ENCRYPTED'));
 assert.ok(v.holds.includes('BOT_TOKEN_NOT_ENCRYPTED'));
 assert.equal(JSON.stringify(v).includes(secretValue),false);
 assert.equal(assessSlackSigningCommissioning(secure,{signedEventVerified:'true'}).state,'HOLD');
});
