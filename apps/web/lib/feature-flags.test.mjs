import test from 'node:test';
import assert from 'node:assert/strict';
import {featureControl} from './feature-flags.mjs';

const flags = {
 VAOS_FEDERATED_KNOWLEDGE_CONTROL:'founder-readonly-v1',
 VAOS_LANGGRAPH_CONTROL:'read-only-v1',
 VAOS_PRODUCTION_OBSERVER_CONTROL:'read-only-v1',
 VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1'
};

test('four controls retain exact expected values from consolidated configuration',()=>{
 const env={VAOS_FEATURE_FLAGS:JSON.stringify(flags)};
 for(const [name,value] of Object.entries(flags))assert.equal(featureControl(env,name),value);
});

test('legacy controls take precedence during staggered migration',()=>{
 const env={VAOS_FEATURE_FLAGS:JSON.stringify(flags),VAOS_LANGGRAPH_CONTROL:'disabled'};
 assert.equal(featureControl(env,'VAOS_LANGGRAPH_CONTROL'),'disabled');
 assert.equal(featureControl(env,'VAOS_SLACK_AGENT_CONTROL'),'founder-readonly-v1');
});

test('invalid or missing consolidated configuration fails closed',()=>{
 for(const raw of [undefined,'','{bad}','null','[]','true','123',JSON.stringify({VAOS_SLACK_AGENT_CONTROL:true})])
  assert.equal(featureControl({VAOS_FEATURE_FLAGS:raw},'VAOS_SLACK_AGENT_CONTROL'),undefined);
});

test('unapproved names cannot be resolved from the bundle',()=>{
 const env={VAOS_FEATURE_FLAGS:JSON.stringify({...flags,GOOGLE_OAUTH_CLIENT_SECRET:'not-a-secret'})};
 assert.equal(featureControl(env,'GOOGLE_OAUTH_CLIENT_SECRET'),undefined);
});
