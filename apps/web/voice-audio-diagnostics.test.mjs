import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVoiceAudioDiagnostics} from './voice-audio-diagnostics.mjs';

test('short browser speech reports QUEUED, STARTED and COMPLETED distinctly',()=>{
 const statuses=[];let utterance;
 class FakeUtterance{constructor(text){this.text=text;}}
 const speechSynthesis={
   getVoices:()=>[{lang:'en-US',name:'English'}],
   speak:u=>{utterance=u;},
   cancel:()=>{},
   speaking:false,pending:false,paused:false,
 };
 const diag=createVoiceAudioDiagnostics({
   SpeechSynthesisUtteranceClass:FakeUtterance,
   speechSynthesis,onStatus:text=>statuses.push(text),
 });
 assert.equal(diag.testShortSpeech(),true);
 assert.match(statuses.at(-1),/queued/i);
 assert.doesNotMatch(statuses.at(-1),/started|completed/i);
 assert.equal(utterance.text,'Hello. VAOS speaker test.');
 assert.equal(utterance.lang,'en-US');
 utterance.onstart();
 assert.match(statuses.at(-1),/started/i);
 utterance.onend();
 assert.match(statuses.at(-1),/completed/i);
});

test('unsupported speech and browser TTS errors surface useful diagnostic codes',()=>{
 const statuses=[];
 const bad=createVoiceAudioDiagnostics({onStatus:x=>statuses.push(x)});
 assert.equal(bad.testShortSpeech(),false);
 assert.match(statuses.at(-1),/unavailable/i);
 let utterance;
 const diag=createVoiceAudioDiagnostics({
  SpeechSynthesisUtteranceClass:class{constructor(s){this.text=s;}},
  speechSynthesis:{speak:u=>{utterance=u;},cancel(){},getVoices(){return[]}},
  onStatus:x=>statuses.push(x),
 });
 assert.equal(diag.testShortSpeech(),true);
 utterance.onerror({error:'voice-unavailable'});
 assert.match(statuses.at(-1),/voice-unavailable/i);
});

test('manual stop invalidates late speech events',()=>{
 const statuses=[];let utterance,cancels=0;
 const diag=createVoiceAudioDiagnostics({
   SpeechSynthesisUtteranceClass:class{constructor(t){this.text=t;}},
   speechSynthesis:{speak:u=>{utterance=u;},cancel:()=>{cancels++;}},
   onStatus:x=>statuses.push(x),
 });
 diag.testShortSpeech();
 diag.stopSpeech();
 const last=statuses.at(-1);
 utterance.onstart();
 utterance.onend();
 assert.equal(statuses.at(-1),last);
 assert.equal(cancels,1);
});

test('speaker tone never sends data and reports the independent output path',async()=>{
 let oscillator,gain,closed=0;
 class FakeContext{
   constructor(){this.currentTime=12;this.destination={};}
   async resume(){}
   createOscillator(){oscillator={frequency:{value:0},connect(){},start(){this.started=true;},stop(t){this.stoppedAt=t;}};return oscillator;}
   createGain(){gain={gain:{value:0},connect(){}};return gain;}
   async close(){closed++;}
 }
 const statuses=[];
 const diag=createVoiceAudioDiagnostics({AudioContextClass:FakeContext,onStatus:x=>statuses.push(x)});
 assert.equal(await diag.testTone(),true);
 assert.equal(oscillator.frequency.value,660);
 assert.equal(oscillator.stoppedAt,12.55);
 assert.match(statuses.at(-1),/tone started/i);
 await oscillator.onended();
 assert.equal(closed,1);
});

test('Founder Command diagnostics are founder-flag gated and do not call backend writes',async()=>{
 const page=await readFile(new URL('./founder-console.html',import.meta.url),'utf8');
 const browser=await readFile(new URL('./voice-pilot-browser.mjs',import.meta.url),'utf8');
 for(const id of ['voice-tone-test','voice-short-test','voice-audio-diagnostics']){
   assert.match(page,new RegExp('id="'+id+'"'));
 }
 assert.match(browser,/createVoiceAudioDiagnostics/);
 assert.match(browser,/voiceToneTest\.disabled=!enabled/);
 assert.match(browser,/voiceShortTest\.disabled=!enabled/);
 assert.doesNotMatch(browser,/fetch\(['"]\/api\/(?:intents|executions|approvals)/);
});
