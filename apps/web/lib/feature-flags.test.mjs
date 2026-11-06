import test from 'node:test';
import assert from 'node:assert/strict';
import {featureControl} from './feature-flags.mjs';
import {readFile} from 'node:fs/promises';

const flags = {
 VAOS_FEDERATED_KNOWLEDGE_CONTROL:'founder-readonly-v1',
 VAOS_LANGGRAPH_CONTROL:'read-only-v1',
 VAOS_PRODUCTION_OBSERVER_CONTROL:'read-only-v1',
 VAOS_SLACK_AGENT_CONTROL:'founder-readonly-v1',
 VAOS_MULTIMODAL_CONTROL:'founder-preview-only-v1'
};

test('five controls retain exact expected values from consolidated configuration',()=>{
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

test('ElevenLabs personal control uses the existing bundle without adding a billable-plan variable slot',async()=>{
 const config=JSON.parse(await readFile(new URL('../../../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(Object.hasOwn(config.vars,'VAOS_ELEVENLABS_CONTROL'),false);
 assert.equal(Object.hasOwn(config.vars,'ELEVENLABS_API_KEY'),false);
 assert.equal(featureControl(config.vars,'VAOS_ELEVENLABS_CONTROL'),'free-personal-v1');
 for(const [name,value] of Object.entries(flags))assert.equal(featureControl(config.vars,name),value);
});

test('Neural founder read flag fits the existing feature bundle without consuming a new Worker variable',async()=>{
 const config=JSON.parse(await readFile(new URL('../../../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(Object.hasOwn(config.vars,'VAOS_NEURAL_KNOWLEDGE_CONTROL'),false);
 assert.equal(featureControl(config.vars,'VAOS_NEURAL_KNOWLEDGE_CONTROL'),'founder-readonly-v1');
 assert.equal(featureControl({VAOS_FEATURE_FLAGS:'{}'},'VAOS_NEURAL_KNOWLEDGE_CONTROL'),undefined);
});

test('Daily market monitor uses the consolidated feature flag with no new text binding',async()=>{
 const config=JSON.parse(await readFile(new URL('../../../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(Object.hasOwn(config.vars,'VAOS_MARKET_MONITOR_CONTROL'),false);
 assert.equal(featureControl(config.vars,'VAOS_MARKET_MONITOR_CONTROL'),'founder-daily-readonly-v1');
 assert.equal(featureControl({VAOS_FEATURE_FLAGS:'{}'},'VAOS_MARKET_MONITOR_CONTROL'),undefined);
});
