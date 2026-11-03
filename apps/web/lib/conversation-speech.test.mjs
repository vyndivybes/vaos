import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseConversationSpeech} from './local-speech.mjs';
import {createWakeListener} from './hey-vaos.mjs';
test('local recognition needs no remote consent; unavailable local speech never silently enables browser audio',async()=>{
 let consents=0;const consent=async()=>{consents++;return false;};
 const local={status:'LOCAL_READY',locale:'en-US'};
 assert.equal(await chooseConversationSpeech(local,{consent}),local);assert.equal(consents,0);
 assert.equal((await chooseConversationSpeech(null,{RecognitionClass:class{},consent})).status,'LOCAL_UNAVAILABLE');assert.equal(consents,1);
 assert.deepEqual(await chooseConversationSpeech(null,{RecognitionClass:class{},language:'ta',consent:async()=>true}),{status:'BROWSER_READY',locale:'ta-IN'});
});
test('Stop listening ends the microphone session and rejects late results',()=>{
 let r,submits=0,aborts=0;
 class Recognition{constructor(){r=this;}start(){}abort(){aborts++;}}
 const listener=createWakeListener({RecognitionClass:Recognition,onConfirm:()=>submits++});listener.enable();
 r.onresult({results:[{isFinal:true,0:{transcript:'Stop listening'}}]});
 assert.equal(listener.isEnabled(),false);assert.equal(aborts,1);
 r.onresult({results:[{isFinal:true,0:{transcript:'Jarvis search the web for bikes'}}]});assert.equal(submits,0);
});
