import test from 'node:test';
import assert from 'node:assert/strict';
import {createElevenLabsSpeech,ELEVENLABS_PROFILE,ELEVENLABS_SAMPLE,elevenLabsConfiguration} from './text-to-speech.mjs';

function bucket(){let record=null,version=0;return {
 async get(){if(!record)return null;const snapshot=structuredClone(record),etag=String(version);return {etag,json:async()=>snapshot};},
 async put(_key,text,options){if(options.onlyIf.etagMatches!==undefined&&options.onlyIf.etagMatches!==String(version)||options.onlyIf.etagDoesNotMatch==='*'&&record)return null;record=JSON.parse(text);return {etag:String(++version)};},
 record:()=>record
};}
const free={tier:'free',character_count:0,character_limit:10000,max_credit_limit_extension:0,can_extend_character_limit:false,allowed_to_extend_character_limit:false};
function setup(subscription=free){
 let conversions=0,reads=0,options;
 const env={ELEVENLABS_API_KEY:'fixture-not-a-key',VAOS_ELEVENLABS_CONTROL:'free-personal-v1',VAOS_ARTIFACTS:bucket()};
 const dependencies={env,text:ELEVENLABS_SAMPLE,fetcher:async url=>{reads++;return Response.json(url.endsWith('/subscription')?subscription:{voice_id:ELEVENLABS_PROFILE.voiceId,category:'premade'});},clientFactory:()=>({textToSpeech:{convert:async(voice,body,requestOptions)=>{conversions++;options=requestOptions;assert.equal(voice,ELEVENLABS_PROFILE.voiceId);assert.equal(body.modelId,'eleven_v4');const bytes=new Uint8Array(100);bytes.set([0x49,0x44,0x33]);return new ReadableStream({start(c){c.enqueue(bytes);c.close();}});}}})};
 return {dependencies,env,conversions:()=>conversions,reads:()=>reads,options:()=>options};
}
test('fixed free audition uses the official SDK once, reserves quota and never enables a platform fallback',async()=>{
 const t=setup(),bytes=await createElevenLabsSpeech(t.dependencies);assert.equal(bytes.length,100);assert.equal(t.conversions(),1);assert.equal(t.reads(),2);assert.equal(t.options().maxRetries,0);assert.equal(t.env.VAOS_ARTIFACTS.record().used,ELEVENLABS_SAMPLE.length);assert.equal(t.env.VAOS_ARTIFACTS.record().activeUntil,0);assert.equal(elevenLabsConfiguration(t.env).commercialUseQualified,false);assert.equal(elevenLabsConfiguration(t.env).platformFallback,false);
});
test('paid plans, overage, unknown entitlements and exhausted free quota cannot synthesize',async()=>{
 for(const sub of [{...free,tier:'starter'},{...free,max_credit_limit_extension:100},{...free,allowed_to_extend_character_limit:true},{...free,can_extend_character_limit:true},{...free,character_count:10000},{...free,character_limit:20000},{}]){
  const t=setup(sub);await assert.rejects(createElevenLabsSpeech(t.dependencies),/ELEVENLABS_/);assert.equal(t.conversions(),0);assert.equal(t.env.VAOS_ARTIFACTS.record(),null);
 }
});
test('unapproved mode, invalid text and unsupported language are rejected before provider calls',async()=>{
 const t=setup();await assert.rejects(createElevenLabsSpeech({...t.dependencies,text:'x'.repeat(601)}),/TEXT_INVALID/);await assert.rejects(createElevenLabsSpeech({...t.dependencies,language:'ta-IN'}),/LANGUAGE_UNAVAILABLE/);assert.equal(t.reads(),0);assert.equal(elevenLabsConfiguration({}).ready,false);
 await assert.rejects(createElevenLabsSpeech({...t.dependencies,env:{}}),/NOT_CONFIGURED/);
});
test('approved personal mode accepts bounded question readback with the same free-only checks',async()=>{
 const t=setup();assert.equal((await createElevenLabsSpeech({...t.dependencies,text:'An answer in this personal test.'})).length,100);assert.equal(t.conversions(),1);assert.equal(elevenLabsConfiguration(t.env).personalNoncommercialOnly,true);
});
test('concurrent requests cannot race the shared budget and failed synthesis is never retried/refunded',async()=>{
 const t=setup();let release;
 t.dependencies.clientFactory=()=>({textToSpeech:{convert:async()=>{await new Promise(resolve=>{release=resolve;});throw Error('provider error containing a secret');}}});
 const first=createElevenLabsSpeech(t.dependencies);while(!release)await new Promise(r=>setImmediate(r));
 await assert.rejects(createElevenLabsSpeech(t.dependencies),/BUSY/);release();await assert.rejects(first,/^Error: ELEVENLABS_SYNTHESIS_UNAVAILABLE$/);
 assert.equal(t.env.VAOS_ARTIFACTS.record().used,ELEVENLABS_SAMPLE.length);
});
test('daily preview budget is durable and caps free-credit consumption across requests',async()=>{
 const t=setup();for(let i=0;i<Math.floor(1000/ELEVENLABS_SAMPLE.length);i++)await createElevenLabsSpeech(t.dependencies);
 await assert.rejects(createElevenLabsSpeech(t.dependencies),/DAILY_LIMIT/);
 assert.ok(t.env.VAOS_ARTIFACTS.record().used<=1000);
});
